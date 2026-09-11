import { differenceInCalendarDays } from "date-fns";
import { CONNECT_META, SIMPLE_CONNECT_META } from "@/lib/steps";
import { ownerOf, isVerifyCode } from "@/lib/verify/types";
import { differenceInHours } from "date-fns";
import { ko } from "@/content/ko";
import type {
  VerifyResult,
  CommentRow,
  ProjectGuestRow,
  ProjectRow,
  StepRow,
} from "@/lib/database.types";

// 「지금 할 일」 — 의뢰인이 한 일 중 내가 대처해야 할 것을 한 줄로 뽑는다.
// 데이터를 새로 만들지 않는다. 이미 있는 상태에서 계산만 한다.
// (실제 사고: 의뢰인이 5단계를 끝내고 질문 3개를 남긴 지 3시간 동안
//  나는 몰랐다 — 열어도 탭을 뒤져야 보였다)

export type TodoTab = "steps" | "scope" | "settings";

export interface TodoItem {
  key: string;
  label: string;
  tab: TodoTab;
  urgent: boolean;
}

export type StepLite = Pick<
  StepRow,
  "key" | "status" | "owner_side" | "verify_result" | "blocked_reason" | "title" | "order_index"
> & Partial<Pick<StepRow, "checked_at" | "updated_at">>;
export type CommentLite = Pick<CommentRow, "author_side" | "read_at" | "deleted_at">;
export type GuestLite = Pick<ProjectGuestRow, "last_seen_at">;
export type ProjectLite = Pick<
  ProjectRow,
  "status" | "scope_md" | "scope_agreed_at" | "created_at" | "access_sent_at"
> & Partial<Pick<ProjectRow, "support_tier">>;

const NOT_SEEN_AFTER_DAYS = 3;
const NOT_SEEN_CALL_DAYS = 5; // 카톡으로도 답이 없으면 전화

export function buildTodos(
  project: ProjectLite,
  steps: StepLite[],
  comments: CommentLite[],
  guests: GuestLite[],
  now: Date = new Date(),
): TodoItem[] {
  if (project.status === "closed") return [];
  const copy = ko.admin.todo;
  const items: TodoItem[] = [];

  const needHelp = steps.filter(
    (step) => step.status === "blocked" && step.blocked_reason === "need_help",
  ).length;
  const blocked = steps.filter(
    (step) => step.status === "blocked" && step.blocked_reason !== "need_help",
  ).length;
  // 내 쪽 설정 문제(토큰·이메일)만 「확인 실패」다. 일시 오류(system)는 조용히 재시도 중이다
  const verifyError = steps.filter(
    (step) =>
      step.verify_result?.status === "error" &&
      ownerOf(step.verify_result) !== "system" &&
      step.status !== "verified" &&
      step.status !== "skipped",
  ).length;
  const unread = comments.filter(
    (comment) =>
      comment.author_side === "client" && !comment.read_at && !comment.deleted_at,
  ).length;

  if (needHelp > 0) {
    items.push({ key: "needHelp", label: copy.needHelp(needHelp), tab: "steps", urgent: true });
  }
  if (blocked > 0) {
    items.push({ key: "blocked", label: copy.blocked(blocked), tab: "steps", urgent: true });
  }
  if (verifyError > 0) {
    items.push({ key: "verifyError", label: copy.verifyError(verifyError), tab: "steps", urgent: true });
  }
  if (unread > 0) {
    items.push({ key: "unread", label: copy.unread(unread), tab: "steps", urgent: true });
  }
  // 완료 요청이 끝나지 않은 단계 — 원인 코드가 「누가 다음에 움직이는가」를 말한다
  let clientRetries = 0;
  let clientDone = 0; // 원인 코드로 따로 말하지 못한 완료 요청만 센다
  for (const step of steps) {
    if (step.status !== "client_done" && step.status !== "returned") continue;
    const result = step.verify_result;
    const code = result?.code;
    const service = CONNECT_META[step.key]?.serviceName ?? SIMPLE_CONNECT_META[step.key]?.serviceName ?? step.title;
    clientRetries = Math.max(clientRetries, result?.client_attempts ?? 0);
    if (code === "pending_accept") {
      items.push({ key: `invite-${step.key}`, label: copy.pendingAccept(service), tab: "steps", urgent: true });
    } else if (code === "await_admin_first" || code === "await_admin_ack") {
      if (result?.admin_first_ack === "came") {
        // 수락했는데 1시간 넘게 API 에 안 보이면 팀 주소가 틀렸을 가능성이 크다 — 급한 칩으로
        // 기준은 「수락했음」을 누른 시각이다 — checked_at 은 자동 재확인마다 밀려 칩이 깜빡인다
        const hours = differenceInHours(now, new Date(result.admin_first_ack_at ?? result.first_failed_at ?? result.checked_at));
        items.push(
          hours >= 1
            ? { key: `invite-${step.key}`, label: copy.acceptedNotVisible(service, hours), tab: "steps", urgent: true }
            : { key: `invite-${step.key}`, label: copy.acceptedWaiting(service), tab: "steps", urgent: false },
        );
        continue;
      }
      const hours = differenceInHours(now, new Date(result?.first_failed_at ?? step.checked_at ?? now));
      items.push({ key: `invite-${step.key}`, label: copy.awaitAdmin(service, hours), tab: "steps", urgent: true });
    } else if (ownerOf(result) === "client" && isVerifyCode(code)) {
      items.push({ key: `client-${step.key}`, label: copy.clientCause(service, ko.admin.verifyCode[code]), tab: "steps", urgent: false });
    } else if (ownerOf(result) === "system") {
      if ((result?.auto_checks ?? 0) >= 3) {
        items.push({ key: `system-${step.key}`, label: copy.systemStuck(service), tab: "steps", urgent: false });
      }
    } else if (ownerOf(result) !== "admin") {
      clientDone += 1;
    }
  }
  // slug 는 저장했는데 이틀째 완료 요청이 없다 — 조용히 붙잡고 있는 의뢰인
  for (const step of steps) {
    if (step.status !== "doing" || !CONNECT_META[step.key] || !step.updated_at) continue;
    if (differenceInHours(now, new Date(step.updated_at)) >= 48) {
      items.push({ key: `stale-${step.key}`, label: copy.slugStale(step.title), tab: "steps", urgent: false });
    }
  }
  if (project.support_tier !== "assisted" && (clientRetries >= 3 || needHelp >= 2)) {
    items.push({ key: "suggestAssisted", label: copy.suggestAssisted, tab: "settings", urgent: false });
  }
  if (clientDone > 0) {
    items.push({ key: "verify", label: copy.verify(clientDone), tab: "steps", urgent: false });
  }
  if (!project.scope_md?.trim()) {
    items.push({ key: "scopeMissing", label: copy.scopeMissing, tab: "scope", urgent: false });
  } else if (!project.scope_agreed_at) {
    items.push({ key: "scopeUnconfirmed", label: copy.scopeUnconfirmed, tab: "scope", urgent: false });
  }
  if (guests.length === 0) {
    items.push({ key: "noGuest", label: copy.noGuest, tab: "settings", urgent: true });
  } else if (!project.access_sent_at && guests.every((guest) => !guest.last_seen_at)) {
    // 접속 안내를 보낸 기록이 없고 아무도 들어온 적 없다 — 의뢰인은 아직 이 포털을 모른다
    items.push({ key: "accessNotSent", label: copy.accessNotSent, tab: "settings", urgent: true });
  } else if (guests.every((guest) => !guest.last_seen_at)) {
    // 미접속 일수는 「보낸 날」부터 센다 (만든 날부터 세면 보내기 전부터 재촉한다)
    const days = differenceInCalendarDays(now, new Date(project.access_sent_at ?? project.created_at));
    if (days >= NOT_SEEN_CALL_DAYS) {
      items.push({ key: "notSeen", label: copy.notSeenCall(days), tab: "settings", urgent: true });
    } else if (days >= NOT_SEEN_AFTER_DAYS) {
      items.push({ key: "notSeen", label: copy.notSeen(days), tab: "settings", urgent: false });
    }
  }
  return items;
}

// 아직 끝나지 않은 상태(내 확인 대기 포함) — 제작자 단계 판정용
const OPEN: ReadonlySet<StepRow["status"]> = new Set(["todo", "doing", "blocked", "client_done", "returned"]);
// 의뢰인 손에 있는 상태 — client_done은 의뢰인이 끝내고 「내」 확인을 기다리는 것이다 (§5)
const CLIENT_OPEN: ReadonlySet<StepRow["status"]> = new Set(["todo", "doing", "blocked", "returned"]);

// 의뢰인이 다음에 할 단계 — 순서상 첫 번째로 아직 의뢰인 손에 있는 단계
// 온보딩 국면의 의뢰인 단계 = 첫 제작자(agency) 단계보다 앞에 있는 의뢰인 단계.
// 기본 템플릿의 「도메인 연결」은 「개발 진행」 뒤라 여기 들어가지 않는다 — 상태 전이·리마인드·
// 「다음 단계」 문구가 전부 이 하나의 집합을 읽는다
// 리마인드 정지 조건 (설계 §4-4 a~h) — 문구를 「만들 때」와 pending 카드를 「거둘 때」가 같은 규칙을 읽는다.
// 하나라도 참이면 그 프로젝트에 리마인드 문구는 없다. 이유 문자열은 tick 보고용.
const REMINDER_QUIET_COMMENT_MS = 7 * 24 * 60 * 60_000;

export function reminderStopReason(
  project: { status: string; support_tier: string; remind_paused_until: string | null },
  steps: { status: string; verify_result?: VerifyResult | null }[],
  clientComments: { read_at: string | null; created_at: string }[],
  now: Date,
): string | null {
  if (project.status !== "onboarding") return "not_onboarding"; // (a)(h) 종료·개발 시작 뒤에는 재촉하지 않는다
  if (project.support_tier === "assisted") return "assisted"; // (b) 화면공유로 함께 한다
  if (project.remind_paused_until && project.remind_paused_until > now.toISOString()) return "paused"; // (g)
  // 끝난 단계의 낡은 결과는 보지 않는다 — 그러면 한 번의 토큰 오류가 영원히 리마인드를 막는다
  const open = steps.filter((step) => step.status !== "verified" && step.status !== "skipped");
  if (open.some((step) => step.status === "blocked")) return "blocked"; // (c)
  if (open.some((step) => step.verify_result?.status === "error" && ownerOf(step.verify_result ?? null) === "admin")) {
    return "admin_error"; // (d) 내 쪽 오류를 의뢰인에게 재촉으로 돌리지 않는다
  }
  if (
    open.some(
      (step) =>
        step.status === "client_done" &&
        ownerOf(step.verify_result ?? null) === "admin" &&
        step.verify_result?.admin_first_ack !== "not_came",
    )
  ) {
    return "my_turn"; // (e) 내가 먼저 움직여야 한다
  }
  const since = new Date(now.getTime() - REMINDER_QUIET_COMMENT_MS).toISOString();
  if (clientComments.some((comment) => comment.created_at > since || !comment.read_at)) return "recent_comment"; // (f)
  return null;
}

export function onboardingClientSteps<T extends { owner_side: string; order_index: number }>(steps: T[]): T[] {
  const firstAgency = steps
    .filter((step) => step.owner_side === "agency")
    .sort((a, b) => a.order_index - b.order_index)[0];
  return steps
    .filter((step) => step.owner_side === "client" && (!firstAgency || step.order_index < firstAgency.order_index))
    .sort((a, b) => a.order_index - b.order_index);
}

export function nextClientStep(steps: StepLite[]): StepLite | null {
  return (
    [...steps]
      .sort((a, b) => a.order_index - b.order_index)
      .find((step) => step.owner_side === "client" && CLIENT_OPEN.has(step.status)) ?? null
  );
}

// 의뢰인이 완료 요청을 보내고 내 확인을 기다리는 단계가 있는가
export function hasClientDone(steps: StepLite[]): boolean {
  return steps.some((step) => step.owner_side === "client" && step.status === "client_done");
}

// 내가 다음에 할 단계 — 의뢰인 단계가 모두 끝났을 때 순서상 첫 제작자 단계
export function nextAgencyStep(steps: StepLite[]): StepLite | null {
  return (
    [...steps]
      .sort((a, b) => a.order_index - b.order_index)
      .find((step) => step.owner_side === "agency" && OPEN.has(step.status)) ?? null
  );
}
