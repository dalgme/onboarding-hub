import Link from "next/link";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { calcProgress } from "@/lib/progress";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
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

  const [{ data: projects }, { data: steps }, { data: unreadComments }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("steps").select("project_id, status"),
      supabase
        .from("comments")
        .select("project_id")
        .eq("author_side", "client")
        .is("read_at", null)
        .is("deleted_at", null),
    ]);

  const unreadByProject = new Map<string, number>();
  for (const comment of unreadComments ?? []) {
    unreadByProject.set(
      comment.project_id,
      (unreadByProject.get(comment.project_id) ?? 0) + 1,
    );
  }

  return (
    <main className="flex flex-col gap-5">
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
    </main>
  );
}
