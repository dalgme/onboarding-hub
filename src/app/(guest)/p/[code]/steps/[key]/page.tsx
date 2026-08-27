import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONNECT_META } from "@/lib/steps";
import { Markdown } from "@/components/common/markdown";
import { StepStatusBadge } from "@/components/onboarding/step-status-badge";
import { ConnectFlow } from "@/components/onboarding/connect-flow";
import { StickyActions } from "@/components/onboarding/sticky-actions";
import { CommentThread } from "@/components/comment/comment-thread";
import { ko } from "@/content/ko";

// 단계 상세 — 이 도구에서 가장 공들이는 화면.
// 계정 연결 단계는 미니 스텝퍼(만들기 → 이름 → 초대 → 확인)로 진행한다.
export default async function StepDetailPage({
  params,
}: {
  params: Promise<{ code: string; key: string }>;
}) {
  const { code, key } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!project) notFound();

  const { data: step } = await supabase
    .from("steps")
    .select("*")
    .eq("project_id", project.id)
    .eq("key", key)
    .maybeSingle();
  if (!step) notFound();

  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("project_id", project.id)
    .eq("step_id", step.id)
    .order("created_at");

  const meta = CONNECT_META[step.key];
  const isClosed = project.status === "closed";
  const isClientStep = step.owner_side === "client";

  // 초대할 이메일(내 이메일)은 서버에서만 조회한다 — admins는 관리자 전용 RLS
  let inviteEmail = "";
  if (meta) {
    const admin = createAdminClient();
    const { data: adminRow } = await admin
      .from("admins")
      .select("email")
      .limit(1)
      .maybeSingle();
    inviteEmail = adminRow?.email ?? "";
  }

  const currentSlug = meta ? project[meta.slugColumn] : null;

  return (
    <main className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/p/${code}`}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {ko.common.back}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{step.title}</h1>
          <StepStatusBadge status={step.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {isClientStep ? ko.stepDetail.yourTurn : ko.stepDetail.agencyTurn}
        </p>
      </div>

      <Markdown>{step.description_md}</Markdown>

      {meta && isClientStep && !isClosed ? (
        <ConnectFlow
          step={step}
          meta={meta}
          projectId={project.id}
          projectCode={code}
          currentSlug={currentSlug}
          inviteEmail={inviteEmail}
        />
      ) : null}

      <CommentThread
        side="client"
        comments={comments ?? []}
        projectId={project.id}
        projectCode={code}
        stepId={step.id}
      />

      {isClientStep && !isClosed ? (
        <StickyActions step={step} projectId={project.id} projectCode={code} />
      ) : null}
    </main>
  );
}
