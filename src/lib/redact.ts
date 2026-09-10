// 로그·장부에 남기는 문자열에서 비밀을 지운다. 토큰·비밀번호·로그인 링크·이메일 로컬파트.
// 모든 console.error/warn 의 detail 과 notices.detail 은 이 함수를 거친다.
const RULES: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer ***"],
  [/github_pat_[A-Za-z0-9_]+/g, "github_pat_***"],
  [/ghp_[A-Za-z0-9]+/g, "ghp_***"],
  [/sbp_[A-Za-z0-9]+/g, "sbp_***"],
  [/sk-ant-[A-Za-z0-9_\-]+/g, "sk-ant-***"],
  [/token_hash=[^&\s#]+/g, "token_hash=***"],
  [/\b[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\b/g, "****-****-****"], // 임시 비밀번호 형식
  [/([A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]*(@[A-Za-z0-9.\-]+)/g, "$1***$2"],
];

export function redact(value: unknown, max = 300): string {
  let text = typeof value === "string" ? value : value instanceof Error ? value.message : String(value ?? "");
  for (const [pattern, replacement] of RULES) text = text.replace(pattern, replacement);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
