import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout-action";
import { ko } from "@/content/ko";

// 포털 접근 가드: RLS 덕에 이 프로젝트에 접근 가능한 사용자만 행이 조회된다.
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
    .select("name")
    .eq("code", code)
    .maybeSingle();
  if (!project) redirect("/login?error=no_access");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="truncate text-sm font-semibold">{project.name}</span>
        <form action={logout}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            {ko.common.logout}
          </button>
        </form>
      </header>
      <div className="flex flex-1 flex-col px-5 pb-8">{children}</div>
    </div>
  );
}
