import { createAdminClient } from "@/lib/supabase/admin";
import { checkVerifyTokens, type TokenHealth } from "@/lib/verify/health";
import { reverifyStale } from "@/lib/verify/run";
import { pushAdmin, minuteOf } from "@/lib/notify";
import { sweepOutbox } from "@/lib/outbox";
import { ko } from "@/content/ko";

// 시계 하나. Vercel Cron 이 15분마다 /api/cron/tick 을 부르고, 그 라우트는 이 함수만 부른다.
// 화면이 열리지 않아도 토큰 점검·재검증·장부 정리·「보낼 카톡」 거둠이 돈다.
// 원칙: 판단만 하고 행동은 기존 서버 함수를 부른다. 멱등 — 밀린 일을 매번 다시 계산한다.
// 각 작업은 따로 try/catch 로 감싼다. 하나가 죽어도 나머지는 돈다.
// (실제 사고: 의뢰인이 5단계를 끝내고 질문 3개를 남긴 지 3시간 동안 몰랐다 —
//  화면을 열어야만 도는 것은 시계가 아니다)

export interface TickReport {
  startedAt: string;
  finishedAt: string | null;
  locked: boolean;
  tokens: "checked" | "skipped" | "failed";
  tokenEvents: number;
  reverified: number;
  staleClaims: number;
  outbox: { cleared: number; superseded: number; stalePush: boolean };
  heartbeat: "sent" | "skipped" | "failed";
  errors: string[];
}

const TOKEN_CHECK_EVERY_MS = 55 * 60_000; // 시각 슬롯이 아니라 마지막 기록 기준
const STALE_CLAIM_MS = 10 * 60_000;
const REVERIFY_LIMIT = 10;

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// 토큰 상태의 「전환」만 알린다. 이전 상태는 장부(token_event 행)에서 읽는다 —
// 상태 컬럼을 새로 만들지 않는다. 빨강 지속 중에는 조용하고, 복구되면 한 번 알린다.
async function checkTokensIfDue(now: Date, lastCheckAt: string | null): Promise<{ status: TickReport["tokens"]; events: number }> {
  if (lastCheckAt && now.getTime() - new Date(lastCheckAt).getTime() < TOKEN_CHECK_EVERY_MS) {
    return { status: "skipped", events: 0 };
  }
  const admin = createAdminClient();
  const tokens = await checkVerifyTokens();
  const { data: previousRows } = await admin
    .from("notices")
    .select("detail, created_at")
    .eq("kind", "token_event")
    .order("created_at", { ascending: false })
    .limit(30);
  // detail = "ENV_NAME:red|ok" — 각 env 의 가장 최근 전환 (다른 형식의 detail 은 무시)
  const previous = new Map<string, "red" | "ok">();
  for (const row of previousRows ?? []) {
    const match = /^([A-Z0-9_]+):(red|ok)$/.exec(row.detail ?? "");
    if (match && !previous.has(match[1])) {
      previous.set(match[1], match[2] as "red" | "ok");
    }
  }

  let events = 0;
  for (const token of tokens) {
    // 네트워크 오류는 전환으로 보지 않는다 — 판단 보류
    if (token.status === "error") continue;
    const nowState: "red" | "ok" = token.status === "ok" ? "ok" : "red";
    const before = previous.get(token.envName) ?? "ok";
    if (nowState === before) continue;
    const message =
      nowState === "red"
        ? ko.push.tokenRed(token.envName, ko.admin.health.statuses[token.status])
        : ko.push.tokenOk(token.envName);
    await pushAdmin({
      dedupeKey: `token_${nowState}:${token.envName}:${minuteOf(now)}`,
      kind: "token_event",
      ...message,
      url: "/a",
      detail: `${token.envName}:${nowState}`,
    });
    events += 1;
  }
  await admin
    .from("admins")
    .update({ last_token_check_at: now.toISOString() })
    .not("id", "is", null);
  return { status: "checked", events };
}

// claim 직후 죽은 푸시는 「보냈다」로 남으면 안 된다 — 10분 넘은 claimed 는 실패로 확정한다
async function failStaleClaims(now: Date): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const { data } = await admin
    .from("notices")
    .update({ status: "failed" })
    .eq("status", "claimed")
    .lt("claimed_at", cutoff)
    .select("id");
  return data?.length ?? 0;
}

async function heartbeat(): Promise<TickReport["heartbeat"]> {
  const url = process.env.HEARTBEAT_URL;
  if (!url) return "skipped";
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function runTick(now: Date): Promise<TickReport> {
  const report: TickReport = {
    startedAt: now.toISOString(),
    finishedAt: null,
    locked: false,
    tokens: "skipped",
    tokenEvents: 0,
    reverified: 0,
    staleClaims: 0,
    outbox: { cleared: 0, superseded: 0, stalePush: false },
    heartbeat: "skipped",
    errors: [],
  };
  const admin = createAdminClient();

  // 1) 락 + heartbeat 시작. 못 잡으면 다른 실행이 돌고 있다 — 조용히 끝낸다
  const { data: acquired, error: lockError } = await admin.rpc("tick_begin");
  if (lockError) {
    report.errors.push(`lock: ${lockError.message}`);
    console.error("[tick] 락 실패", { message: lockError.message });
    return report;
  }
  if (!acquired) {
    report.locked = true;
    return report;
  }

  // 2) 토큰 점검 (마지막 점검 55분 경과 시)
  try {
    const { data: adminRow } = await admin
      .from("admins")
      .select("last_token_check_at")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    const result = await checkTokensIfDue(now, adminRow?.last_token_check_at ?? null);
    report.tokens = result.status;
    report.tokenEvents = result.events;
  } catch (cause) {
    report.tokens = "failed";
    report.errors.push(`tokens: ${errorText(cause)}`);
  }

  // 3) 백오프 시각이 지난 완료 요청 재확인
  try {
    report.reverified = await reverifyStale({ limit: REVERIFY_LIMIT, now });
  } catch (cause) {
    report.errors.push(`reverify: ${errorText(cause)}`);
  }

  // 4) 장부 정리
  try {
    report.staleClaims = await failStaleClaims(now);
  } catch (cause) {
    report.errors.push(`claims: ${errorText(cause)}`);
  }

  // 5) 「보낼 카톡」 — 조건이 사라진 문구 거둠, 오래 남은 문구 알림
  try {
    report.outbox = await sweepOutbox(now);
  } catch (cause) {
    report.errors.push(`outbox: ${errorText(cause)}`);
  }

  // 6) 완주 기록 + 외부 heartbeat
  const finished = new Date();
  report.finishedAt = finished.toISOString();
  const { error: finishError } = await admin
    .from("admins")
    .update({ last_tick_finished_at: report.finishedAt })
    .not("id", "is", null);
  if (finishError) report.errors.push(`finish: ${finishError.message}`);
  report.heartbeat = await heartbeat();

  if (report.errors.length > 0) {
    console.error("[tick] 일부 작업 실패", { errors: report.errors });
  }
  return report;
}
