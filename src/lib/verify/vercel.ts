import { FETCH_TIMEOUT_MS, makeResult, type VerifyResult } from "@/lib/verify/types";

// 내 토큰으로 "내가 이 팀의 확정 멤버인가"를 확인한다.
//  1) /v2/user            → 내 id (응답 필드는 `id`다 — `uid`가 아니다)
//  2) /v2/teams           → 내가 속한 팀 목록에서 slug로 팀을 찾는다 (초대 수락 전 팀은 여기 없다)
//  3) /v3/teams/{id}/members → 내 항목의 confirmed 로 최종 판정
// (실제 사고: `uid`를 읽어 항상 "사용자 정보를 읽지 못했습니다"가 났다)
export async function verifyVercelMembership(team: string): Promise<VerifyResult> {
  const token = process.env.MY_VERCEL_TOKEN;
  if (!token) {
    return makeResult("error", "MY_VERCEL_TOKEN이 설정되지 않았습니다");
  }

  const headers = { Authorization: `Bearer ${token}` };
  const wanted = team.trim().toLowerCase();

  try {
    const meResponse = await fetch("https://api.vercel.com/v2/user", {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (meResponse.status === 401 || meResponse.status === 403) {
      return makeResult("error", `Vercel 토큰 오류 (HTTP ${meResponse.status})`);
    }
    if (!meResponse.ok) {
      return makeResult("error", `Vercel API 오류 (HTTP ${meResponse.status})`);
    }
    const me = (await meResponse.json()) as { user?: { id?: string; uid?: string } };
    const myId = me.user?.id ?? me.user?.uid;
    if (!myId) {
      return makeResult("error", "Vercel 사용자 정보를 읽지 못했습니다");
    }

    const teamsResponse = await fetch("https://api.vercel.com/v2/teams?limit=100", {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (teamsResponse.status === 401 || teamsResponse.status === 403) {
      return makeResult("error", `Vercel 토큰 오류 (HTTP ${teamsResponse.status})`);
    }
    if (!teamsResponse.ok) {
      return makeResult("error", `Vercel API 오류 (HTTP ${teamsResponse.status})`);
    }
    const teams = (await teamsResponse.json()) as {
      teams?: { id?: string; slug?: string }[];
    };
    const found = teams.teams?.find(
      (item) => item.slug?.toLowerCase() === wanted,
    );
    if (!found?.id) {
      return makeResult(
        "not_found",
        "내가 속한 팀 목록에 없습니다 — 초대 수락 전이거나 팀 이름이 다릅니다",
        "check_invite",
      );
    }

    const membersResponse = await fetch(
      `https://api.vercel.com/v3/teams/${encodeURIComponent(found.id)}/members?limit=100`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (membersResponse.status === 404 || membersResponse.status === 403) {
      return makeResult("not_found", "팀 멤버 목록을 볼 권한이 아직 없습니다");
    }
    if (!membersResponse.ok) {
      return makeResult("error", `Vercel API 오류 (HTTP ${membersResponse.status})`);
    }
    const data = (await membersResponse.json()) as {
      members?: { uid?: string; confirmed?: boolean }[];
    };
    const mine = data.members?.find((member) => member.uid === myId);
    if (mine && mine.confirmed !== false) {
      return makeResult("verified");
    }
    if (mine) {
      return makeResult("not_found", "초대는 되었지만 아직 수락 전입니다", "pending_accept");
    }
    // 팀 목록에는 있는데 멤버 목록에 없는 경우는 사실상 없다 — 그래도 통과시키지 않는다
    return makeResult("not_found", "팀 멤버 목록에 없습니다");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return makeResult("error", `Vercel API 호출 실패: ${message}`);
  }
}
