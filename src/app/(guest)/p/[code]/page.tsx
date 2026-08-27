import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { calcProgress } from "@/lib/progress";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { Markdown } from "@/components/common/markdown";
import { StepStepper } from "@/components/onboarding/step-stepper";
import { CommentThread } from "@/components/comment/comment-thread";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

// 포털 홈: 링크 보드 + 진행률 + 다음 할 일 + 단계 목록 + 질문·요청
export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: steps }, { data: links }, { data: comments }] =
    await Promise.all([
      supabase
        .from("steps")
        .select("*")
        .eq("project_id", project.id)
        .order("order_index"),
      supabase
        .from("links")
        .select("*")
        .eq("project_id", project.id)
        .order("order_index"),
      supabase
        .from("comments")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at"),
    ]);

  const allSteps = steps ?? [];
  const progress = calcProgress(allSteps);
  const pinnedLinks = (links ?? []).filter((link) => link.is_pinned);
  const otherLinks = (links ?? []).filter((link) => !link.is_pinned);
  const nextStep = allSteps.find(
    (step) =>
      step.owner_side === "client" &&
      (step.status === "todo" ||
        step.status === "doing" ||
        step.status === "blocked"),
  );
  const stepTitles = Object.fromEntries(
    allSteps.map((step) => [step.id, step.title]),
  );

  return (
    <main className="flex flex-col gap-8">
      {project.status === "closed" ? (
        <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          {ko.portal.closedNotice}
        </p>
      ) : null}

      {/* 링크 보드 — 고정 링크는 최상단 큰 버튼 */}
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-bold">{ko.portal.linksTitle}</h1>
        {pinnedLinks.length === 0 && otherLinks.length === 0 ? (
          <EmptyState message={ko.portal.linksEmpty} />
        ) : (
          <>
            {pinnedLinks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {pinnedLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "w-full justify-between",
                    )}
                  >
                    {link.label}
                    <ExternalLink className="size-4" />
                  </a>
                ))}
              </div>
            ) : null}
            {otherLinks.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                {otherLinks.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex min-h-12 items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-accent"
                    >
                      {link.label}
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      {/* 진행률 + 다음 할 일 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">{ko.portal.progressLabel}</h2>
          <span className="text-sm font-semibold text-primary">
            {Math.round(progress)}%
          </span>
        </div>
        <Progress value={progress} />
        {project.status !== "closed" ? (
          <Card className={nextStep ? "border-primary/40 bg-accent" : undefined}>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="text-sm font-medium text-muted-foreground">
                {ko.portal.nextTaskTitle}
              </p>
              {nextStep ? (
                <>
                  <p className="text-base font-semibold">{nextStep.title}</p>
                  <Link
                    href={`/p/${code}/steps/${nextStep.key}`}
                    className={cn(buttonVariants({ size: "lg" }), "w-full")}
                  >
                    {ko.portal.nextTaskGo}
                    <ArrowRight className="size-4" />
                  </Link>
                </>
              ) : (
                <p className="text-sm leading-relaxed">
                  {ko.portal.nextTaskAllDone}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* 단계 목록 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{ko.portal.stepsTitle}</h2>
        {allSteps.length === 0 ? (
          <EmptyState message={ko.common.empty} />
        ) : (
          <StepStepper steps={allSteps} projectCode={code} />
        )}
      </section>

      {/* 작업 범위 (읽기 전용) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold">{ko.portal.scopeTitle}</h2>
          {project.scope_agreed_at ? (
            <span className="text-xs text-muted-foreground">
              {ko.portal.scopeAgreedAt}{" "}
              {format(new Date(project.scope_agreed_at), "yyyy.MM.dd")}
            </span>
          ) : null}
        </div>
        {project.scope_md ? (
          <Card>
            <CardContent className="p-5">
              <Markdown>{project.scope_md}</Markdown>
            </CardContent>
          </Card>
        ) : (
          <EmptyState message={ko.portal.scopeEmpty} />
        )}
      </section>

      {/* 질문·요청 */}
      <CommentThread
        side="client"
        comments={comments ?? []}
        stepTitles={stepTitles}
        projectId={project.id}
        projectCode={code}
        stepId={null}
        showStepLabels
      />
    </main>
  );
}
