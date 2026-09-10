import { ko } from "@/content/ko";
import { LinkLanding } from "@/app/auth/link/link-landing";

// 1회용 로그인 링크의 착지 화면. 토큰은 URL 프래그먼트(#)에 실려 오므로 서버·
// 링크 미리보기 스크래퍼·메일 보안 스캐너에는 전달되지 않는다. 사람이 버튼을
// 누른 뒤에만 /auth/callback 이 토큰을 소비한다.
// (기존 /auth/callback?token_hash= 형태는 GET 즉시 소비돼, 카톡 미리보기가
//  먼저 열어 버리면 의뢰인이 누르기 전에 만료됐다)
export default function AuthLinkPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">{ko.authLink.title}</h1>
      <LinkLanding />
    </main>
  );
}
