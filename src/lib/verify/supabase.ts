import { classify, networkResult, upstreamResult, FETCH_TIMEOUT_MS, type VerifyResult } from "@/lib/verify/types";

// 내 개인 액세스 토큰으로 조직 멤버 목록을 조회해 내 이메일이 포함됐는지 확인한다.
// 403/404 는 「조직 없음」「초대 전」「내 수락 전」을 구분하지 못한다 → owner=admin
// (await_admin_first). 단, 토큰 자체가 죽은 것인지 /v1/organizations 로 먼저 가른다.
// 멤버 응답의 email 은 OpenAPI 에서 선택 필드다 — 비어 있으면 대조 자체가 불가(field_missing).
const ALLOWED_ROLES = new Set(["owner", "administrator"]);

export async function verifySupabaseMembership(
  orgSlug: string,
  myEmail: string,
): Promise<VerifyResult> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return classify("token_missing", "SUPABASE_ACCESS_TOKEN이 설정되지 않았습니다");
  const get = (path: string) =>
    fetch(`https://api.supabase.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

  try {
    const response = await get(`/v1/organizations/${encodeURIComponent(orgSlug)}/members`);
    if (response.status === 401) return classify("token_invalid", "Supabase 토큰 오류 (HTTP 401)");
    if (response.status === 403 || response.status === 404) {
      // 토큰이 살아 있는지 먼저 — 죽은 토큰의 403 을 「초대 전」으로 읽으면 안 된다
      const probe = await get("/v1/organizations");
      if (probe.status === 401 || probe.status === 403) {
        return classify("token_invalid", `Supabase 토큰 오류 (HTTP ${probe.status})`);
      }
      return classify("await_admin_first", "조직 멤버 목록을 볼 수 없습니다 — 초대 전이거나 내 수락 전입니다");
    }
    if (!response.ok) return upstreamResult("Supabase", response.status);

    const members = (await response.json()) as { email?: string; role_name?: string }[];
    const mine = members.find((member) => member.email?.toLowerCase() === myEmail.toLowerCase());
    if (mine) {
      if (mine.role_name && !ALLOWED_ROLES.has(mine.role_name.toLowerCase())) {
        return classify("wrong_role", `역할이 ${mine.role_name} 입니다 — Administrator 여야 합니다`);
      }
      return classify("member_active");
    }
    if (members.some((member) => !member.email)) {
      return classify("field_missing", "멤버 응답에 이메일이 없는 계정이 있어 대조할 수 없습니다");
    }
    // 목록을 읽을 수 있다 = 나는 이 조직의 멤버다. 그런데 허브 이메일이 없다 = 계정 이메일이 다르다
    return classify("email_mismatch", "조직 멤버이지만 허브 관리자 이메일과 다른 계정입니다");
  } catch (cause) {
    return networkResult("Supabase", cause);
  }
}
