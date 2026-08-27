import { createClient } from "@/lib/supabase/server";

// 로그인 후 분기: admins에 있으면 /a, project_guests에 있으면 /p/[code].
// 둘 다 아니면 null — 접근 권한 없음.
export async function resolveHomePath(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: adminRow } = await supabase
    .from("admins")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  if (adminRow) return "/a";

  const { data: guestRows } = await supabase
    .from("project_guests")
    .select("project_id, projects(code)")
    .eq("email", user.email)
    .order("created_at", { ascending: false });

  const code = guestRows
    ?.map((row) => {
      const project = row.projects as unknown as { code: string } | null;
      return project?.code;
    })
    .find((value): value is string => Boolean(value));

  return code ? `/p/${code}` : null;
}

export async function getAuthedEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function isAdminUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  const { data } = await supabase
    .from("admins")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();
  return Boolean(data);
}
