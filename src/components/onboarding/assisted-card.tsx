"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { proposeScreenShareTime } from "@/app/(guest)/p/[code]/actions";
import { ko } from "@/content/ko";

// assisted 등급의 첫 화면: 혼자 3개를 헤매게 두지 않고, 20분 화면공유 시간을 먼저 받는다
export function AssistedCard({ projectId, code, proposed }: { projectId: string; code: string; proposed: string | null }) {
  const router = useRouter();
  const copy = ko.portal.assisted;
  const [when, setWhen] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(proposed);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (when.trim().length < 2) return;
    setError(null);
    startTransition(async () => {
      const result = await proposeScreenShareTime({ projectId, code, when });
      if (!result.ok) {
        setError(result.message ?? ko.common.error);
        return;
      }
      setDone(when);
      router.refresh();
    });
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-5">
        <p className="flex items-center gap-2 text-base font-semibold">
          <Video className="size-5 text-primary" />
          {copy.title}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        {done ? (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{copy.thanks(done)}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
            />
            <Button type="button" size="lg" disabled={pending || when.trim().length < 2} onClick={submit}>
              {pending ? ko.common.loading : copy.submit}
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">{copy.selfHint}</p>
      </CardContent>
    </Card>
  );
}
