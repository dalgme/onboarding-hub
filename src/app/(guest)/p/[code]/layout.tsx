import { redirect } from "next/navigation";
import { ExternalLink, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { calcProgress } from "@/lib/progress";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { ProjectSwitcher } from "@/components/common/project-switcher";
import { logout } from "@/app/logout-action";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

// 포털 공통 레이아웃. 접근 가드 + 항상 상단에 유지되는
// 진행률 바 · 「작업 URL 바로가기」 버튼 (고정 링크).
export default async function GuestLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("code", code)
    .maybeSingle();
  if (!project) redirect("/login?error=no_access");

  const [{ data: steps }, { data: pinnedLinks }, { data: myProjects }] =
    await Promise.all([
      supabase.from("steps").select("status").eq("project_id", project.id),
      supabase
        .from("links")
        .select("id, label, url")
        .eq("project_id", project.id)
        .eq("is_pinned", true)
        .order("order_index"),
      supabase
        .from("projects")
        .select("code, name")
        .order("created_at", { ascending: false }),
    ]);

  const progress = calcProgress(steps ?? []);
  const switchable = myProjects ?? [];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 pb-4 pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          {switchable.length > 1 ? (
            <ProjectSwitcher projects={switchable} currentCode={code} />
          ) : (
            <span className="truncate text-sm font-semibold">
              {project.name}
            </span>
          )}
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

        <div className="mt-1 flex items-center gap-3">
          <Progress value={progress} className="flex-1" />
          <span className="shrink-0 text-sm font-semibold text-primary">
            {Math.round(progress)}%
          </span>
        </div>

        <div className="mt-3">
          {(pinnedLinks ?? []).length > 0 ? (
            <div className="flex flex-col gap-2">
              {(pinnedLinks ?? []).map((link) => (
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
                  {ko.portal.workUrlButton} — {link.label}
                  <ExternalLink className="size-4" />
                </a>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
              {ko.portal.workUrlEmpty}
            </p>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col px-5 pb-8 pt-4">{children}</div>
    </div>
  );
}
