import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGithubMembership } from "@/lib/verify/github";
import { verifyVercelMembership } from "@/lib/verify/vercel";
import { verifySupabaseMembership } from "@/lib/verify/supabase";
import { makeResult } from "@/lib/verify/types";
import { notifyAdmin } from "@/lib/push";
import { ko } from "@/content/ko";
import type { StepStatus, VerifyResult, VerifyType } from "@/lib/database.types";

// 자동 검증의 단일 진입점. 사람이 「지금 확인」을 누르지 않아도 돈다:
//  - 의뢰인이 「완료했습니다」를 누르는 순간 (trigger: client)
//  - 관리자 대시보드·의뢰인 포털이 열릴 때, 오래된 완료 요청을 다시 (trigger: auto)
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

export function isAutoVerifyType(type: string): type is AutoVerifyType {
  return type === "github" || type === "vercel" || type === "supabase";
}

interface StepContext {
  id: string;
  title: string;
  verify_type: VerifyType;
  status: StepStatus;
  verify_result: VerifyResult | null;
  projects: {
    id: string;
    code: string;
    name: string;
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
      "id, title, verify_type, status, verify_result, projects(id, code, name, status, github_org, vercel_team, supabase_org)",
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

export async function runVerification(
  stepId: string,
  trigger: VerifyTrigger,
): Promise<VerifyResult | null> {
  const step = await loadStep(stepId);
  if (!step || !step.projects || !isAutoVerifyType(step.verify_type)) return null;
  const project = step.projects;

  const result = await compute(step.verify_type, project[SLUG_COLUMN[step.verify_type]]);

  const admin = createAdminClient();
  const update =
    result.status === "verified"
      ? { verify_result: result, status: "verified" as const, verified_at: result.checked_at }
      : { verify_result: result };
  const { error } = await admin.from("steps").update(update).eq("id", step.id);
  if (error) {
    console.error("[verify] 저장 실패", { stepId, message: error.message });
    return result;
  }

  if (result.status === "error") {
    // 의뢰인 문제가 아니라 내 쪽 문제다 — 로그에 남긴다
    console.error("[verify] 확인 실패", {
      type: step.verify_type,
      stepId: step.id,
      trigger,
      detail: result.detail ?? null,
    });
  }

  // 알림: 의뢰인이 누른 검증은 결과가 무엇이든 알린다. 자동 재검증은 상태가
  // 바뀌었을 때만 (매 방문마다 같은 알림이 오면 곧 안 보게 된다). 관리자 클릭은 화면에서 본다
  const wasVerified = step.status === "verified";
  const wasError = step.verify_result?.status === "error";
  const url = `/a/${project.code}?tab=steps`;
  const tag = `verify-${step.id}`;
  let message: { title: string; body: string } | null = null;
  if (result.status === "verified" && !wasVerified) {
    message = ko.push.autoVerified(project.name, step.title);
  } else if (result.status === "error" && (trigger === "client" || !wasError)) {
    message = ko.push.verifyError(project.name, step.title, result.detail ?? "");
  } else if (result.status === "not_found" && trigger === "client") {
    message = ko.push.autoPending(project.name, step.title, result.detail ?? "");
  }
  if (message && trigger !== "admin") {
    const payload = { ...message, url, tag };
    after(() => notifyAdmin(payload));
  }

  return result;
}

const STALE_AFTER_MS = 5 * 60_000;

// 오래된 완료 요청을 다시 확인한다. 크론 대신 "화면이 열릴 때"가 시계다 —
// 내가 초대를 수락하고 대시보드를 열면 그 자리에서 확인 완료가 된다.
// 어떤 경우에도 throw 하지 않는다. 화면을 막지 않도록 개수를 제한한다
export async function reverifyStale(options: {
  projectId?: string;
  maxAgeMs?: number;
  limit?: number;
} = {}): Promise<number> {
  const maxAge = options.maxAgeMs ?? STALE_AFTER_MS;
  const limit = options.limit ?? 6;
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
    const cutoff = Date.now() - maxAge;
    const due = ((data ?? []) as { id: string; verify_result: VerifyResult | null }[])
      .filter((row) => {
        const checked = row.verify_result?.checked_at;
        return !checked || new Date(checked).getTime() < cutoff;
      })
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
