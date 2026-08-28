import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { calcProgress } from "@/lib/progress";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { logout } from "@/app/logout-action";
import { ko } from "@/content/ko";

// 프로젝트 선택 화면 — 한 이메일이 여러 프로젝트에 등록된 경우에만 거친다.
export default async function ProjectPickerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: projects }, { data: steps }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, name, status")
      .order("created_at", { ascending: false }),
    supabase.from("steps").select("project_id, status"),
  ]);

  const list = projects ?? [];
  if (list.length === 0) redirect("/login?error=no_access");
  if (list.length === 1) redirect(`/p/${list[0].code}`);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-5 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{ko.portal.pickerTitle}</h1>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            {ko.common.logout}
          </button>
        </form>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {ko.portal.pickerDescription}
      </p>
      <ul className="flex flex-col gap-3">
        {list.map((project) => {
          const progress = calcProgress(
            (steps ?? []).filter((step) => step.project_id === project.id),
          );
          return (
            <li key={project.id}>
              <Link
                href={`/p/${project.code}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 transition-colors hover:bg-accent"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{project.name}</span>
                    <Badge variant="secondary">
                      {ko.status.project[project.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={progress} className="max-w-40" />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(progress)}%
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
