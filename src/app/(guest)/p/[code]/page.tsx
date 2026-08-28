import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { Markdown } from "@/components/common/markdown";
import { StepStepper } from "@/components/onboarding/step-stepper";
import { CommentThread } from "@/components/comment/comment-thread";
import { WorkLog } from "@/app/(guest)/p/[code]/work-log";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

const TABS = [
  { key: "tasks", label: ko.portal.tabTasks },
  { key: "log", label: ko.portal.tabLog },
  { key: "qa", label: ko.portal.tabComments },
  { key: "help", label: ko.portal.tabHelp },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// 포털 홈: 설정(할 일) · 작업기록 · 질문요청 · 도움말 4개 탭.
// 진행률·작업 URL 버튼은 레이아웃이 상단에 항상 유지한다.
export default async function PortalHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { code } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = TABS.some((item) => item.key === rawTab)
    ? (rawTab as TabKey)
    : "tasks";

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
  const unreadFromAdmin = (comments ?? []).filter(
    (comment) =>
      comment.author_side === "admin" && !comment.read_at && !comment.deleted_at,
  ).length;

  return (
    <main className="flex flex-col gap-5">
      {project.status === "closed" ? (
        <p className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          {ko.portal.closedNotice}
        </p>
      ) : null}

      <nav className="flex border-b border-border">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/p/${code}?tab=${item.key}`}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-1 py-2.5 text-sm font-medium",
              tab === item.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            {item.label}
            {item.key === "qa" && unreadFromAdmin > 0 ? (
              <Badge variant="destructive">{unreadFromAdmin}</Badge>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "tasks" ? (
        <div className="flex flex-col gap-7">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {ko.portal.tasksGuide}
          </p>

          {project.status !== "closed" && nextStep ? (
            <Card className="border-primary/40 bg-accent">
              <CardContent className="flex flex-col gap-3 p-5">
                <p className="text-sm font-medium text-muted-foreground">
                  {ko.portal.nextTaskTitle}
                </p>
                <p className="text-base font-semibold">{nextStep.title}</p>
                <Link
                  href={`/p/${code}/steps/${nextStep.key}`}
                  className={cn(buttonVariants({ size: "lg" }), "w-full")}
                >
                  {ko.portal.nextTaskGo}
                  <ArrowRight className="size-4" />
                </Link>
              </CardContent>
            </Card>
          ) : null}
          {project.status !== "closed" && !nextStep ? (
            <p className="rounded-md bg-success/10 px-4 py-3 text-sm text-success">
              {ko.portal.nextTaskAllDone}
            </p>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{ko.portal.stepsTitle}</h2>
            {allSteps.length === 0 ? (
              <EmptyState message={ko.common.empty} />
            ) : (
              <StepStepper steps={allSteps} projectCode={code} />
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold">{ko.portal.linksTitle}</h2>
            {(links ?? []).length === 0 ? (
              <EmptyState message={ko.portal.linksEmpty} />
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                {(links ?? []).map((link) => (
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
            )}
          </section>

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
        </div>
      ) : null}

      {tab === "log" ? (
        <WorkLog
          project={project}
          steps={allSteps}
          comments={comments ?? []}
        />
      ) : null}

      {tab === "qa" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {ko.portal.commentsGuide}
          </p>
          <CommentThread
            side="client"
            comments={comments ?? []}
            stepTitles={stepTitles}
            projectId={project.id}
            projectCode={code}
            stepId={null}
            showStepLabels
          />
        </div>
      ) : null}

      {tab === "help" ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-bold">{ko.portal.helpTitle}</h1>
          {ko.portal.helpSections.map((section) => (
            <Card key={section.title}>
              <CardContent className="flex flex-col gap-2 p-5">
                <h2 className="text-sm font-semibold">{section.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </main>
  );
}
