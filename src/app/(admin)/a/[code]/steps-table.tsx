"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { StepStatusBadge } from "@/components/onboarding/step-status-badge";
import { VerifyBadge } from "@/components/onboarding/verify-badge";
import { adminSetStepStatus } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { StepRow, VerifyResult } from "@/lib/database.types";

// 관리자용 단계 테이블: 검증 실행 + verified/skipped/todo 전환(나만 가능).
export function StepsTable({
  steps,
  projectCode,
}: {
  steps: StepRow[];
  projectCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function setStatus(stepId: string, status: "todo" | "verified" | "skipped") {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await adminSetStepStatus({
        stepId,
        code: projectCode,
        status,
      });
      if (!result.ok) setErrorMessage(result.message ?? ko.common.error);
      router.refresh();
    });
  }

  async function runVerify(step: StepRow) {
    setErrorMessage(null);
    setVerifyingId(step.id);
    try {
      const response = await fetch(`/api/verify/${step.verify_type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.id }),
      });
      if (!response.ok) {
        setErrorMessage(ko.common.error);
        return;
      }
      const data = (await response.json()) as { result: VerifyResult };
      if (data.result.status === "error" && data.result.detail) {
        setErrorMessage(data.result.detail);
      }
      router.refresh();
    } catch {
      setErrorMessage(ko.common.error);
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {errorMessage ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">#</th>
              <th className="px-4 py-2.5 font-medium">{ko.admin.tableName}</th>
              <th className="px-4 py-2.5 font-medium">{ko.admin.tableStatus}</th>
              <th className="px-4 py-2.5 font-medium">
                {ko.admin.steps.lastVerify}
              </th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr
                key={step.id}
                className="border-b border-border align-top last:border-b-0"
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {step.order_index + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{step.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {ko.status.ownerSide[step.owner_side]} · {step.key}
                    </span>
                    {step.status === "blocked" && step.blocked_reason ? (
                      <span className="text-xs text-destructive">
                        {ko.admin.steps.blockedReason}:{" "}
                        {step.blocked_reason === "need_help"
                          ? ko.stepDetail.needHelpReason
                          : step.blocked_reason}
                      </span>
                    ) : null}
                    {step.checked_at ? (
                      <span className="text-xs text-muted-foreground">
                        {ko.admin.steps.clientDoneAt}:{" "}
                        {format(new Date(step.checked_at), "MM.dd HH:mm")}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StepStatusBadge status={step.status} />
                </td>
                <td className="px-4 py-3">
                  {step.verify_type !== "manual" ? (
                    <VerifyBadge result={step.verify_result} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {step.verify_type !== "manual" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={verifyingId === step.id}
                        onClick={() => runVerify(step)}
                      >
                        {verifyingId === step.id
                          ? ko.stepDetail.verifyChecking
                          : ko.admin.steps.verifyNow}
                      </Button>
                    ) : null}
                    {step.status !== "verified" ? (
                      <Button
                        type="button"
                        variant="success"
                        size="sm"
                        disabled={pending}
                        onClick={() => setStatus(step.id, "verified")}
                      >
                        {ko.admin.steps.markVerified}
                      </Button>
                    ) : null}
                    {step.status !== "skipped" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => setStatus(step.id, "skipped")}
                      >
                        {ko.admin.steps.markSkipped}
                      </Button>
                    ) : null}
                    {step.status !== "todo" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => setStatus(step.id, "todo")}
                      >
                        {ko.admin.steps.reset}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
