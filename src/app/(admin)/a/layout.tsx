import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { isAdminUser } from "@/lib/auth";
import { logout } from "@/app/logout-action";
import { ko } from "@/content/ko";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await isAdminUser();
  if (!admin) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <Link href="/a" className="text-sm font-bold">
          {ko.common.appName}
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/cost"
            className="text-muted-foreground hover:text-foreground"
          >
            {ko.cost.title}
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" />
              {ko.common.logout}
            </button>
          </form>
        </nav>
      </header>
      <div className="flex flex-1 flex-col px-6 py-6">{children}</div>
    </div>
  );
}
