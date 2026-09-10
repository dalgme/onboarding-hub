// 1회용 로그인 링크(매직링크)의 형태와 유효시간.
//
// 유효시간은 코드가 아니라 Supabase 대시보드 Auth › Email › Email OTP Expiration
// (최대 86400초)이 결정한다. 여기 값은 안내문에 적는 숫자일 뿐이므로 대시보드
// 설정과 반드시 같게 둔다 (.env.example 참고).
const DEFAULT_TTL_HOURS = 1;

export function magicLinkTtlHours(): number {
  const raw = Number(process.env.MAGIC_LINK_TTL_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HOURS;
}

// 토큰은 프래그먼트(#)에 싣는다 — 브라우저는 프래그먼트를 서버로 보내지 않으므로
// 링크 미리보기 스크래퍼·메일 보안 스캐너가 먼저 열어도 토큰이 소비되지 않는다.
// /auth/link 화면에서 사람이 버튼을 눌러야 /auth/callback 으로 넘어간다.
export function buildMagicLinkUrl(origin: string, hashedToken: string): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type: "magiclink" });
  return `${origin}/auth/link#${params.toString()}`;
}
