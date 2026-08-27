"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, MonitorUp, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  requestScreenShareHelp,
  updateStepStatus,
} from "@/app/(guest)/p/[code]/actions";
import { ko } from "@/content/ko";
import type { StepRow } from "@/lib/database.types";

// 하단 sticky 액션 바: [완료했습니다] [막혔어요] [화면공유로 도움받기]
export function StickyActions({
  step,
  projectId,
  projectCode,
}: {
  step: StepRow;
  projectId: string;
  projectCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blockedReason, setBlockedReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (step.status === "verified" || step.status === "skipped") {
    return null;
  }

  function run(action: () => Promise<{ ok: boolean; message?: string }>, doneMessage: string) {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setErrorMessage(result.message ?? ko.common.error);
        return;
      }
      setNotice(doneMessage);
      setBlockedOpen(false);
      setBlockedReason("");
      router.refresh();
    });
  }

  const isBlocked = step.status === "blocked";

  return (
    <div className="sticky bottom-0 -mx-5 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        {notice ? (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            {notice}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {isBlocked ? (
          <div className="flex flex-col gap-2">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ko.stepDetail.blockedBanner(
                step.blocked_reason === "need_help"
                  ? ko.stepDetail.needHelpReason
                  : (step.blocked_reason ?? ""),
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateStepStatus({
                      stepId: step.id,
                      code: projectCode,
                      status: "doing",
                    }),
                  ko.common.saved,
                )
              }
            >
              {ko.stepDetail.resume}
            </Button>
          </div>
        ) : blockedOpen ? (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="blocked-reason"
              className="text-sm font-medium"
            >
              {ko.stepDetail.blockedPrompt}
            </label>
            <Textarea
              id="blocked-reason"
              value={blockedReason}
              placeholder={ko.stepDetail.blockedPlaceholder}
              onChange={(event) => setBlockedReason(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={pending || blockedReason.trim().length === 0}
                onClick={() =>
                  run(
                    () =>
                      updateStepStatus({
                        stepId: step.id,
                        code: projectCode,
                        status: "blocked",
                        blockedReason: blockedReason.trim(),
                      }),
                    ko.stepDetail.blockedSent,
                  )
                }
              >
                {ko.stepDetail.blockedSubmit}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setBlockedOpen(false)}
              >
                {ko.common.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="success"
              className="flex-1"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateStepStatus({
                      stepId: step.id,
                      code: projectCode,
                      status: "client_done",
                    }),
                  ko.stepDetail.doneSent,
                )
              }
            >
              <ThumbsUp className="size-4" />
              {ko.stepDetail.doneButton}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => setBlockedOpen(true)}
            >
              <CircleAlert className="size-4" />
              {ko.stepDetail.blockedButton}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    requestScreenShareHelp({
                      stepId: step.id,
                      projectId,
                      code: projectCode,
                    }),
                  ko.stepDetail.helpSent,
                )
              }
            >
              <MonitorUp className="size-4" />
              {ko.stepDetail.helpButton}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
