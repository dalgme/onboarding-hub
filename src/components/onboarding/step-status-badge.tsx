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
  returned: "warning",
};

// side="admin" 이면 관리자식 이름(되돌림)을 쓴다. 의뢰인에게는 「한 가지만 더」
function StepStatusBadge({ status, side = "client" }: { status: StepStatus; side?: "client" | "admin" }) {
  const label = (side === "admin" && ko.status.stepAdmin[status]) || ko.status.step[status];
  return <Badge variant={VARIANTS[status]}>{label}</Badge>;
}

export { StepStatusBadge };
