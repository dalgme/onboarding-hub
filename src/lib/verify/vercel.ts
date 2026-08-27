import { makeResult, type VerifyResult } from "@/lib/verify/types";

// 내 토큰으로 팀 멤버 목록을 조회해 내 uid가 포함됐는지 확인한다.
// 팀에 속해 있지 않으면 목록 조회 자체가 403 → not_found로 판정.
export async function verifyVercelMembership(team: string): Promise<VerifyResult> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    return makeResult("error", "VERCEL_API_TOKEN이 설정되지 않았습니다");
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const meResponse = await fetch("https://api.vercel.com/v2/user", {
      headers,
      cache: "no-store",
    });
    if (meResponse.status === 401 || meResponse.status === 403) {
      return makeResult("error", `Vercel 토큰 오류 (HTTP ${meResponse.status})`);
    }
    if (!meResponse.ok) {
      return makeResult("error", `Vercel API 오류 (HTTP ${meResponse.status})`);
    }
    const me = (await meResponse.json()) as { user?: { uid?: string } };
    const myUid = me.user?.uid;
    if (!myUid) {
      return makeResult("error", "Vercel 사용자 정보를 읽지 못했습니다");
    }

    const membersResponse = await fetch(
      `https://api.vercel.com/v2/teams/${encodeURIComponent(team)}/members`,
      { headers, cache: "no-store" },
    );
    if (membersResponse.status === 404 || membersResponse.status === 403) {
      return makeResult("not_found", "팀이 없거나 아직 초대되지 않았습니다");
    }
    if (!membersResponse.ok) {
      return makeResult(
        "error",
        `Vercel API 오류 (HTTP ${membersResponse.status})`,
      );
    }

    const data = (await membersResponse.json()) as {
      members?: { uid?: string; confirmed?: boolean }[];
    };
    const mine = data.members?.find((member) => member.uid === myUid);
    if (mine && mine.confirmed !== false) {
      return makeResult("verified");
    }
    if (mine) {
      return makeResult("not_found", "초대는 되었지만 아직 수락 전입니다");
    }
    return makeResult("not_found", "팀 멤버 목록에 없습니다");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return makeResult("error", `Vercel API 호출 실패: ${message}`);
  }
}
