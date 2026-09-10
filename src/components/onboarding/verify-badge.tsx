import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ko } from "@/content/ko";
import type { VerifyResult } from "@/lib/database.types";

// 검증 3상태 배지. error를 not_found처럼 보이게 하지 않는다.
// 다만 의뢰인 화면(side="client")에서는 error를 「제작자 확인 중」으로 부른다 —
// 원인은 늘 내 쪽(토큰 미설정·만료·네트워크)이고, 의뢰인이 할 일은 없다.
// 데이터와 관리자 화면에서는 그대로 빨간 「확인 오류」다.
function VerifyBadge({
  result,
  side = "admin",
}: {
  result: VerifyResult | null;
  side?: "admin" | "client";
}) {
  if (!result) {
    return <Badge variant="muted">{ko.status.verify.never}</Badge>;
  }
  const clientError = side === "client" && result.status === "error";
  const variant = clientError
    ? "muted"
    : result.status === "verified"
      ? "success"
      : result.status === "not_found"
        ? "warning"
        : "destructive";
  const label = clientError
    ? ko.status.verify.clientError
    : ko.status.verify[result.status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-xs text-muted-foreground">
        {format(new Date(result.checked_at), "MM.dd HH:mm")}
      </span>
    </span>
  );
}

export { VerifyBadge };
