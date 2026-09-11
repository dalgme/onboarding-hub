"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSetStepStatus } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";

export interface ManualAckItem {
  stepId: string;
  title: string;
  hoursWaiting: number;
}

// 수동 의뢰인 단계의 완료 요청 — 「현재 상황」에서 [확인 완료로] [대기로 되돌리기] 한 번
export function ManualAckPanel({ items, code }: { items: ManualAckItem[]; code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const copy = ko.admin.manualAck;
  if (items.length === 0) return null;

  function act(stepId: string, status: "verified" | "todo") {
    setNote(null);
    startTransition(async () => {
      const result = await adminSetStepStatus({ stepId, code, status });
      setNote(result.ok ? (status === "verified" ? copy.verifiedDone : copy.todoDone) : (result.message ?? ko.common.error));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ClipboardCheck className="size-3.5" />
        {copy.title}
      </span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.stepId} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <span className="font-medium">{item.title}</span>
            <span className="text-xs text-muted-foreground">{copy.waiting(item.hoursWaiting)}</span>
            <span className="ml-auto flex gap-1.5">
              <Button type="button" size="sm" variant="success" disabled={pending} onClick={() => act(item.stepId, "verified")}>
                {ko.admin.steps.markVerified}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => act(item.stepId, "todo")}>
                {copy.backToTodo}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
