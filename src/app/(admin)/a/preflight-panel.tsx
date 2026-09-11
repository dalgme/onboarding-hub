import { ShieldAlert, ShieldCheck } from "lucide-react";
import { runPreflight } from "@/lib/preflight";
import { ko } from "@/content/ko";

// 새 프로젝트 화면의 사전 점검 — 빨강은 나중에 접속 정보 발급을 막는다. 여기서 먼저 보여 준다
export async function PreflightPanel() {
  const report = await runPreflight({ infra: true });
  const red = report.issues.filter((issue) => issue.level === "red");
  const yellow = report.issues.filter((issue) => issue.level === "yellow");
  const copy = ko.admin.preflight;
  if (red.length === 0 && yellow.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
        <ShieldCheck className="size-4 text-success" />
        {copy.allClear}
      </p>
    );
  }
  return (
    <div
      role={red.length > 0 ? "alert" : undefined}
      className={
        red.length > 0
          ? "flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
          : "flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm"
      }
    >
      <span className="flex items-center gap-2 font-semibold">
        <ShieldAlert className={red.length > 0 ? "size-4 text-destructive" : "size-4 text-warning"} />
        {copy.title}
      </span>
      <ul className="list-disc pl-5">
        {red.map((issue) => (
          <li key={issue.key} className="text-destructive">{issue.message}</li>
        ))}
        {yellow.map((issue) => (
          <li key={issue.key}>{issue.message}</li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {red.length > 0 ? copy.redHint : copy.yellowHint}
      </p>
    </div>
  );
}
