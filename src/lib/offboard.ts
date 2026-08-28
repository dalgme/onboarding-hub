// 종료(오프보딩) 체크리스트. 순서가 중요하다 — 특히 토큰 폐기(2)가
// 멤버 탈퇴(3)보다 먼저다. 멤버를 먼저 지우면 남은 토큰을 회수할 방법이 없다.
export interface OffboardItem {
  key: string;
  title: string;
  detail: string;
}

export const OFFBOARD_CHECKLIST: OffboardItem[] = [
  {
    key: "handover",
    title: "인수인계 자료 전달",
    detail: "README, 배포·운영 방법, 월 고정비 안내를 의뢰인에게 전달한다.",
  },
  {
    key: "revoke-tokens",
    title: "발급받은 토큰·API 키 폐기",
    detail:
      "GitHub PAT / Vercel 토큰 / Supabase 액세스 토큰과, 의뢰인 조직에서 내가 발급한 키 중 회수 대상(예: 내 이름으로 만든 테스트 키)을 폐기한다. 멤버 탈퇴보다 반드시 먼저. 서비스가 실제로 쓰는 키(Anthropic API 키 등)는 의뢰인 조직 소유이므로 남긴다.",
  },
  {
    key: "leave-orgs",
    title: "연결된 모든 조직에서 내 멤버 권한 탈퇴",
    detail:
      "GitHub 조직 · Vercel 팀 · Supabase 조직, 그리고 연결했다면 Anthropic Console · Resend · Solapi에서도 내 계정을 내보낸다. 토큰 폐기 이후에만.",
  },
  {
    key: "clean-local",
    title: "로컬 클론 · .env · 덤프 파일 삭제",
    detail: "내 컴퓨터에 남은 코드 클론, 환경변수 파일, DB 덤프를 지운다.",
  },
  {
    key: "notify-client",
    title: "의뢰인에게 완료 안내",
    detail:
      "종료 완료를 알리고, 각 서비스에서 멤버 목록을 확인하는 방법을 안내한다.",
  },
];
