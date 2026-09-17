"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ackInvite } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import { ackCopy } from "@/lib/verify/copy";

export interface AckItem {
  stepId: string;
  stepKey: string;
  service: string;
  title: string;
  hoursWaiting: number;
  notCame: boolean;
  came: boolean;
}

// 「초대 메일 확인 [왔음·수락했음] [안 왔음]」 — 내 메일함을 본 결과를 한 번 누른다
export function AckPanel({ items, code }: { items: AckItem[]; code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const copy = ko.admin.ack;
  if (items.length === 0) return null;

  function act(item: AckItem, came: boolean) {
    setNote(null);
    const own = ackCopy(item.stepKey);
    startTransition(async () => {
      const result = await ackInvite({ stepId: item.stepId, code, came });
      setNote(result.ok ? (result.message ?? (came ? own.cameDone : own.notCameDone)) : (result.message ?? ko.common.error));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MailCheck className="size-3.5" />
        {copy.title}
      </span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const own = ackCopy(item.stepKey);
          return (
          <li key={item.stepId} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <span className="font-medium">{own.question(item.service)}</span>
            <span className="text-xs text-muted-foreground">
              {item.came ? copy.acceptedWaiting : item.notCame ? copy.waitingClient : copy.waiting(item.hoursWaiting)}
            </span>
            {item.came ? (
              <span className="ml-auto flex gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(item, false)}>
                  {copy.cameNotVisible}
                </Button>
              </span>
            ) : null}
            {!item.came ? (
              <span className="ml-auto flex gap-1.5">
                <Button type="button" size="sm" disabled={pending} onClick={() => act(item, true)}>
                  {own.came}
                </Button>
                {!item.notCame ? (
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(item, false)}>
                    {own.notCame}
                  </Button>
                ) : null}
              </span>
            ) : null}
          </li>
          );
        })}
      </ul>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
