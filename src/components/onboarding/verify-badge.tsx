import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ko } from "@/content/ko";
import type { VerifyResult } from "@/lib/database.types";

// 검증 3상태 배지. error를 not_found처럼 보이게 하지 않는다.
function VerifyBadge({ result }: { result: VerifyResult | null }) {
  if (!result) {
    return <Badge variant="muted">{ko.status.verify.never}</Badge>;
  }
  const variant =
    result.status === "verified"
      ? "success"
      : result.status === "not_found"
        ? "warning"
        : "destructive";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={variant}>{ko.status.verify[result.status]}</Badge>
      <span className="text-xs text-muted-foreground">
        {format(new Date(result.checked_at), "MM.dd HH:mm")}
      </span>
    </span>
  );
}

export { VerifyBadge };
