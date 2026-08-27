"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/common/copy-button";
import { DeepLinkCard } from "@/components/onboarding/deep-link-card";
import { SlugInput } from "@/components/onboarding/slug-input";
import { VerifyBadge } from "@/components/onboarding/verify-badge";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import type { ConnectMeta } from "@/lib/steps";
import type { StepRow, VerifyResult } from "@/lib/database.types";

type Stage = "create" | "slug" | "invite" | "verify";

const STAGE_ORDER: Stage[] = ["create", "slug", "invite", "verify"];

const STAGE_LABELS: Record<Stage, string> = {
  create: ko.stepDetail.stageCreate,
  slug: ko.stepDetail.stageSlug,
  invite: ko.stepDetail.stageInvite,
  verify: ko.stepDetail.stageVerify,
};

// 계정 연결 미니 스텝퍼. 한 화면에 한 가지만 —
// 앞 단계(만들기 → 이름 → 초대 → 확인)가 끝나야 다음이 나타난다.
export function ConnectFlow({
  step,
  meta,
  projectId,
  projectCode,
  currentSlug,
  inviteEmail,
}: {
  step: StepRow;
  meta: ConnectMeta;
  projectId: string;
  projectCode: string;
  currentSlug: string | null;
  inviteEmail: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(currentSlug ? "invite" : "create");
  const [verifying, startVerify] = useTransition();
  const [lastResult, setLastResult] = useState<VerifyResult | null>(
    step.verify_result,
  );

  const isVerified = step.status === "verified";

  function runVerify() {
    startVerify(async () => {
      try {
        const response = await fetch(`/api/verify/${meta.provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId: step.id }),
        });
        if (!response.ok) {
          setLastResult({
            status: "error",
            checked_at: new Date().toISOString(),
            detail: ko.common.error,
          });
          return;
        }
        const data = (await response.json()) as { result: VerifyResult };
        setLastResult(data.result);
        router.refresh();
      } catch {
        setLastResult({
          status: "error",
          checked_at: new Date().toISOString(),
          detail: ko.common.error,
        });
      }
    });
  }

  if (isVerified) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-3 p-5">
          <PartyPopper className="size-6 shrink-0 text-success" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{ko.stepDetail.verifiedTitle}</p>
            <VerifyBadge result={step.verify_result} />
          </div>
        </CardContent>
      </Card>
    );
  }

  const stageIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-center gap-1.5">
        {STAGE_ORDER.map((item, index) => (
          <li key={item} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-full rounded-full",
                index <= stageIndex ? "bg-primary" : "bg-muted",
              )}
            />
            <button
              type="button"
              disabled={index > stageIndex}
              onClick={() => setStage(item)}
              className={cn(
                "text-[11px] leading-tight",
                index === stageIndex
                  ? "font-semibold text-primary"
                  : "text-muted-foreground",
                index > stageIndex && "cursor-default",
              )}
            >
              {STAGE_LABELS[item]}
            </button>
          </li>
        ))}
      </ol>

      {stage === "create" ? (
        <div className="flex flex-col gap-3">
          <DeepLinkCard
            title={`${meta.serviceName} ${meta.orgNoun}`}
            url={meta.createUrl}
            buttonLabel={ko.stepDetail.createButton(meta.serviceName)}
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setStage("slug")}
          >
            {ko.stepDetail.createDone}
          </Button>
        </div>
      ) : null}

      {stage === "slug" ? (
        <Card>
          <CardContent className="p-5">
            <SlugInput
              meta={meta}
              stepKey={step.key}
              projectId={projectId}
              projectCode={projectCode}
              currentSlug={currentSlug}
              onSaved={() => setStage("invite")}
            />
          </CardContent>
        </Card>
      ) : null}

      {stage === "invite" && currentSlug ? (
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>{ko.stepDetail.inviteTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                {ko.stepDetail.inviteRole(meta.roleName)}
              </p>
              <CopyButton
                value={inviteEmail}
                label={ko.stepDetail.inviteCopyEmail}
                size="lg"
                className="w-full"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {ko.stepDetail.inviteHint}
              </p>
              <a
                href={meta.inviteUrl(currentSlug)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-center text-sm font-medium text-primary underline"
              >
                {ko.stepDetail.inviteOpenPage}
              </a>
            </CardContent>
          </Card>
          <Button type="button" size="lg" onClick={() => setStage("verify")}>
            {ko.stepDetail.stageVerify}
          </Button>
        </div>
      ) : null}

      {stage === "invite" && !currentSlug ? (
        <Card>
          <CardContent className="p-5">
            <SlugInput
              meta={meta}
              stepKey={step.key}
              projectId={projectId}
              projectCode={projectCode}
              currentSlug={currentSlug}
            />
          </CardContent>
        </Card>
      ) : null}

      {stage === "verify" ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              <VerifyBadge result={lastResult} />
            </div>
            {lastResult?.status === "not_found" ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {lastResult.detail ? `${lastResult.detail}. ` : ""}
                {ko.stepDetail.verifyNotFoundHint}
              </p>
            ) : null}
            {lastResult?.status === "error" ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {ko.stepDetail.verifyErrorHint}
              </p>
            ) : null}
            <Button
              type="button"
              size="lg"
              disabled={verifying}
              onClick={runVerify}
            >
              {verifying
                ? ko.stepDetail.verifyChecking
                : ko.stepDetail.verifyButton}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
