import { createAdminClient } from "@/lib/supabase/admin";
import { pushAdmin, minuteOf } from "@/lib/notify";
import { createOutbox, portalUrl } from "@/lib/outbox";
import { ko } from "@/content/ko";
import { onboardingClientSteps } from "@/lib/todo";
import { CONNECT_META } from "@/lib/steps";
import type { ProjectStatus, StepStatus } from "@/lib/database.types";

// 프로젝트 상태 자동 전이 (D6=A). 조건이 전부 데이터에서 결정된다 — 사람이 셀렉트를 고르지 않는다.
//   onboarding → building : 첫 제작자 단계 앞의 의뢰인 단계가 전부 verified/skipped 이고 범위가 확정됨
//                           (「도메인 연결」은 개발 뒤의 단계라 조건에 들어가지 않는다)
//   building   → delivered: 「배포 및 인수인계」(handover) 단계가 verified
// 사건 핸들러(검증 확인·관리자 확인·범위 확정)에서만 부른다 — tick 에 두면 사람이 설정 탭에서
// 되돌린 상태와 15분마다 싸운다. 되돌리기는 설정 탭의 상태 셀렉트로 사람이 한다.
const DONE: ReadonlySet<StepStatus> = new Set(["verified", "skipped"]);

export async function advanceProjectStatus(projectId: string): Promise<ProjectStatus | null> {
  const admin = createAdminClient();
  const [{ data: project }, { data: steps }] = await Promise.all([
    admin.from("projects").select("id, code, name, client_name, status, scope_agreed_at, github_org, vercel_team, supabase_org").eq("id", projectId).maybeSingle(),
    admin.from("steps").select("key, owner_side, order_index, status").eq("project_id", projectId),
  ]);
  if (!project || !steps) return null;
  const clientSteps = onboardingClientSteps(steps);
  const clientDone =
    clientSteps.length > 0 && clientSteps.every((step) => DONE.has(step.status)) && Boolean(project.scope_agreed_at);
  const handoverDone = steps.some((step) => step.key === "handover" && step.status === "verified");

  let next: ProjectStatus | null = null;
  if (project.status === "onboarding" && clientDone) next = "building";
  if ((project.status === "onboarding" || project.status === "building") && handoverDone) next = "delivered";
  if (!next) return null;

  const { data: updated } = await admin
    .from("projects")
    .update({ status: next })
    .eq("id", project.id)
    .eq("status", project.status) // 동시 실행 방어
    .select("id");
  if (!updated || updated.length === 0) return null;

  const now = new Date();
  await pushAdmin({
    dedupeKey: `project_status:${project.id}:${next}:${minuteOf(now)}`,
    kind: "verify_event",
    projectId: project.id,
    ...ko.push.projectStatus(project.name, next),
    url: `/a/${project.code}`,
  });
  if (next === "delivered") {
    // 완료 안내 문구 — 최종 주소·문서는 관리자가 보내기 전에 카드에서 본문을 읽고 필요하면 링크 탭에서 채운다
    const { data: links } = await admin
      .from("links")
      .select("label, url")
      .eq("project_id", project.id)
      .eq("is_pinned", true)
      .order("order_index");
    await createOutbox({
      kind: "closed",
      projectId: project.id,
      dedupeKey: `delivered:${project.id}:${minuteOf(now)}`,
      title: ko.outbox.titles.delivered,
      body: ko.outbox.delivered({
        client: project.client_name,
        links: (links ?? []).map((link) => `▶ ${link.label}: ${link.url}`),
        // 종료 뒤 의뢰인이 「제작자가 빠졌는지」를 스스로 확인할 곳 — 연결된 조직의 멤버 화면
        memberPages: (
          [
            ["connect-github", project.github_org],
            ["connect-vercel", project.vercel_team],
            ["connect-supabase", project.supabase_org],
          ] as [string, string | null][]
        )
          .flatMap(([key, slug]) => {
            const meta = CONNECT_META[key];
            return slug && meta ? [`${meta.serviceName}: ${meta.inviteUrl(slug)}`] : [];
          }),
        portalUrl: portalUrl(project.code),
      }),
      push: null,
    });
  }
  return next;
}

// 범위 확정 → 「합의한 범위를 포털에 올렸습니다」 문구
export async function onScopeAgreed(project: { id: string; code: string; client_name: string }): Promise<void> {
  await createOutbox({
    kind: "scope_ready",
    projectId: project.id,
    dedupeKey: `scope_ready:${project.id}:${minuteOf(new Date())}`,
    title: ko.outbox.titles.scopeReady,
    body: ko.outbox.scopeReady({ client: project.client_name, portalUrl: portalUrl(project.code) }),
    push: null,
  });
}

// 링크 고정 → 「중간 확인 주소가 생겼습니다」 문구
export async function onLinkPinned(
  project: { id: string; code: string; client_name: string },
  link: { label: string; url: string },
): Promise<void> {
  await createOutbox({
    kind: "link_pinned",
    projectId: project.id,
    dedupeKey: `link_pinned:${project.id}:${minuteOf(new Date())}`,
    title: ko.outbox.titles.linkPinned(link.label),
    body: ko.outbox.linkPinned({ client: project.client_name, label: link.label, url: link.url, portalUrl: portalUrl(project.code) }),
    push: null,
  });
}
