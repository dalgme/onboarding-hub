import type { StepRow } from "@/lib/database.types";

// 진행률 = (verified × 1.0 + client_done × 0.5) / 전체 단계 수
// skipped는 분모에서 뺀다 — 남겨두면 100%에 영원히 못 닿는다.
export function calcProgress(
  steps: Pick<StepRow, "status">[],
): number {
  const counted = steps.filter((step) => step.status !== "skipped");
  if (counted.length === 0) return 0;
  const score = counted.reduce((sum, step) => {
    if (step.status === "verified") return sum + 1;
    if (step.status === "client_done") return sum + 0.5;
    return sum;
  }, 0);
  return (score / counted.length) * 100;
}
