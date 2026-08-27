import { Loader2 } from "lucide-react";
import { ko } from "@/content/ko";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">{ko.common.loading}</p>
    </main>
  );
}
