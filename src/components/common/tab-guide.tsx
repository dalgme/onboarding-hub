import { Info } from "lucide-react";
import { ko } from "@/content/ko";

// 각 탭 상단의 사용법 안내 박스. 접을 수 있고 기본은 펼침.
function TabGuide({ items }: { items: readonly string[] }) {
  return (
    <details
      open
      className="rounded-lg border border-primary/25 bg-accent/60 px-4 py-3"
    >
      <summary className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
        <Info className="size-4 shrink-0" />
        {ko.common.guideTitle}
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

export { TabGuide };
