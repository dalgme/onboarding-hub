import { ko } from "@/content/ko";
import { CostCalculator } from "@/app/cost/cost-calculator";

// 고정비 계산기 — 정적 페이지. 요율은 src/lib/cost.ts 상수.
export default function CostPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-6 py-10">
      <h1 className="text-xl font-bold">{ko.cost.title}</h1>
      <p className="text-sm text-muted-foreground">{ko.cost.description}</p>
      <CostCalculator />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {ko.cost.disclaimer}
      </p>
    </main>
  );
}
