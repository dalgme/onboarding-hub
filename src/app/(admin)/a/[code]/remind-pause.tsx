"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pauseReminders } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";

// 리마인드 보류 칩 — 통화로 일정을 들었을 때 「3일/7일 보류」. 자동 문구가 그동안 만들어지지 않는다
export function RemindPause({ projectId, code, pausedUntil, tier }: { projectId: string; code: string; pausedUntil: string | null; tier: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const copy = ko.admin.remind;
  if (tier === "assisted") return null;
  const active = pausedUntil && pausedUntil > new Date().toISOString();

  function set(days: number | null) {
    startTransition(async () => {
      await pauseReminders({ projectId, code, days });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <BellOff className="size-3.5" />
        {copy.title}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-sm">
        {active ? (
          <>
            <span>{copy.pausedUntil(format(new Date(pausedUntil), "MM.dd"))}</span>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => set(null)}>
              {copy.resume}
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">{copy.active}</span>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => set(3)}>
              {copy.pause3}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => set(7)}>
              {copy.pause7}
            </Button>
          </>
        )}
      </span>
    </div>
  );
}
