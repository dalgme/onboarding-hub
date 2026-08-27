import { makeResult, type VerifyResult } from "@/lib/verify/types";

// 내 개인 액세스 토큰으로 조직 멤버 목록을 조회해 내 이메일이 포함됐는지 확인한다.
// 조직에 속해 있지 않으면 조회가 4xx → not_found로 판정.
export async function verifySupabaseMembership(
  orgSlug: string,
  myEmail: string,
): Promise<VerifyResult> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    return makeResult("error", "SUPABASE_ACCESS_TOKEN이 설정되지 않았습니다");
  }

  try {
    const response = await fetch(
      `https://api.supabase.com/v1/organizations/${encodeURIComponent(orgSlug)}/members`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    if (response.status === 401) {
      return makeResult("error", "Supabase 토큰 오류 (HTTP 401)");
    }
    if (response.status === 403 || response.status === 404) {
      return makeResult("not_found", "조직이 없거나 아직 초대되지 않았습니다");
    }
    if (!response.ok) {
      return makeResult("error", `Supabase API 오류 (HTTP ${response.status})`);
    }

    const members = (await response.json()) as { email?: string }[];
    const found = members.some(
      (member) => member.email?.toLowerCase() === myEmail.toLowerCase(),
    );
    if (found) {
      return makeResult("verified");
    }
    return makeResult("not_found", "조직 멤버 목록에 없습니다");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "unknown";
    return makeResult("error", `Supabase API 호출 실패: ${message}`);
  }
}
