"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OFFBOARD_CHECKLIST } from "@/lib/offboard";
import { closeProject, revokeGuestAccess } from "@/app/(admin)/a/actions";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

// 종료 체크리스트: 위에서부터 순서대로만 체크 가능.
// 체크 상태는 저장하지 않는다 — 종료 처리 그 자체가 결과다.
export function OffboardPanel({
  projectId,
  projectCode,
  closedAt,
}: {
  projectId: string;
  projectCode: string;
  closedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkedCount, setCheckedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revokeNote, setRevokeNote] = useState<string | null>(null);

  function revoke() {
    if (!window.confirm(ko.admin.offboard.revokeConfirm)) return;
    setRevokeNote(null);
    startTransition(async () => {
      const result = await revokeGuestAccess({ projectId, code: projectCode });
      if (!result.ok) {
        setRevokeNote(result.message ?? ko.common.error);
        return;
      }
      setRevokeNote(
        (result.removedGuests ?? 0) === 0
          ? ko.admin.offboard.revokeNothing
          : ko.admin.offboard.revokeDone(result.removedGuests ?? 0, result.deletedUsers ?? 0, result.keptUsers?.length ?? 0),
      );
      router.refresh();
    });
  }

  const allChecked = checkedCount >= OFFBOARD_CHECKLIST.length;

  function toggle(index: number) {
    // 순서 강제: 다음 항목만 체크, 마지막 체크 항목만 해제할 수 있다
    if (index === checkedCount) setCheckedCount(index + 1);
    else if (index === checkedCount - 1) setCheckedCount(index);
  }

  function complete() {
    if (!window.confirm(ko.admin.offboard.completeConfirm)) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result = await closeProject({ projectId, code: projectCode });
      if (!result.ok) setErrorMessage(result.message ?? ko.common.error);
      router.refresh();
    });
  }

  if (closedAt) {
    return (
      <div className="flex max-w-2xl items-center gap-3 rounded-lg border border-success/40 bg-success/5 p-5">
        <CheckCircle2 className="size-6 shrink-0 text-success" />
        <p className="font-medium">
          {ko.admin.offboard.closedAt(format(new Date(closedAt), "yyyy.MM.dd"))}
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{ko.admin.offboard.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ko.admin.offboard.help}
        </p>
      </div>

      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {OFFBOARD_CHECKLIST.map((item, index) => {
          const checked = index < checkedCount;
          const enabled = index === checkedCount || index === checkedCount - 1;
          return (
            <li key={item.key}>
              <label
                className={cn(
                  "flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3",
                  !enabled && !checked && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={checked}
                  disabled={!enabled}
                  onChange={() => toggle(index)}
                />
                <span className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      checked && "text-muted-foreground line-through",
                    )}
                  >
                    {index + 1}. {item.title}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {item.detail}
                  </span>
                  {item.key === "revoke-guest" ? (
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={revoke}>
                        {ko.admin.offboard.revokeButton}
                      </Button>
                      {revokeNote ? <span className="text-xs text-muted-foreground">{revokeNote}</span> : null}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ol>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        disabled={!allChecked || pending}
        onClick={complete}
        className="self-start"
      >
        {ko.admin.offboard.completeButton}
      </Button>
      {!allChecked ? (
        <p className="text-xs text-muted-foreground">
          {ko.admin.offboard.notReady}
        </p>
      ) : null}
    </div>
  );
}
