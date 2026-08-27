import { redirect } from "next/navigation";
import { resolveHomePath } from "@/lib/auth";

export default async function RootPage() {
  const home = await resolveHomePath();
  redirect(home ?? "/login");
}
