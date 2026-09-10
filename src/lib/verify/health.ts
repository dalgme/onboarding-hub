// 검증 토큰 3개의 상태를 확인한다 — 의뢰인이 「연결 확인하기」를 누르기 전에
// 내가 먼저 알기 위한 것. 관리 대시보드 최상단에 항상 표시한다.
//
// 이 확인이 없던 동안 실제로 일어난 일: 토큰이 등록되지 않은 채 의뢰인이
// 확인 버튼을 눌렀고, 의뢰인 화면에 빨간 「확인 오류」가 떴다.
// 내 설정 누락이 의뢰인에게 오류로 보였다.

export type TokenKey = "github" | "vercel" | "supabase";
export type TokenStatus = "ok" | "missing" | "invalid" | "error";

export interface TokenHealth {
  key: TokenKey;
  envName: string;
  status: TokenStatus;
  detail?: string;
}

const TIMEOUT_MS = 6000;

async function probe(
  key: TokenKey,
  envName: string,
  url: string,
  headers: Record<string, string>,
  judge?: (response: Response) => string | null,
): Promise<TokenHealth> {
  const token = process.env[envName];
  if (!token) {
    return { key, envName, status: "missing" };
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
    const problem = judge?.(response) ?? null;
    if (problem) {
      return { key, envName, status: "invalid", detail: problem };
    }
    return { key, envName, status: "ok" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return { key, envName, status: "error", detail: message };
  }
}

export async function checkVerifyTokens(): Promise<TokenHealth[]> {
  return Promise.all([
    probe(
      "github",
      "GITHUB_TOKEN",
      "https://api.github.com/user",
      {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // classic PAT는 권한 목록을 헤더로 알려준다. read:org가 없으면
      // 조직 멤버십 조회가 404로 떨어져 "아직 안 됨"처럼 보인다 — 미리 잡는다
      (response) => {
        const scopes = response.headers.get("x-oauth-scopes");
        if (scopes === null) return null;
        const list = scopes.split(",").map((scope) => scope.trim());
        return list.includes("read:org") || list.includes("admin:org")
          ? null
          : "read:org 권한이 없는 토큰이다";
      },
    ),
    probe("vercel", "MY_VERCEL_TOKEN", "https://api.vercel.com/v2/user", {}),
    probe(
      "supabase",
      "SUPABASE_ACCESS_TOKEN",
      "https://api.supabase.com/v1/organizations",
      {},
    ),
  ]);
}
