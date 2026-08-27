import * as React from "react";
import { cn } from "@/lib/utils";

// 5% 단위로 반올림해 정적 클래스로 그린다.
// (인라인 style 금지 — Tailwind JIT는 소스에 리터럴로 있어야 컴파일된다)
const WIDTH_CLASSES = [
  "w-[0%]",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-[100%]",
] as const;

// value: 0~100
function Progress({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  // 0이 아닌 진행률은 최소 5%로 보이게 올림 처리
  const bucket =
    clamped === 0 ? 0 : Math.max(1, Math.round(clamped / 5));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn(
        "h-2.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-all",
          WIDTH_CLASSES[bucket],
        )}
      />
    </div>
  );
}

export { Progress };
