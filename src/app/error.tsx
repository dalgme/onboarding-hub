"use client";

import { Button } from "@/components/ui/button";
import { ko } from "@/content/ko";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground">{ko.common.error}</p>
      <Button type="button" variant="outline" onClick={reset}>
        {ko.common.confirm}
      </Button>
    </main>
  );
}
