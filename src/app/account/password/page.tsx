import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ko } from "@/content/ko";
import { PasswordChangeForm } from "@/app/account/password/password-change-form";

// 임시 비밀번호로 로그인한 사용자가 새 비밀번호를 정하는 화면.
export default async function PasswordChangePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">{ko.passwordChange.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {ko.passwordChange.description}
      </p>
      <div className="mt-6">
        <PasswordChangeForm />
      </div>
    </main>
  );
}
