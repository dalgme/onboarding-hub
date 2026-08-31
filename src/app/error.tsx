"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 의뢰인이 당황하지 않도록: 화면에는 안심 문구를, 제작자에게는 원인 단서를
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message.slice(0, 500),
        digest: error.digest,
        path: window.location.pathname,
      }),
    }).catch(() => {
      // 보고 자체가 실패해도 화면은 그대로 보여준다
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-bold">{ko.errorPage.title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {ko.errorPage.description}
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={reset}>
          {ko.errorPage.retry}
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          {ko.errorPage.home}
        </Link>
      </div>
    </main>
  );
}
