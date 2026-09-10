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
import { CONNECT_META } from "@/lib/steps";
import { startStep } from "@/app/(guest)/p/[code]/actions";
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
  projectId,
  projectCode,
  currentSlug,
  inviteEmail,
}: {
  step: StepRow;
  projectId: string;
  projectCode: string;
  currentSlug: string | null;
  inviteEmail: string;
}) {
  // 함수가 포함된 메타는 서버에서 prop으로 넘기지 못한다(직렬화 불가) —
  // 클라이언트에서 step.key로 직접 조회한다.
  const meta = CONNECT_META[step.key];
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(
    step.status === "client_done" ? "verify" : currentSlug ? "invite" : "create",
  );
  const [verifying, startVerify] = useTransition();
  const [lastResult, setLastResult] = useState<VerifyResult | null>(
    step.verify_result,
  );

  const isVerified = step.status === "verified";

  if (!meta) return null;

  function runVerify() {
    startVerify(async () => {
      try {
        const response = await fetch(`/api/verify/${meta.provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepId: step.id }),
        });
        if (!response.ok) {
          setLastResult({ status: "error", code: "network", checked_at: new Date().toISOString() });
          return;
        }
        const data = (await response.json()) as { result: VerifyResult };
        setLastResult(data.result);
        router.refresh();
      } catch {
        setLastResult({ status: "error", code: "network", checked_at: new Date().toISOString() });
      }
    });
  }

  if (isVerified) {
    // 내가 눈으로 보고 「확인 완료로」 처리하면 verify_result에는 옛 error/not_found가
    // 남는다. 확인 완료 카드에서 「제작자 확인 중」이 같이 뜨면 안 되므로,
    // verified 결과가 아니면 verified_at으로 대신한다. 데이터는 건드리지 않는다
    const shownResult: VerifyResult | null =
      step.verify_result?.status === "verified"
        ? step.verify_result
        : step.verified_at
          ? { status: "verified", checked_at: step.verified_at }
          : null;
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-3 p-5">
          <PartyPopper className="size-6 shrink-0 text-success" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">{ko.stepDetail.verifiedTitle}</p>
            {shownResult ? (
              <VerifyBadge result={shownResult} side="client" />
            ) : null}
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
            onClick={() => {
              setStage("slug");
              // 서버에도 「시작했다」를 남긴다 — 이틀째 초대 전 신호의 기준점
              if (step.status === "todo") void startStep({ stepId: step.id, code: projectCode });
            }}
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
              <VerifyBadge result={lastResult} side="client" />
            </div>
            {lastResult && lastResult.status !== "verified" ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {(lastResult.code && ko.stepDetail.verifyCode[lastResult.code]) ??
                  (lastResult.status === "error"
                    ? ko.stepDetail.verifyErrorHint
                    : ko.stepDetail.verifyNotFoundHint)}
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
