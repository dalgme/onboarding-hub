import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcProgress } from "@/lib/progress";
import { WorkLog } from "@/app/(guest)/p/[code]/work-log";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CopyButton } from "@/components/common/copy-button";
import { CommentThread } from "@/components/comment/comment-thread";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import { TabGuide } from "@/components/common/tab-guide";
import { StepsTable } from "@/app/(admin)/a/[code]/steps-table";
import { LinkManager } from "@/app/(admin)/a/[code]/link-manager";
import { ScopeForm } from "@/app/(admin)/a/[code]/scope-form";
import { SettingsForm } from "@/app/(admin)/a/[code]/settings-form";
import { GuestManager } from "@/app/(admin)/a/[code]/guest-manager";
import { OffboardPanel } from "@/app/(admin)/a/[code]/offboard-panel";
import { ProcessTab } from "@/app/(admin)/a/[code]/process-tab";
import { OptionalSteps } from "@/app/(admin)/a/[code]/optional-steps";
import { AccessPanel } from "@/app/(admin)/a/[code]/access-panel";

const TABS = [
  { key: "process", label: ko.admin.tabProcess },
  { key: "steps", label: ko.admin.tabSteps },
  { key: "links", label: ko.admin.tabLinks },
  { key: "scope", label: ko.admin.tabScope },
  { key: "settings", label: ko.admin.tabSettings },
  { key: "close", label: ko.admin.tabClose },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function AdminProjectPage({
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
    : "steps";

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!project) notFound();

  const [{ data: steps }, { data: links }, { data: comments }, { data: guests }] =
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
      supabase
        .from("project_guests")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at"),
    ]);

  // 게스트 계정 상태(마지막 로그인·임시 비밀번호 여부) — 인증 서버에서 조회
  const adminAuth = createAdminClient();
  const { data: userList } = await adminAuth.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const accountByEmail: Record<
    string,
    { lastSignInAt: string | null; tempPassword: boolean }
  > = {};
  for (const authUser of userList?.users ?? []) {
    if (!authUser.email) continue;
    accountByEmail[authUser.email.toLowerCase()] = {
      lastSignInAt: authUser.last_sign_in_at ?? null,
      tempPassword: authUser.user_metadata?.must_change_password === true,
    };
  }

  const allSteps = steps ?? [];
  const progress = calcProgress(allSteps);
  const stepTitles = Object.fromEntries(
    allSteps.map((step) => [step.id, step.title]),
  );
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const portalUrl = `${siteUrl}/p/${code}`;

  // 범위 확정 이후 쌓인 요청 수 = 범위 증가분
  const requestsSinceAgreed = project.scope_agreed_at
    ? (comments ?? []).filter(
        (comment) =>
          comment.kind === "request" &&
          comment.author_side === "client" &&
          !comment.deleted_at &&
          comment.created_at > project.scope_agreed_at!,
      ).length
    : 0;

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{project.name}</h1>
        <Badge variant="secondary">{ko.status.project[project.status]}</Badge>
        <Badge variant="outline">{ko.status.tier[project.support_tier]}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton value={portalUrl} label={ko.admin.copyPortalLink} size="sm" />
          <a
            href={`/p/${code}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-4" />
            {ko.admin.portalLink}
          </a>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          {project.client_name} · {project.client_email}
        </span>
        <Progress value={progress} className="w-32" />
        <span>{Math.round(progress)}%</span>
        <span>
          {format(new Date(project.created_at), "yyyy.MM.dd")} 시작
        </span>
      </div>

      <nav className="flex gap-1 border-b border-border">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/a/${code}?tab=${item.key}`}
            className={cn(
              "min-h-11 border-b-2 px-4 py-2.5 text-sm font-medium",
              tab === item.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "process" ? <ProcessTab /> : null}

      {tab === "steps" ? (
        <div className="flex flex-col gap-8">
          <TabGuide items={ko.admin.guide.steps} />
          <StepsTable steps={allSteps} projectCode={code} />
          <OptionalSteps
            projectId={project.id}
            projectCode={code}
            existingKeys={allSteps.map((step) => step.key)}
          />
          <CommentThread
            side="admin"
            comments={comments ?? []}
            stepTitles={stepTitles}
            projectId={project.id}
            projectCode={code}
            stepId={null}
            showStepLabels
          />
          <details className="rounded-lg border border-border px-4 py-3">
            <summary className="min-h-8 cursor-pointer text-sm font-semibold text-muted-foreground">
              {ko.admin.access.activityTitle}
            </summary>
            <p className="mt-1 text-xs text-muted-foreground">
              {ko.admin.access.activityHelp}
            </p>
            <div className="mt-3">
              <WorkLog
                project={project}
                steps={allSteps}
                comments={comments ?? []}
              />
            </div>
          </details>
        </div>
      ) : null}

      {tab === "links" ? (
        <div className="flex max-w-2xl flex-col gap-5">
          <TabGuide items={ko.admin.guide.links} />
          <LinkManager
            links={links ?? []}
            projectId={project.id}
            projectCode={code}
          />
        </div>
      ) : null}

      {tab === "scope" ? (
        <div className="flex max-w-3xl flex-col gap-5">
          <TabGuide items={ko.admin.guide.scope} />
          <ScopeForm
            projectId={project.id}
            projectCode={code}
            scopeMd={project.scope_md ?? ""}
            scopeAgreedAt={project.scope_agreed_at}
            requestsSinceAgreed={requestsSinceAgreed}
          />
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="flex max-w-lg flex-col gap-8">
          <TabGuide items={ko.admin.guide.settings} />
          <SettingsForm project={project} />
          <GuestManager
            guests={guests ?? []}
            projectId={project.id}
            projectCode={code}
            accountByEmail={accountByEmail}
          />
          <AccessPanel
            guests={guests ?? []}
            projectId={project.id}
            projectCode={code}
            projectName={project.name}
          />
        </div>
      ) : null}

      {tab === "close" ? (
        <div className="flex max-w-2xl flex-col gap-5">
          <TabGuide items={ko.admin.guide.close} />
          <OffboardPanel
            projectId={project.id}
            projectCode={code}
            closedAt={project.closed_at}
          />
        </div>
      ) : null}
    </main>
  );
}
