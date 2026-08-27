import { makeResult, type VerifyResult } from "@/lib/verify/types";

// 내 PAT로 "내가 이 조직의 active 멤버인가"를 확인한다.
// GET /user/memberships/orgs/{org} — state가 active여야 verified.
// pending(초대만 되고 수락 전)·404는 not_found.
export async function verifyGithubMembership(org: string): Promise<VerifyResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return makeResult("error", "GITHUB_TOKEN이 설정되지 않았습니다");
  }

  try {
    const response = await fetch(
      `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    if (response.status === 404) {
      return makeResult("not_found", "조직이 없거나 아직 초대되지 않았습니다");
    }
    if (response.status === 401 || response.status === 403) {
      return makeResult("error", `GitHub 토큰 오류 (HTTP ${response.status})`);
    }
    if (!response.ok) {
      return makeResult("error", `GitHub API 오류 (HTTP ${response.status})`);
    }

    const membership = (await response.json()) as { state?: string };
    if (membership.state === "active") {
      return makeResult("verified");
    }
    return makeResult("not_found", "초대는 되었지만 아직 수락 전입니다");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return makeResult("error", `GitHub API 호출 실패: ${message}`);
  }
}
