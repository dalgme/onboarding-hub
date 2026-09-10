// 검증 토큰 3개의 상태를 확인한다 — 의뢰인이 「연결 확인하기」를 누르기 전에
// 내가 먼저 알기 위한 것. 관리 대시보드 최상단에 항상 표시한다.
//
// 이 확인이 없던 동안 실제로 일어난 일: 토큰이 등록되지 않은 채 의뢰인이
// 확인 버튼을 눌렀고, 의뢰인 화면에 빨간 「확인 오류」가 떴다.
// 내 설정 누락이 의뢰인에게 오류로 보였다.

import { createAdminClient } from "@/lib/supabase/admin";

export type TokenKey = "github" | "vercel" | "supabase";
// mismatch: 토큰은 멀쩡한데 그 계정의 이메일이 허브 관리자 이메일과 다르다.
// 의뢰인은 허브가 보여주는 이메일로 초대하므로, 다르면 초대를 수락할 수 없다.
// (실제 사고: 허브는 한메일, 계정들은 gmail — 초대 4건이 전부 헛돌았다)
export type TokenStatus = "ok" | "missing" | "invalid" | "mismatch" | "error";

export interface TokenHealth {
  key: TokenKey;
  envName: string;
  status: TokenStatus;
  detail?: string;
}

// judge가 돌려주는 문제. 문자열이면 invalid, 상태를 지정할 수도 있다
type Problem = string | { status: TokenStatus; detail: string };

const TIMEOUT_MS = 6000;

// classic PAT의 권한 목록은 정규화된다 — admin:org ⊃ write:org ⊃ read:org 이므로
// 상위를 체크하면 하위는 목록에 나오지 않는다. 셋 중 하나면 조직 멤버십을 읽을 수 있다
const GITHUB_ORG_READ_SCOPES = ["read:org", "write:org", "admin:org"];

async function probe(
  key: TokenKey,
  envName: string,
  url: string,
  headers: Record<string, string>,
  judge?: (response: Response) => Promise<Problem | null> | Problem | null,
  preflight?: (token: string) => string | null,
): Promise<TokenHealth> {
  const token = process.env[envName];
  if (!token) {
    return { key, envName, status: "missing" };
  }
  // 호출해 보기 전에 토큰 자체로 판정할 수 있는 것은 먼저 잡는다
  const early = preflight?.(token) ?? null;
  if (early) {
    return { key, envName, status: "invalid", detail: early };
  }
  try {
    const response = await fetch(url, {
      headers: { ...headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      return {
        key,
        envName,
        status: "invalid",
        detail: `HTTP ${response.status} — 토큰이 만료됐거나 권한이 없다`,
      };
    }
    if (!response.ok) {
      return { key, envName, status: "error", detail: `HTTP ${response.status}` };
    }
    const problem = (await judge?.(response)) ?? null;
    if (typeof problem === "string") {
      return { key, envName, status: "invalid", detail: problem };
    }
    if (problem) {
      return { key, envName, ...problem };
    }
    return { key, envName, status: "ok" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return { key, envName, status: "error", detail: message };
  }
}

async function adminEmail(): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("admins")
    .select("email")
    .limit(1)
    .maybeSingle();
  return data?.email?.toLowerCase() ?? null;
}

function mismatch(service: string, accountEmail: string, hubEmail: string): Problem {
  return {
    status: "mismatch",
    detail: `${service} 계정 이메일(${accountEmail})이 허브 관리자 이메일(${hubEmail})과 다르다 — 의뢰인이 허브가 보여주는 이메일로 초대하면 이 계정으로는 수락할 수 없다. 둘 중 하나로 통일한다`,
  };
}

export async function checkVerifyTokens(): Promise<TokenHealth[]> {
  const hubEmail = await adminEmail();
  const results = await Promise.all([
    probe(
      "github",
      "GITHUB_TOKEN",
      "https://api.github.com/user",
      {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // classic PAT는 권한 목록을 헤더로 알려준다(권한이 없어도 빈 헤더는 온다).
      // read:org 계열이 없으면 조직 멤버십 조회가 404로 떨어져 "아직 안 됨"처럼
      // 보인다 — 배너가 초록인데 검증은 영원히 노란색인 상황을 여기서 막는다
      (response) => {
        const scopes = response.headers.get("x-oauth-scopes");
        if (scopes === null) {
          return "classic 토큰이 아니다 — Tokens (classic) + read:org 로 다시 만든다";
        }
        const list = scopes.split(",").map((scope) => scope.trim());
        return GITHUB_ORG_READ_SCOPES.some((scope) => list.includes(scope))
          ? null
          : "read:org 권한이 없는 토큰이다";
      },
      // fine-grained 토큰(github_pat_)은 소유자가 고정돼 의뢰인 조직을 조회하지 못한다.
      // /user 호출은 200이 나오므로 호출 결과만 보면 정상처럼 보인다 — 접두어로 먼저 거른다
      (token) =>
        token.startsWith("github_pat_")
          ? "fine-grained 토큰이다 — 의뢰인 조직을 조회할 수 없다. Tokens (classic) + read:org 로 다시 만든다"
          : null,
    ),
    probe(
      "vercel",
      "MY_VERCEL_TOKEN",
      "https://api.vercel.com/v2/user",
      {},
      // 토큰 주인의 이메일을 허브 관리자 이메일과 대조한다.
      // 여기가 다르면 의뢰인이 아무리 초대해도 「Wrong account」만 뜬다
      async (response) => {
        if (!hubEmail) return null;
        const body = (await response.json()) as { user?: { email?: string } };
        const email = body.user?.email?.toLowerCase();
        if (!email || email === hubEmail) return null;
        return mismatch("Vercel", email, hubEmail);
      },
    ),
    probe(
      "supabase",
      "SUPABASE_ACCESS_TOKEN",
      "https://api.supabase.com/v1/organizations",
      {},
    ),
  ]);
  // 문제가 있으면 서버 로그에도 남긴다 — 화면을 못 보는 곳(배포 로그)에서 진단할 수 있게.
  // 토큰 값은 절대 적지 않는다. 이름과 상태만
  if (results.some((result) => result.status !== "ok")) {
    console.warn(
      "[health] 토큰 상태",
      Object.fromEntries(
        results.map((result) => [
          result.envName,
          result.detail ? `${result.status}: ${result.detail}` : result.status,
        ]),
      ),
    );
  }
  return results;
}
