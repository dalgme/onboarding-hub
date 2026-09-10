import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGithubMembership } from "@/lib/verify/github";
import { verifyVercelMembership } from "@/lib/verify/vercel";
import { verifySupabaseMembership } from "@/lib/verify/supabase";
import { makeResult } from "@/lib/verify/types";
import { pushAdmin, minuteOf } from "@/lib/notify";
import { onStepVerified, onVerifyClientCause } from "@/lib/outbox";
import { ko } from "@/content/ko";
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
  if (!slug) {
    return makeResult("not_found", "조직 이름이 아직 입력되지 않았습니다", "no_slug");
  }
  if (type === "github") return verifyGithubMembership(slug);
  if (type === "vercel") return verifyVercelMembership(slug);
  const admin = createAdminClient();
  const { data: adminRow } = await admin.from("admins").select("email").limit(1).maybeSingle();
  if (!adminRow) return makeResult("error", "관리자 이메일이 등록되지 않았습니다");
  return verifySupabaseMembership(slug, adminRow.email);
}

// 이전 결과와 트리거로 횟수·다음 확인 시각·최초 실패 시각을 채운다
function withSchedule(
  result: VerifyResult,
  previous: VerifyResult | null,
  trigger: VerifyTrigger,
): VerifyResult {
  if (result.status === "verified") return result;
  const sameCause =
    previous !== null &&
    previous.status === result.status &&
    (previous.code ?? null) === (result.code ?? null);
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
    console.error("[verify] 저장 실패", { stepId, message: error.message });
    return result;
  }
  if (!written || written.length === 0) return result;

  if (result.status === "error") {
    // 의뢰인 문제가 아니라 내 쪽 문제다 — 로그에 남긴다
    console.error("[verify] 확인 실패", {
      type: step.verify_type,
      stepId: step.id,
      trigger,
      detail: result.detail ?? null,
    });
  }

  // 알림은 「전이」에만 — 키에 전이 시각이 들어가므로 같은 상태의 반복 확인은 조용하다.
  // 관리자 클릭은 화면에서 본다
  const wasVerified = step.status === "verified";
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
  if (result.status === "verified" && !wasVerified) {
    after(async () => {
      await pushAdmin({
        ...base,
        dedupeKey: `verify_event:${step.id}:verified:${minuteOf(result.checked_at)}`,
        ...ko.push.autoVerified(project.name, step.title),
      });
      await onStepVerified(stepInfo, result.checked_at);
    });
  } else if (result.status === "error" && trigger !== "admin" && (trigger === "client" || !wasError)) {
    after(() =>
      pushAdmin({
        ...base,
        dedupeKey: `verify_event:${step.id}:error:${minuteOf(result.first_failed_at ?? result.checked_at)}`,
        ...ko.push.verifyError(project.name, step.title, result.detail ?? ""),
        detail: result.detail,
      }),
    );
  } else if (result.status === "not_found" && trigger !== "admin") {
    // 의뢰인이 완료를 누른 뒤 첫 1회만 알린다 (client_done 전이 시각이 에폭)
    const epoch = step.checked_at ? minuteOf(step.checked_at) : minuteOf(result.checked_at);
    after(async () => {
      if (trigger === "client") {
        await pushAdmin({
          ...base,
          dedupeKey: `verify_event:${step.id}:pending:${epoch}`,
          ...ko.push.autoPending(project.name, step.title, result.detail ?? ""),
        });
      }
      await onVerifyClientCause(stepInfo, result, project);
    });
  } else if (result.status === "not_found" && wasError && trigger === "auto") {
    // 내 쪽 오류에서 회복 — 다시 정상적으로 확인하고 있다
    after(() =>
      pushAdmin({
        ...base,
        dedupeKey: `verify_event:${step.id}:recovered:${minuteOf(result.checked_at)}`,
        ...ko.push.verifyRecovered(project.name, step.title),
      }),
    );
  }

  return result;
}

const STALE_AFTER_MS = 5 * 60_000;

// 다시 확인할 때가 된 완료 요청을 돌린다. 시계는 크론 tick 이고, 대시보드·포털이
// 열릴 때도 한 번 더 돈다(이중화). 어떤 경우에도 throw 하지 않는다.
export async function reverifyStale(options: {
  projectId?: string;
  limit?: number;
  now?: Date;
} = {}): Promise<number> {
  const limit = options.limit ?? 6;
  const now = options.now ?? new Date();
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
        // 백오프 시각이 있으면 그것, 없으면(구 데이터) 마지막 확인 + 5분
        const dueAt = result.next_check_at
          ? new Date(result.next_check_at).getTime()
          : new Date(result.checked_at).getTime() + STALE_AFTER_MS;
        return dueAt <= now.getTime();
      })
      .sort((a, b) => (a.verify_result?.next_check_at ?? "").localeCompare(b.verify_result?.next_check_at ?? ""))
      .slice(0, limit);
    if (due.length === 0) return 0;
    await Promise.all(due.map((row) => runVerification(row.id, "auto").catch(() => null)));
    return due.length;
  } catch (cause) {
    console.error("[verify] 재검증 실패", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return 0;
  }
}
