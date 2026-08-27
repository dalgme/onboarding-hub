import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">{ko.common.notFound}</p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        {ko.common.back}
      </Link>
    </main>
  );
}
