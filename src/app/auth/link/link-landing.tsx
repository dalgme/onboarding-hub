"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ko } from "@/content/ko";

type Parsed = { tokenHash: string; type: string } | null;

function parseHash(hash: string): Parsed {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!tokenHash || !type) return null;
  return { tokenHash, type };
}

export function LinkLanding() {
  // 프래그먼트는 서버 렌더에 없다 — 마운트 뒤 브라우저에서만 읽는다
  const [state, setState] = useState<"reading" | "ready" | "invalid" | "going">("reading");
  const [parsed, setParsed] = useState<Parsed>(null);

  useEffect(() => {
    const value = parseHash(window.location.hash);
    setParsed(value);
    setState(value ? "ready" : "invalid");
  }, []);

  function go() {
    if (!parsed) return;
    setState("going");
    const params = new URLSearchParams({ token_hash: parsed.tokenHash, type: parsed.type });
    window.location.assign(`/auth/callback?${params.toString()}`);
  }

  if (state === "reading") {
    return <p className="mt-3 text-sm text-muted-foreground">{ko.common.loading}</p>;
  }
  if (state === "invalid") {
    return (
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{ko.authLink.invalid}</p>
        <Link href="/login" className="text-sm font-medium text-primary underline">
          {ko.authLink.toLogin}
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-muted-foreground">{ko.authLink.description}</p>
      <Button type="button" size="lg" onClick={go} disabled={state === "going"}>
        {state === "going" ? ko.authLink.going : ko.authLink.button}
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">{ko.authLink.hint}</p>
    </div>
  );
}
