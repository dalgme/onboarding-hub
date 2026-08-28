import { Badge } from "@/components/ui/badge";
import { ko } from "@/content/ko";

const WHO_LABEL: Record<string, string> = {
  me: ko.admin.process.whoMe,
  client: ko.admin.process.whoClient,
  both: ko.admin.process.whoBoth,
};

const WHO_VARIANT: Record<string, "secondary" | "warning" | "outline"> = {
  me: "secondary",
  client: "warning",
  both: "outline",
};

// 전체 프로세스 탭 — 의뢰 시작부터 종료까지의 흐름을 한 화면에.
export function ProcessTab() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {ko.admin.process.description}
      </p>
      <ol className="flex flex-col">
        {ko.admin.process.stages.map((stage, index) => (
          <li key={stage.title} className="relative flex gap-4 pb-6 last:pb-0">
            {index < ko.admin.process.stages.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-[15px] top-8 h-full w-px bg-border"
              />
            ) : null}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-background text-sm font-bold text-primary">
              {index + 1}
            </span>
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{stage.title}</span>
                <Badge variant={WHO_VARIANT[stage.who]}>
                  {WHO_LABEL[stage.who]}
                </Badge>
                <Badge variant="muted">{stage.where}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {stage.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
