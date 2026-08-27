import { Markdown } from "@/components/common/markdown";
import { ko } from "@/content/ko";

const PRIVACY_MD = `
## 수집하는 정보

- **이메일 주소** — 로그인(매직링크)과 프로젝트 접근 확인에만 사용합니다.
- **이름** — 프로젝트 관리 화면에 표시하기 위해 사용합니다.
- 질문·요청으로 남기신 글은 프로젝트 진행 목적에만 사용합니다.

비밀번호, 인증코드, 결제 정보는 어떤 형태로도 수집하지 않습니다.

## 보관과 삭제

- 정보는 프로젝트 진행 기간 동안 보관합니다.
- 프로젝트 종료 후 삭제를 원하시면 담당자에게 요청해 주세요. 지체 없이 삭제합니다.

## 제3자 제공

- 수집한 정보를 제3자에게 제공하지 않습니다.
- 서비스 운영을 위해 데이터는 Supabase(서울 리전)에 저장되며,
  로그인 메일 발송에 메일 발송 서비스를 사용합니다.

## 문의

개인정보 관련 문의는 안내받으신 담당자 이메일로 연락해 주세요.
`;

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-6 py-10">
      <h1 className="text-xl font-bold">{ko.privacy.title}</h1>
      <Markdown>{PRIVACY_MD}</Markdown>
    </main>
  );
}
