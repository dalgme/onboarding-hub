import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGithubMembership } from "@/lib/verify/github";
import { verifyVercelMembership } from "@/lib/verify/vercel";
import { verifySupabaseMembership } from "@/lib/verify/supabase";
import { classify, isVerifyCode, ownerOf, type VerifyOwner } from "@/lib/verify/types";
import { ADMIN_ACK_KEYS } from "@/lib/steps";
import { pushAdmin, minuteOf } from "@/lib/notify";
import { onStepVerified, onVerifyClientCause } from "@/lib/outbox";
import { ko } from "@/content/ko";
import { redact } from "@/lib/redact";
import type { StepStatus, VerifyResult, VerifyType } from "@/lib/database.types";

// 자동 검증의 단일 진입점. 사람이 「지금 확인」을 누르지 않아도 돈다:
//  - 의뢰인이 「완료했습니다」를 누르는 순간 (trigger: client)
//  - 크론 tick·대시보드·포털이 열릴 때, 백오프 시각이 지난 완료 요청을 다시 (trigger: auto)
//  - 관리자가 「지금 확인」을 누를 때 (trigger: admin) — 비상용
// 결과는 service_role 로 저장한다. 확인되면 그 자리에서 「확인 완료」다 (§5:
// API가 실제 멤버십을 확인한 것이므로 verified 의 뜻 그대로다).

export type AutoVerifyType = Exclude<VerifyType, "manual">;
export type VerifyTrigger = "client" | "admin" | "auto";

const SLUG_COLUMN: Record<AutoVerifyType, "github_org" | "vercel_team" | "supabase_org"> = {
  github: "github_org",
  vercel: "vercel_team",
  supabase: "supabase_org",
};

// 자동 재확인 간격 — 자동 확인 횟수(auto_checks)에 따라 늘어난다.
// 의뢰인이 다시 「완료했습니다」를 누르면 처음부터 다시 센다
const BACKOFF_MS = [5, 30, 120, 360, 1440].map((minutes) => minutes * 60_000);

export function isAutoVerifyType(type: string): type is AutoVerifyType {
  return type === "github" || type === "vercel" || type === "supabase";
}

interface StepContext {
  id: string;
  key: string;
  title: string;
  verify_type: VerifyType;
  status: StepStatus;
  checked_at: string | null;
  verify_result: VerifyResult | null;
  projects: {
    id: string;
    code: string;
    name: string;
    client_name: string;
    status: string;
    github_org: string | null;
    vercel_team: string | null;
    supabase_org: string | null;
  } | null;
}

async function loadStep(stepId: string): Promise<StepContext | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("steps")
    .select(
      "id, key, title, verify_type, status, checked_at, verify_result, projects(id, code, name, client_name, status, github_org, vercel_team, supabase_org)",
    )
    .eq("id", stepId)
    .maybeSingle();
  return (data as unknown as StepContext | null) ?? null;
}

async function compute(type: AutoVerifyType, slug: string | null): Promise<VerifyResult> {
  if (!slug) return classify("no_slug", "조직 이름이 아직 입력되지 않았습니다");
  if (type === "github") return verifyGithubMembership(slug);
  if (type === "vercel") return verifyVercelMembership(slug);
  const admin = createAdminClient();
  const { data: adminRow } = await admin.from("admins").select("email").limit(1).maybeSingle();
  if (!adminRow) return classify("admin_email_missing", "관리자 이메일이 등록되지 않았습니다");
  return verifySupabaseMembership(slug, adminRow.email);
}

// 이전 결과와 트리거로 횟수·다음 확인 시각·최초 실패 시각을 채운다
const SYSTEM_ESCALATE_AFTER = 3;

function withSchedule(
  computed: VerifyResult,
  previous: VerifyResult | null,
  trigger: VerifyTrigger,
): VerifyResult {
  if (computed.status === "verified") return computed;
  let result = computed;
  // 내가 「안 왔음」을 눌렀으면 API 가 여전히 「구분 불가」라고 해도 의뢰인 원인(check_invite)으로 본다.
  // 초대가 실제로 오면 pending_accept·verified 로 바뀌므로 그때 풀린다
  if (previous?.admin_first_ack === "not_came" && result.code === "await_admin_first") {
    result = { ...classify("check_invite", result.detail), checked_at: result.checked_at };
  }
  if (previous?.admin_first_ack && result.status === "not_found") {
    result = { ...result, admin_first_ack: previous.admin_first_ack };
  }
  // 최초 실패 시각은 「같은 원인이 이어지는 동안」 유지한다. 중간에 낀 일시 오류(error)는
  // 원인을 바꾸지 않으므로 리셋하지 않는다 — 리셋되면 재요청 카드가 새 키로 다시 만들어진다
  const sameCause =
    previous !== null &&
    previous.status !== "verified" &&
    (result.status === "error" ||
      previous.status === "error" ||
      (previous.code ?? null) === (result.code ?? null));
  const clientAttempts = (previous?.client_attempts ?? 0) + (trigger === "client" ? 1 : 0);
  const autoChecks =
    trigger === "client" ? 0 : (previous?.auto_checks ?? 0) + (trigger === "auto" ? 1 : 0);
  const delay = BACKOFF_MS[Math.min(autoChecks, BACKOFF_MS.length - 1)];
  return {
    ...result,
    client_attempts: clientAttempts,
    auto_checks: autoChecks,
    next_check_at: new Date(new Date(result.checked_at).getTime() + delay).toISOString(),
    first_failed_at: sameCause && previous?.first_failed_at ? previous.first_failed_at : result.checked_at,
  };
}

export async function runVerification(
  stepId: string,
  trigger: VerifyTrigger,
): Promise<VerifyResult | null> {
  const step = await loadStep(stepId);
  if (!step || !step.projects || !isAutoVerifyType(step.verify_type)) return null;
  // 끝난 단계는 다시 확인하지 않는다 — 의뢰인 세션은 RLS 가 막지만 이 함수는 service_role 이라
  // 여기서도 막아야 verified_at·verify_result 가 덮어써지지 않는다
  if (step.status === "verified" || step.status === "skipped") return step.verify_result;
  const project = step.projects;

  const computed = await compute(step.verify_type, project[SLUG_COLUMN[step.verify_type]]);
  const result = withSchedule(computed, step.verify_result, trigger);

  const admin = createAdminClient();
  const update =
    result.status === "verified"
      ? { verify_result: result, status: "verified" as const, verified_at: result.checked_at }
      : { verify_result: result };
  // CAS: 내가 읽은 결과 위에만 쓴다. tick·화면 열림·의뢰인 클릭이 같은 단계를 동시에
  // 돌 수 있다 — 0행이면 다른 실행이 이긴 것이므로 알림·전이도 그쪽 몫이다
  let query = admin.from("steps").update(update).eq("id", step.id);
  query = step.verify_result?.checked_at
    ? query.filter("verify_result->>checked_at", "eq", step.verify_result.checked_at)
    : query.is("verify_result", null);
  const { data: written, error } = await query.select("id");
  if (error) {
    console.error("[verify] 저장 실패", { stepId, message: redact(error.message) });
    return result;
  }
  if (!written || written.length === 0) return result;

  if (result.status === "error") {
    // 의뢰인 문제가 아니라 내 쪽 문제다 — 로그에 남긴다
    console.error("[verify] 확인 실패", {
      type: step.verify_type,
      stepId: step.id,
      trigger,
      code: result.code ?? null,
      detail: redact(result.detail ?? ""),
    });
  }

  // 알림은 「전이」에만 — 키에 전이 시각이 들어가므로 같은 상태의 반복 확인은 조용하다.
  // 관리자 클릭은 화면에서 본다
  const wasError = step.verify_result?.status === "error";
  const url = `/a/${project.code}?tab=steps`;
  const base = { kind: "verify_event" as const, projectId: project.id, stepId: step.id, url };
  const stepInfo = {
    id: step.id,
    key: step.key,
    title: step.title,
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    clientName: project.client_name,
  };
  if (result.status === "verified") {
    after(async () => {
      await pushAdmin({
        ...base,
        dedupeKey: `verify_event:${step.id}:verified:${minuteOf(result.checked_at)}`,
        ...ko.push.autoVerified(project.name, step.title),
      });
      await onStepVerified(stepInfo, result.checked_at, trigger);
    });
  } else if (result.status === "error" && trigger !== "admin") {
    const owner: VerifyOwner | null = ownerOf(result);
    if (owner === "system") {
      // 일시 오류는 조용히 백오프한다. 자동 확인이 연속 3회 막히면 그때 한 번 알린다
      if ((result.auto_checks ?? 0) >= SYSTEM_ESCALATE_AFTER) {
        after(() =>
          pushAdmin({
            ...base,
            dedupeKey: `verify_event:${step.id}:system_stuck:${minuteOf(result.first_failed_at ?? result.checked_at)}`,
            ...ko.push.verifyError(project.name, step.title, result.detail ?? ""),
            detail: result.detail,
          }),
        );
      }
    } else if (trigger === "client" || !wasError) {
      after(() =>
        pushAdmin({
          ...base,
          dedupeKey: `verify_event:${step.id}:error:${minuteOf(result.first_failed_at ?? result.checked_at)}`,
          ...ko.push.verifyError(project.name, step.title, result.detail ?? ""),
          detail: result.detail,
        }),
      );
    }
  } else if (result.status === "not_found" && trigger !== "admin") {
    // 의뢰인이 「완료했습니다」를 누른 뒤 첫 1회만 알린다 (client_done 전이 시각이 에폭).
    // 완료 전(doing)의 「연결 확인하기」는 의뢰인 스스로 보는 확인이라 알리지 않는다.
    // 자동 재확인이 내 쪽 오류에서 회복한 경우도 한 번 알린다
    const epoch = step.checked_at ? minuteOf(step.checked_at) : minuteOf(result.checked_at);
    after(async () => {
      if (trigger === "client" && step.status === "client_done") {
        const label = isVerifyCode(result.code) ? ko.admin.verifyCode[result.code] : (result.detail ?? "");
        await pushAdmin({
          ...base,
          dedupeKey: `verify_event:${step.id}:pending:${epoch}`,
          ...ko.push.autoPending(project.name, step.title, label),
        });
      } else if (wasError) {
        await pushAdmin({
          ...base,
          dedupeKey: `verify_event:${step.id}:recovered:${minuteOf(result.checked_at)}`,
          ...ko.push.verifyRecovered(project.name, step.title),
        });
      }
      await onVerifyClientCause(stepInfo, result, project);
    });
  }

  return result;
}

const STALE_AFTER_MS = 5 * 60_000;

// 다시 확인할 때가 된 완료 요청을 돌린다.
//  - tick(mode 'tick'): next_check_at 백오프를 따른다 — 밤새 15분마다 API 를 두드리지 않는다
//  - 화면 열림(mode 'screen', 기본): 마지막 확인이 5분만 지났으면 다시 본다 — 내가 초대를
//    수락하고 대시보드를 열면 그 자리에서 「확인 완료」가 돼야 한다
// 어떤 경우에도 throw 하지 않는다.
export async function reverifyStale(options: {
  projectId?: string;
  limit?: number;
  now?: Date;
  mode?: "tick" | "screen";
} = {}): Promise<number> {
  const limit = options.limit ?? 6;
  const now = options.now ?? new Date();
  const mode = options.mode ?? "screen";
  try {
    const admin = createAdminClient();
    let query = admin
      .from("steps")
      .select("id, verify_result, projects!inner(status)")
      .eq("status", "client_done")
      .in("verify_type", ["github", "vercel", "supabase"])
      .neq("projects.status", "closed")
      .limit(50);
    if (options.projectId) query = query.eq("project_id", options.projectId);
    const { data } = await query;
    const due = ((data ?? []) as { id: string; verify_result: VerifyResult | null }[])
      .filter((row) => {
        const result = row.verify_result;
        if (!result) return true;
        const lastChecked = new Date(result.checked_at).getTime();
        if (mode === "screen") return lastChecked + STALE_AFTER_MS <= now.getTime();
        // tick: 백오프 시각이 있으면 그것, 없으면(구 데이터) 마지막 확인 + 5분
        const dueAt = result.next_check_at
          ? new Date(result.next_check_at).getTime()
          : lastChecked + STALE_AFTER_MS;
        return dueAt <= now.getTime();
      })
      .sort((a, b) => (a.verify_result?.next_check_at ?? "").localeCompare(b.verify_result?.next_check_at ?? ""))
      .slice(0, limit);
    if (due.length === 0) return 0;
    await Promise.all(due.map((row) => runVerification(row.id, "auto").catch(() => null)));
    return due.length;
  } catch (cause) {
    console.error("[verify] 재검증 실패", { message: redact(cause) });
    return 0;
  }
}

// API 로 확인할 수 없는 단계(Anthropic·Resend·Solapi)의 완료 요청 — 「초대가 내 메일함으로
// 왔는가」는 내가 봐야 안다. owner=admin 으로 표시해 「왔음/안 왔음」 2탭이 뜨게 한다
export async function markAwaitAdminAck(stepId: string): Promise<void> {
  const step = await loadStep(stepId);
  if (!step || !ADMIN_ACK_KEYS.has(step.key) || step.status !== "client_done") return;
  if (step.verify_result?.code === "await_admin_ack") return;
  const admin = createAdminClient();
  await admin
    .from("steps")
    .update({ verify_result: classify("await_admin_ack", "초대는 내 메일함으로 온다 — 확인 필요") })
    .eq("id", step.id)
    .eq("status", "client_done");
}
