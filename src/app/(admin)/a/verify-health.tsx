import Link from "next/link";
import { format } from "date-fns";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { checkVerifyTokens, type TokenStatus } from "@/lib/verify/health";
import { createClient } from "@/lib/supabase/server";
import { differenceInMinutes } from "date-fns";
import { ko } from "@/content/ko";
import type { VerifyResult } from "@/lib/database.types";

export interface RecentVerifyError {
  projectCode: string;
  projectName: string;
  stepTitle: string;
  result: VerifyResult;
}

const STATUS_VARIANT: Record<TokenStatus, "success" | "destructive" | "warning"> =
  {
    ok: "success",
    missing: "destructive",
    invalid: "destructive",
    mismatch: "destructive",
    error: "warning",
  };

// 대시보드 최상단 「검증 설정 점검」.
// 토큰 3개를 실제로 호출해 본 결과와, 의뢰인 화면에서 실패한 확인 목록.
// 하나라도 빨간색이면 의뢰인이 「연결 확인하기」를 눌러도 자동 확인이 되지 않는다.
export async function VerifyHealth({
  recentErrors,
}: {
  recentErrors: RecentVerifyError[];
}) {
  const supabase = await createClient();
  const [tokens, { data: adminRow }] = await Promise.all([
    checkVerifyTokens(),
    supabase
      .from("admins")
      .select("last_tick_started_at, last_tick_finished_at")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  const allOk = tokens.every((token) => token.status === "ok");
  const copy = ko.admin.health;
  const tick = describeTick(adminRow ?? null);

  return (
    <section
      className={
        allOk
          ? "rounded-lg border border-border bg-card px-4 py-3"
          : "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
      }
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {allOk ? (
          <ShieldCheck className="size-4 text-success" />
        ) : (
          <ShieldAlert className="size-4 text-destructive" />
        )}
        {copy.title}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {copy.description}
      </p>

      <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
        {tokens.map((token) => (
          <li key={token.key} className="flex flex-col gap-0.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="font-medium">{copy.items[token.key].label}</span>
              <Badge variant={STATUS_VARIANT[token.status]}>
                {copy.statuses[token.status]}
              </Badge>
            </span>
            <code className="text-xs text-muted-foreground">{token.envName}</code>
            {token.status !== "ok" ? (
              <span className="text-xs leading-relaxed text-foreground/80">
                {token.detail ? `${token.detail} · ` : ""}
                {copy.items[token.key].howTo}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {!allOk ? (
        <p className="mt-3 text-xs leading-relaxed text-foreground/80">
          {copy.fix}
        </p>
      ) : null}

      <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-sm">
        <span className="font-medium">{ko.admin.tick.title}</span>
        <Badge variant={tick.ok ? "success" : "destructive"}>{tick.ok ? "정상" : "확인 필요"}</Badge>
        <span className="text-xs text-muted-foreground">{tick.text}</span>
      </p>

      <div className="mt-3 border-t border-border/60 pt-3">
        <p className="text-xs font-medium text-muted-foreground">
          {copy.recentErrors}
        </p>
        {recentErrors.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {copy.noRecentErrors}
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {recentErrors.map((item) => (
              <li key={`${item.projectCode}-${item.stepTitle}`}>
                <Link
                  href={`/a/${item.projectCode}?tab=steps`}
                  className="font-medium text-primary hover:underline"
                >
                  {item.projectName}
                </Link>
                <span className="text-muted-foreground">
                  {" · "}
                  {item.stepTitle}
                  {" · "}
                  {format(new Date(item.result.checked_at), "MM.dd HH:mm")}
                  {item.result.detail ? ` · ${item.result.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// 설정 탭 「접속 정보 발급」 위에 붙는 경고. 사고의 실제 경로는
// 「생성 → 발급 → 카톡 전송」이고 그 길에는 대시보드가 없다 — 보내는 자리에서 막는다.
// 전부 정상이면 아무것도 그리지 않는다. 발급 자체는 막지 않는다.
export async function VerifyTokenWarning() {
  const tokens = await checkVerifyTokens();
  const broken = tokens.filter((token) => token.status !== "ok");
  if (broken.length === 0) return null;
  const copy = ko.admin.health;
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <span className="flex flex-wrap items-center gap-2 font-semibold text-destructive">
        <ShieldAlert className="size-4 shrink-0" />
        {copy.title}
        {broken.map((token) => (
          <Badge key={token.key} variant={STATUS_VARIANT[token.status]}>
            {copy.items[token.key].label} · {copy.statuses[token.status]}
          </Badge>
        ))}
      </span>
      <p className="text-xs leading-relaxed text-foreground/80">
        {copy.issueWarning}
      </p>
      <Link
        href="/a"
        className="text-xs font-medium text-primary hover:underline"
      >
        {copy.issueWarningLink}
      </Link>
    </div>
  );
}

export function VerifyHealthFallback() {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      {ko.admin.health.checking}
    </section>
  );
}

// 크론 tick 의 생존 — 마지막 완주 시각으로 판정한다. 15분 주기라 45분이 넘으면 죽은 것이다.
// started 만 갱신되고 finished 가 뒤처지면 「완주 못 함」이다
const TICK_STALE_MINUTES = 45;

function describeTick(
  row: { last_tick_started_at: string | null; last_tick_finished_at: string | null } | null,
): { ok: boolean; text: string } {
  const copy = ko.admin.tick;
  if (!row?.last_tick_finished_at) return { ok: false, text: copy.never };
  const finishedAgo = differenceInMinutes(new Date(), new Date(row.last_tick_finished_at));
  if (
    row.last_tick_started_at &&
    row.last_tick_started_at > row.last_tick_finished_at &&
    differenceInMinutes(new Date(), new Date(row.last_tick_started_at)) > 10
  ) {
    return { ok: false, text: copy.unfinished };
  }
  if (finishedAgo > TICK_STALE_MINUTES) return { ok: false, text: copy.stale(finishedAgo) };
  return { ok: true, text: copy.ok(finishedAgo) };
}
