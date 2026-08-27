import Link from "next/link";
import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  CircleDot,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import { StepStatusBadge } from "@/components/onboarding/step-status-badge";
import type { StepRow } from "@/lib/database.types";

function StepIcon({ status }: { status: StepRow["status"] }) {
  const base = "size-5 shrink-0";
  switch (status) {
    case "verified":
      return <Check className={cn(base, "text-success")} />;
    case "blocked":
      return <CircleAlert className={cn(base, "text-destructive")} />;
    case "doing":
    case "client_done":
      return <CircleDot className={cn(base, "text-primary")} />;
    case "skipped":
      return <Minus className={cn(base, "text-muted-foreground")} />;
    default:
      return <CircleDashed className={cn(base, "text-muted-foreground")} />;
  }
}

// 포털 홈의 단계 목록. 각 단계는 상세 화면으로 링크된다.
function StepStepper({
  steps,
  projectCode,
}: {
  steps: StepRow[];
  projectCode: string;
}) {
  return (
    <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      {steps.map((step) => (
        <li key={step.id}>
          <Link
            href={`/p/${projectCode}/steps/${step.key}`}
            className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
          >
            <StepIcon status={step.status} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm font-medium",
                  step.status === "skipped" &&
                    "text-muted-foreground line-through",
                )}
              >
                {step.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {ko.status.ownerSide[step.owner_side]}
              </span>
            </div>
            <StepStatusBadge status={step.status} />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

export { StepStepper };
