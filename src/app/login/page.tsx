import { redirect } from "next/navigation";
import { ko } from "@/content/ko";
import { resolveHomePath } from "@/lib/auth";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const home = await resolveHomePath();
  if (home) redirect(home);

  const errorMessage =
    error === "no_access"
      ? ko.login.errorNoAccess
      : error === "auth"
        ? ko.login.errorAuth
        : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">{ko.login.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {ko.login.description}
      </p>
      {errorMessage ? (
        <p className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <div className="mt-6">
        <LoginForm />
      </div>
    </main>
  );
}
