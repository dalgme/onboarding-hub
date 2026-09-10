import { classify, networkResult, upstreamResult, FETCH_TIMEOUT_MS, type VerifyResult } from "@/lib/verify/types";

const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// 내 PAT로 "내가 이 조직의 active 멤버인가"를 확인한다.
// GET /user/memberships/orgs/{org} — state가 active 이고 role 이 admin(Owner) 이어야 verified.
// 404 는 「초대 없음」이지만, 그 전에 조직 자체가 있는지·개인 계정 주소인지 먼저 가른다 —
// 의뢰인에게 "초대해 주세요"가 아니라 "주소가 개인 계정이에요"라고 말할 수 있게.
export async function verifyGithubMembership(org: string): Promise<VerifyResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return classify("token_missing", "GITHUB_TOKEN이 설정되지 않았습니다");
  // fine-grained 토큰은 의뢰인 조직 멤버십을 읽지 못해 404가 난다.
  // 그걸 not_found로 흘리면 "초대했다니까요" 루프에 빠진다 — 내 쪽 문제(error)다
  if (token.startsWith("github_pat_")) {
    return classify("token_scope", "GITHUB_TOKEN이 fine-grained 토큰입니다 — classic(read:org) 토큰이 필요합니다");
  }
  const headers = { ...HEADERS, Authorization: `Bearer ${token}` };
  const get = (path: string) =>
    fetch(`https://api.github.com${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

  try {
    const response = await get(`/user/memberships/orgs/${encodeURIComponent(org)}`);
    if (response.status === 401 || response.status === 403) {
      return classify("token_invalid", `GitHub 토큰 오류 (HTTP ${response.status})`);
    }
    if (response.status === 404) {
      // 초대 없음인지, 조직이 없는지, 개인 계정 주소인지
      const orgResponse = await get(`/orgs/${encodeURIComponent(org)}`);
      if (orgResponse.ok) {
        return classify("check_invite", "조직은 있지만 내가 초대되지 않았습니다");
      }
      if (orgResponse.status === 404) {
        const userResponse = await get(`/users/${encodeURIComponent(org)}`);
        if (userResponse.ok) {
          const user = (await userResponse.json()) as { type?: string };
          if (user.type === "User") {
            return classify("personal_account", "개인 계정 주소입니다 — 조직이 아닙니다");
          }
        }
        return classify("org_not_found", "그 이름의 조직이 없습니다");
      }
      return upstreamResult("GitHub", orgResponse.status);
    }
    if (!response.ok) return upstreamResult("GitHub", response.status);

    const membership = (await response.json()) as { state?: string; role?: string };
    if (membership.state === "active") {
      if (membership.role && membership.role !== "admin") {
        return classify("wrong_role", `역할이 ${membership.role} 입니다 — Owner 여야 합니다`);
      }
      return classify("member_active");
    }
    return classify("pending_accept", "초대는 되었지만 아직 수락 전입니다");
  } catch (cause) {
    return networkResult("GitHub", cause);
  }
}
