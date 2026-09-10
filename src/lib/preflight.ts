import { resolveMx } from "node:dns/promises";
import { z } from "zod";
import { checkVerifyTokens, type TokenHealth } from "@/lib/verify/health";
import { createAdminClient } from "@/lib/supabase/admin";
import { ko } from "@/content/ko";

// 사전 점검(preflight) — 의뢰인에게 접속 정보를 만들기 전에 「의뢰인 초대를 직접
// 실패시키는 것」만 빨강으로 막는다. 우회 버튼은 없다.
//
// 빨강(차단): 토큰 3개 missing/invalid · Vercel 계정 이메일 ≠ 허브 관리자 이메일 ·
//            의뢰인 이메일 형식 오류 / 관리자 이메일과 동일
// 노랑(경고): 토큰 점검이 네트워크 오류 · MX 없음 · 오타 의심 도메인
// 푸시·크론 같은 알림 인프라는 여기 없다 — 의뢰인이 계정을 연결하는 데 필요한
// 조건이 아니므로 「지금 할 일」 칩으로만 다룬다.
//
// (실제 사고: 토큰 3개가 Production 에 없는 채 접속 정보가 나갔고, 허브 이메일이
//  계정 이메일과 달라 초대 4건이 헛돌았다 — 둘 다 발급 전에 잡을 수 있었다)

export type PreflightLevel = "red" | "yellow";

export interface PreflightIssue {
  key: string;
  level: PreflightLevel;
  message: string;
}

export interface PreflightReport {
  ok: boolean; // 빨강이 하나도 없다
  issues: PreflightIssue[];
  checkedAt: string;
}

const TOKEN_CACHE_MS = 60_000;
const MX_TIMEOUT_MS = 3_000;

// 자주 틀리는 도메인 — 확신이 아니라 「한 번 더 보라」는 노랑
const TYPO_DOMAINS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmali.com": "gmail.com",
  "naver.co": "naver.com",
  "navr.com": "naver.com",
  "hanmail.ent": "hanmail.net",
  "hanmail.com": "hanmail.net",
  "daum.ent": "daum.net",
  "kakao.co": "kakao.com",
};

// 토큰 점검은 외부 호출 3개다. 발급 버튼을 연달아 누를 때마다 다시 부르지 않는다
let tokenCache: { at: number; tokens: TokenHealth[] } | null = null;

async function cachedTokens(): Promise<TokenHealth[]> {
  if (tokenCache && Date.now() - tokenCache.at < TOKEN_CACHE_MS) return tokenCache.tokens;
  const tokens = await checkVerifyTokens();
  tokenCache = { at: Date.now(), tokens };
  return tokens;
}

async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), MX_TIMEOUT_MS)),
    ]);
    if (records === null) return null; // 시간 초과 — 판단 보류
    return records.length > 0;
  } catch {
    return false;
  }
}

export async function runPreflight(input: { clientEmail?: string | null } = {}): Promise<PreflightReport> {
  const copy = ko.admin.preflight;
  const issues: PreflightIssue[] = [];

  const [tokens, adminRow] = await Promise.all([
    cachedTokens(),
    createAdminClient().from("admins").select("email").limit(1).maybeSingle(),
  ]);
  const adminEmail = adminRow.data?.email?.toLowerCase() ?? null;

  for (const token of tokens) {
    if (token.status === "ok") continue;
    if (token.status === "error") {
      issues.push({ key: token.envName, level: "yellow", message: copy.tokenError(token.envName) });
      continue;
    }
    issues.push({
      key: token.envName,
      level: "red",
      message:
        token.status === "mismatch"
          ? copy.emailMismatch
          : copy.tokenRed(token.envName, token.status === "missing" ? copy.missing : copy.invalid),
    });
  }

  if (!adminEmail) {
    issues.push({ key: "admin_email", level: "red", message: copy.adminEmailMissing });
  }

  const raw = input.clientEmail?.trim().toLowerCase();
  if (raw !== undefined) {
    const parsed = z.email().safeParse(raw);
    if (!parsed.success) {
      issues.push({ key: "client_email", level: "red", message: copy.clientEmailInvalid });
    } else if (adminEmail && raw === adminEmail) {
      issues.push({ key: "client_email", level: "red", message: copy.clientEmailIsAdmin });
    } else {
      const domain = raw.split("@")[1] ?? "";
      const suggestion = TYPO_DOMAINS[domain];
      if (suggestion) {
        issues.push({ key: "client_email", level: "yellow", message: copy.clientEmailTypo(domain, suggestion) });
      } else if ((await hasMx(domain)) === false) {
        issues.push({ key: "client_email", level: "yellow", message: copy.clientEmailNoMx(domain) });
      }
    }
  }

  return {
    ok: issues.every((issue) => issue.level !== "red"),
    issues,
    checkedAt: new Date().toISOString(),
  };
}

// 발급 액션 안에서 쓰는 한 줄 판정. 빨강이 있으면 첫 사유를 돌려준다
export async function preflightBlockReason(clientEmail: string): Promise<string | null> {
  const report = await runPreflight({ clientEmail });
  const red = report.issues.find((issue) => issue.level === "red");
  return red ? `${ko.admin.preflight.blocked} ${red.message}` : null;
}
