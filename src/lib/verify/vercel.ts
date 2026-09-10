import { classify, networkResult, upstreamResult, FETCH_TIMEOUT_MS, type VerifyResult } from "@/lib/verify/types";

// 내 토큰으로 "내가 이 팀의 확정 멤버인가"를 확인한다.
//  1) /v2/user            → 내 id (응답 필드는 `id`다 — `uid`가 아니다)
//  2) /v2/teams           → 내가 속한 팀 목록에서 slug로 팀을 찾는다 (초대 수락 전 팀은 여기 없다)
//  3) /v3/teams/{id}/members → 내 항목의 confirmed·role 로 최종 판정
// 팀 목록에 없으면 「초대 전」인지 「내 수락 전」인지 API 로 구분할 수 없다 → owner=admin
// (await_admin_first): 내가 메일함을 보고 「왔음/안 왔음」을 눌러야 다음이 정해진다.
// (실제 사고: `uid`를 읽어 항상 "사용자 정보를 읽지 못했습니다"가 났다)
const ALLOWED_ROLES = new Set(["OWNER", "MEMBER"]);

export async function verifyVercelMembership(team: string): Promise<VerifyResult> {
  const token = process.env.MY_VERCEL_TOKEN;
  if (!token) return classify("token_missing", "MY_VERCEL_TOKEN이 설정되지 않았습니다");

  const headers = { Authorization: `Bearer ${token}` };
  const wanted = team.trim().toLowerCase();
  const get = (url: string) =>
    fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  try {
    const meResponse = await get("https://api.vercel.com/v2/user");
    if (meResponse.status === 401 || meResponse.status === 403) {
      return classify("token_invalid", `Vercel 토큰 오류 (HTTP ${meResponse.status})`);
    }
    if (!meResponse.ok) return upstreamResult("Vercel", meResponse.status);
    const me = (await meResponse.json()) as { user?: { id?: string; uid?: string } };
    const myId = me.user?.id ?? me.user?.uid;
    if (!myId) return classify("field_missing", "Vercel 사용자 응답에 id 가 없습니다");

    const teamsResponse = await get("https://api.vercel.com/v2/teams?limit=100");
    if (teamsResponse.status === 401 || teamsResponse.status === 403) {
      return classify("token_invalid", `Vercel 토큰 오류 (HTTP ${teamsResponse.status})`);
    }
    if (!teamsResponse.ok) return upstreamResult("Vercel", teamsResponse.status);
    const teams = (await teamsResponse.json()) as { teams?: { id?: string; slug?: string }[] };
    const found = teams.teams?.find((item) => item.slug?.toLowerCase() === wanted);
    if (!found?.id) {
      return classify("await_admin_first", "내가 속한 팀 목록에 없습니다 — 초대 전이거나 내 수락 전입니다");
    }

    const membersResponse = await get(
      `https://api.vercel.com/v3/teams/${encodeURIComponent(found.id)}/members?limit=100`,
    );
    if (membersResponse.status === 404 || membersResponse.status === 403) {
      return classify("await_admin_first", "팀 멤버 목록을 볼 권한이 아직 없습니다");
    }
    if (!membersResponse.ok) return upstreamResult("Vercel", membersResponse.status);
    const data = (await membersResponse.json()) as {
      members?: { uid?: string; confirmed?: boolean; role?: string }[];
    };
    const mine = data.members?.find((member) => member.uid === myId);
    if (!mine) return classify("await_admin_first", "팀 멤버 목록에 내가 없습니다");
    if (mine.confirmed === false) {
      return classify("pending_accept", "초대는 되었지만 아직 수락 전입니다");
    }
    if (mine.role && !ALLOWED_ROLES.has(mine.role.toUpperCase())) {
      return classify("wrong_role", `역할이 ${mine.role} 입니다 — Member 이상이어야 합니다`);
    }
    return classify("member_active");
  } catch (cause) {
    return networkResult("Vercel", cause);
  }
}
