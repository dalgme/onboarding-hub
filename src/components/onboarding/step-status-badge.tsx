import { Badge } from "@/components/ui/badge";
import { ko } from "@/content/ko";
import type { StepStatus } from "@/lib/database.types";

const VARIANTS: Record<
  StepStatus,
  "muted" | "secondary" | "warning" | "success" | "destructive" | "outline"
> = {
  todo: "muted",
  doing: "secondary",
  client_done: "warning",
  verified: "success",
  blocked: "destructive",
  skipped: "outline",
};

function StepStatusBadge({ status }: { status: StepStatus }) {
  return <Badge variant={VARIANTS[status]}>{ko.status.step[status]}</Badge>;
}

export { StepStatusBadge };
