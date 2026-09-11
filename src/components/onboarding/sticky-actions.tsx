"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, MonitorUp, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  requestScreenShareHelp,
  updateStepStatus,
} from "@/app/(guest)/p/[code]/actions";
import { DONE_CHECKLIST } from "@/lib/steps";
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
  // 자동 확인이 없는 단계는 「완료」 전에 스스로 확인하게 한다 (저장하지 않는다)
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const checklist = DONE_CHECKLIST[step.key] ?? null;
  // 「완료했습니다」를 두 번 눌렀는데도 확인이 안 됐다 — 세 번째 시도보다 화면공유가 빠르다
  const helpFirst = (step.verify_result?.client_attempts ?? 0) >= 2 && step.status !== "verified";
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (step.status === "verified" || step.status === "skipped") {
    return null;
  }

  // 체크리스트는 열 때마다 백지에서 시작한다 — 「이번에 눈으로 확인했다」가 목적이다
  function openChecklist() {
    setNotice(null);
    setErrorMessage(null);
    setChecked(new Set());
    setChecklistOpen(true);
  }
  function closeChecklist() {
    setChecklistOpen(false);
    setChecked(new Set());
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
      closeChecklist();
      setBlockedReason("");
      router.refresh();
    });
  }

  const isBlocked = step.status === "blocked";
  // 완료 요청을 이미 보낸 단계 — 다시 보내지 않게 한다 (알림 중복 방지). 막힘·도움 요청은 열어 둔다
  const isClientDone = step.status === "client_done";
  const allChecked = checklist ? checked.size === checklist.length : true;

  function submitDone() {
    run(
      () =>
        updateStepStatus({
          stepId: step.id,
          code: projectCode,
          status: "client_done",
        }),
      ko.stepDetail.doneSent,
    );
  }

  return (
    <>
      {/* 완료 전 자기확인 — 화면을 덮지 않도록 별도 시트로 띄우고 본문은 스크롤된다 */}
      {checklistOpen && checklist ? (
        <div
          role="dialog"
          aria-label={ko.stepDetail.doneChecklistTitle}
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[80dvh] w-full max-w-xl flex-col rounded-t-2xl border border-border bg-background shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">{ko.stepDetail.doneChecklistTitle}</span>
            <button
              type="button"
              onClick={closeChecklist}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={ko.common.cancel}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {ko.stepDetail.doneChecklistHelp}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {checklist.map((item, index) => (
                <li key={item}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md px-1 py-2 text-sm leading-relaxed hover:bg-accent">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={checked.has(index)}
                      onChange={(event) => {
                        const next = new Set(checked);
                        if (event.target.checked) next.add(index);
                        else next.delete(index);
                        setChecked(next);
                      }}
                    />
                    <span>{item}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              variant="success"
              className="flex-1"
              disabled={pending || !allChecked}
              onClick={submitDone}
            >
              <ThumbsUp className="size-4" />
              {ko.stepDetail.doneChecklistSubmit}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={closeChecklist}>
              {ko.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}

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
              <label htmlFor="blocked-reason" className="text-sm font-medium">
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
            <div className="flex flex-col gap-2">
              {isClientDone && !notice ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {ko.stepDetail.doneSent}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                {!isClientDone ? (
                  <Button
                    type="button"
                    variant="success"
                    className="flex-1"
                    disabled={pending}
                    onClick={() => (checklist ? openChecklist() : submitDone())}
                  >
                    <ThumbsUp className="size-4" />
                    {ko.stepDetail.doneButton}
                  </Button>
                ) : null}
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
                  variant={helpFirst ? "default" : "secondary"}
                  className={helpFirst ? "order-first flex-1" : "flex-1"}
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
