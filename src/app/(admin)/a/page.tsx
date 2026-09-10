import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { calcProgress } from "@/lib/progress";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { MyPasswordForm } from "@/app/(admin)/a/my-password-form";
import {
  VerifyHealth,
  VerifyHealthFallback,
  type RecentVerifyError,
} from "@/app/(admin)/a/verify-health";
import { TodoList } from "@/app/(admin)/a/todo-list";
import { OutboxSection } from "@/app/(admin)/a/outbox-section";
import { buildTodos, type TodoItem } from "@/lib/todo";
import { reverifyStale } from "@/lib/verify/run";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import type { ProjectStatus } from "@/lib/database.types";

const STATUS_VARIANTS: Record<
  ProjectStatus,
  "secondary" | "default" | "success" | "muted"
> = {
  onboarding: "default",
  building: "secondary",
  delivered: "success",
  closed: "muted",
};

// 관리 대시보드: 어느 프로젝트가 어느 조직에 붙어 있는지 한눈에.
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // 화면이 열리는 것이 곧 시계다 — 오래된 완료 요청을 먼저 다시 확인하고 그린다
  // (내가 초대를 수락한 뒤 여기를 열면 그 자리에서 「확인 완료」가 된다)
  await reverifyStale({ limit: 6 });

  const [
    { data: projects },
    { data: steps },
    { data: unreadComments },
    { data: guestRows },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("steps")
      .select(
        "project_id, key, status, title, owner_side, order_index, verify_result, blocked_reason, checked_at, updated_at",
      ),
    supabase
      .from("comments")
      .select("project_id, author_side, read_at, deleted_at")
      .eq("author_side", "client")
      .is("read_at", null)
      .is("deleted_at", null),
    supabase.from("project_guests").select("project_id, last_seen_at"),
  ]);

  const unreadByProject = new Map<string, number>();
  for (const comment of unreadComments ?? []) {
    unreadByProject.set(
      comment.project_id,
      (unreadByProject.get(comment.project_id) ?? 0) + 1,
    );
  }

  // 프로젝트별 의뢰인 마지막 접속 (여러 명이면 가장 최근)
  const lastSeenByProject = new Map<string, string>();
  for (const guest of guestRows ?? []) {
    if (!guest.last_seen_at) continue;
    const current = lastSeenByProject.get(guest.project_id);
    if (!current || guest.last_seen_at > current) {
      lastSeenByProject.set(guest.project_id, guest.last_seen_at);
    }
  }

  // 의뢰인이 「연결 확인하기」를 눌렀는데 내 쪽 문제로 실패한 단계.
  // 아직 확인 완료·건너뜀이 아닌 것만 — 지금도 의뢰인 화면에 남아 있는 것들이다
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const recentErrors: RecentVerifyError[] = (steps ?? [])
    .filter(
      (step) =>
        step.verify_result?.status === "error" &&
        step.status !== "verified" &&
        step.status !== "skipped",
    )
    .flatMap((step) => {
      const project = projectById.get(step.project_id);
      if (!project || !step.verify_result) return [];
      return [
        {
          projectCode: project.code,
          projectName: project.name,
          stepTitle: step.title,
          result: step.verify_result,
        },
      ];
    })
    .sort((a, b) => b.result.checked_at.localeCompare(a.result.checked_at));

  // 프로젝트별 「지금 할 일」 — 급한 것이 있는 프로젝트가 위로
  const todoRows: { code: string; name: string; items: TodoItem[] }[] = (projects ?? [])
    .map((project) => ({
      code: project.code,
      name: project.name,
      items: buildTodos(
        project,
        (steps ?? []).filter((step) => step.project_id === project.id),
        (unreadComments ?? []).filter((comment) => comment.project_id === project.id),
        (guestRows ?? []).filter((guest) => guest.project_id === project.id),
      ),
    }))
    .filter((row) => row.items.length > 0)
    .sort(
      (a, b) =>
        Number(b.items.some((item) => item.urgent)) -
          Number(a.items.some((item) => item.urgent)) || b.items.length - a.items.length,
    );

  return (
    <main className="flex flex-col gap-5">
      <Suspense fallback={<VerifyHealthFallback />}>
        <VerifyHealth recentErrors={recentErrors} />
      </Suspense>

      <Suspense fallback={null}>
        <OutboxSection />
      </Suspense>

      <section className="rounded-lg border border-border bg-card px-4 py-3">
        <h2 className="text-sm font-semibold">{ko.admin.todo.dashboardTitle}</h2>
        {todoRows.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{ko.admin.todo.allClear}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {todoRows.map((row) => (
              <li key={row.code} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                <Link
                  href={`/a/${row.code}`}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  {row.name}
                </Link>
                <TodoList code={row.code} items={row.items} emptyText={null} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ko.admin.dashboardTitle}</h1>
        <Link href="/a/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          {ko.admin.newProject}
        </Link>
      </div>

      {(projects ?? []).length === 0 ? (
        <EmptyState message={ko.admin.emptyProjects} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableName}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableClient}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableStatus}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableProgress}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableOrgs}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableUnread}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableLastSeen}</th>
                <th className="px-4 py-2.5 font-medium">{ko.admin.tableCreated}</th>
              </tr>
            </thead>
            <tbody>
              {(projects ?? []).map((project) => {
                const projectSteps = (steps ?? []).filter(
                  (step) => step.project_id === project.id,
                );
                const progress = calcProgress(projectSteps);
                const unread = unreadByProject.get(project.id) ?? 0;
                const orgs: { label: string; value: string | null }[] = [
                  { label: "GitHub", value: project.github_org },
                  { label: "Vercel", value: project.vercel_team },
                  { label: "Supabase", value: project.supabase_org },
                ];
                return (
                  <tr
                    key={project.id}
                    className="border-b border-border last:border-b-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/a/${project.code}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {project.name}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        /{project.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {project.client_name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {ko.status.tier[project.support_tier]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[project.status]}>
                        {ko.status.project[project.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="w-20" />
                        <span className="text-xs text-muted-foreground">
                          {Math.round(progress)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {orgs.map((org) => (
                          <Badge
                            key={org.label}
                            variant={org.value ? "success" : "muted"}
                          >
                            {org.label}
                            {org.value ? `: ${org.value}` : ""}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {unread > 0 ? (
                        <Badge variant="destructive">
                          {ko.comments.unreadBadge(unread)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {lastSeenByProject.has(project.id) ? (
                        format(
                          new Date(lastSeenByProject.get(project.id)!),
                          "MM.dd HH:mm",
                        )
                      ) : (
                        <span className="text-muted-foreground">
                          {ko.admin.access.neverSeen}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(project.created_at), "yyyy.MM.dd")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MyPasswordForm />
    </main>
  );
}
