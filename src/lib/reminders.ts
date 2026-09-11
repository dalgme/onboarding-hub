import { createAdminClient } from "@/lib/supabase/admin";
import { createOutbox, portalUrl } from "@/lib/outbox";
import { minuteOf } from "@/lib/notify";
import { CONNECT_META } from "@/lib/steps";
import { onboardingClientSteps, reminderStopReason } from "@/lib/todo";
import { ko } from "@/content/ko";
import type { StepStatus, VerifyResult } from "@/lib/database.types";

// 미진행 리마인드 (D9=A): 의뢰인 다음 단계가 3일째 그대로면 1차, 7일째면 2차(화면공유 제안).
// 허브는 보내지 않는다 — 문구를 「보낼 카톡」에 올릴 뿐이고, 보낼지는 관리자가 정한다.
// 평일 10~18시 KST 에만 만든다. 단계당 2회, 프로젝트당 하루 1건(일일 상한 인덱스).
//
// 정지 조건(하나라도 참이면 그 프로젝트는 리마인드 없음):
//  (a) closed  (b) assisted  (c) blocked 단계 존재  (d) 내 쪽 오류(owner=admin error) 존재
//  (e) 내 차례인 완료 요청(pending_accept·await_admin_*) 존재  (f) 최근 7일 의뢰인 코멘트 또는 미답 질문
//  (g) remind_paused_until 이 미래  (h) 프로젝트가 onboarding 이 아님(개발 뒤의 「도메인 연결」은 재촉 대상이 아니다)
// 「그대로인 기간」의 기준 시각(stallSince) = max(접속 안내 보낸 시각, 직전 의뢰인 단계 확인 시각,
//   이 단계가 마지막으로 움직인 시각(doing: updated_at · returned: 원인 사이클 시작), 마지막 의뢰인 코멘트,
//   리마인드 보류 해제 시각). 진전이 생기면 기준이 옮겨져 새 사이클(새 dedupe 키)이 된다.
// 결제가 필요한 단계(Vercel Pro·Anthropic 크레딧)와 한 번도 접속하지 않은 의뢰인은 문구 대신 칩으로만.

const FIRST_AFTER_MS = 3 * 24 * 60 * 60_000;
const SECOND_AFTER_MS = 7 * 24 * 60 * 60_000;
export const PAYMENT_STEP_KEYS: ReadonlySet<string> = new Set(["connect-vercel", "connect-anthropic"]);
const CLIENT_OPEN: ReadonlySet<StepStatus> = new Set(["todo", "doing", "returned"]);

export function inReminderWindow(now: Date): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60_000);
  const day = kst.getUTCDay();
  const hour = kst.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 10 && hour < 18;
}

type StepLite = {
  id: string;
  key: string;
  title: string;
  status: StepStatus;
  owner_side: string;
  order_index: number;
  updated_at: string;
  checked_at: string | null;
  verified_at: string | null;
  verify_result: VerifyResult | null;
};

// 「그대로인 기간」의 기준점 — 위 주석의 stallSince. 시작한 지 하루 된 단계에 재촉이 가지 않게 전부 max 로 잡는다
export function stallSince(
  step: StepLite,
  steps: StepLite[],
  project: { access_sent_at: string | null; remind_paused_until: string | null; created_at: string },
  lastClientCommentAt: string | null,
): string {
  // 직전 의뢰인 단계는 확인된 것뿐 아니라 건너뛴 것도 센다 — 오늘 건너뛴 단계 때문에 다음 단계가
  // 「7일째」로 계산되면 안 된다
  const previous = steps
    .filter(
      (item) =>
        item.owner_side === "client" &&
        item.order_index < step.order_index &&
        (item.status === "verified" || item.status === "skipped"),
    )
    .sort((a, b) => b.order_index - a.order_index)[0];
  const lastClientMoveAt =
    steps
      .filter((item) => item.owner_side === "client")
      .map((item) => item.checked_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  // 되돌림은 「공이 의뢰인에게 넘어간 시각」이 기준이다. 아직 아무도 손대지 않은 todo 단계는
  // `updated_at` 을 쓰지 않는다 — 선택 단계 삽입처럼 내가 행을 건드리기만 해도 시계가 초기화되면
  // 리마인드 기능 전체가 조용해진다(의뢰인이 실제로 움직인 시각은 아래 lastClientMoveAt 가 본다)
  const ownMove =
    step.status === "returned"
      ? (step.verify_result?.first_failed_at ?? step.updated_at)
      : step.status === "todo"
        ? null
        : step.updated_at;
  const candidates = [
    project.created_at,
    project.access_sent_at,
    previous?.verified_at ?? previous?.updated_at ?? null,
    lastClientMoveAt, // 의뢰인이 다른 단계에서 「완료했습니다」를 누른 시각 — 활동 중인 의뢰인을 재촉하지 않는다
    ownMove,
    lastClientCommentAt,
    project.remind_paused_until,
  ].filter((value): value is string => Boolean(value));
  return candidates.sort().at(-1) ?? project.created_at;
}

export interface ReminderReport {
  created: number;
  skipped: Record<string, number>; // 정지 사유별 건수 (진단용)
}

export async function remindStalled(now: Date): Promise<ReminderReport> {
  const report: ReminderReport = { created: 0, skipped: {} };
  const skip = (reason: string) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
  };
  if (!inReminderWindow(now)) return report;

  const admin = createAdminClient();
  const { data: projects } = await admin
    .from("projects")
    .select("id, code, name, client_name, status, support_tier, scope_md, access_sent_at, remind_paused_until, created_at")
    .eq("status", "onboarding"); // (h)
  if (!projects || projects.length === 0) return report;
  const ids = projects.map((project) => project.id);
  const [{ data: steps }, { data: comments }, { data: guests }] = await Promise.all([
    admin
      .from("steps")
      .select("id, project_id, key, title, status, owner_side, order_index, updated_at, checked_at, verified_at, verify_result")
      .in("project_id", ids),
    admin
      .from("comments")
      .select("project_id, author_side, read_at, created_at")
      .in("project_id", ids)
      .is("deleted_at", null),
    admin.from("project_guests").select("project_id, last_seen_at").in("project_id", ids),
  ]);

  for (const project of projects) {
    const mine = ((steps ?? []) as (StepLite & { project_id: string })[]).filter((step) => step.project_id === project.id);
    const mineComments = (comments ?? []).filter(
      (comment) => comment.project_id === project.id && comment.author_side === "client",
    );
    // 정지 조건 a~h — 거둠(sweepOutbox)과 같은 함수를 읽는다
    const stop = reminderStopReason(project, mine, mineComments, now);
    if (stop) { skip(stop); continue; }
    const seen = (guests ?? []).some((guest) => guest.project_id === project.id && guest.last_seen_at);
    if (!seen) { skip("never_seen"); continue; }

    const next = onboardingClientSteps(mine).find((step) => CLIENT_OPEN.has(step.status));
    if (!next) { skip("no_open_step"); continue; }
    if (PAYMENT_STEP_KEYS.has(next.key)) { skip("payment_step"); continue; }
    // 범위 문서를 내가 아직 쓰지 않았다 — 의뢰인이 「작업 범위 확인」에서 할 수 있는 일이 없다
    if (next.key === "scope-review" && !project.scope_md?.trim()) { skip("scope_missing"); continue; }

    const lastClientComment = mineComments.map((comment) => comment.created_at).sort().at(-1) ?? null;
    const anchor = stallSince(next, mine, project, lastClientComment);
    const stalled = now.getTime() - new Date(anchor).getTime();
    const round = stalled >= SECOND_AFTER_MS ? 2 : stalled >= FIRST_AFTER_MS ? 1 : 0;
    if (round === 0) { skip("fresh"); continue; }

    const meta = CONNECT_META[next.key];
    const body =
      round === 1
        ? ko.outbox.reminderFirst({
            client: project.client_name,
            stepTitle: next.title,
            stepUrl: `${portalUrl(project.code)}/steps/${next.key}`,
            serviceName: meta?.serviceName ?? null,
          })
        : ko.outbox.reminderSecond({ client: project.client_name, stepTitle: next.title });
    const outcome = await createOutbox({
      kind: "reminder",
      projectId: project.id,
      stepId: next.id,
      dedupeKey: `reminder:${project.id}:${next.key}:${minuteOf(anchor)}:${round}`,
      title: ko.outbox.titles.reminder(next.title, round),
      body,
      detail: `round:${round}`,
      push: null, // 09:00 요약이 건수를 알린다
    });
    if (outcome === "created") report.created += 1;
    else skip(outcome);
  }
  return report;
}
