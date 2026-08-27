import type { OwnerSide, VerifyType } from "@/lib/database.types";

// 온보딩 단계 템플릿. 프로젝트 생성 시 여기서 "복사"해 steps 테이블에 넣는다.
// 템플릿 관리 화면은 없다 — 안내문을 고치려면 이 파일을 고치고 배포한다.
// description_md가 이 도구의 실질적 콘텐츠다. 기술 용어를 쓰지 않는다.

export interface StepTemplate {
  key: string;
  title: string;
  owner_side: OwnerSide;
  verify_type: VerifyType;
  description_md: string;
}

// 계정 연결 단계에서 쓰는 딥링크·역할·정규화 대상 slug 컬럼 매핑
export interface ConnectMeta {
  provider: "github" | "vercel" | "supabase";
  slugColumn: "github_org" | "vercel_team" | "supabase_org";
  serviceName: string;
  orgNoun: string;
  roleName: string;
  createUrl: string;
  inviteUrl: (slug: string) => string;
  slugPlaceholder: string;
  slugHelp: string;
  guideImage: string;
}

export const CONNECT_META: Record<string, ConnectMeta> = {
  "connect-github": {
    provider: "github",
    slugColumn: "github_org",
    serviceName: "GitHub",
    orgNoun: "조직(Organization)",
    roleName: "Owner",
    createUrl: "https://github.com/account/organizations/new?plan=free",
    inviteUrl: (slug) => `https://github.com/orgs/${slug}/people`,
    slugPlaceholder: "예: acme-shop",
    slugHelp:
      "조직을 만들면 주소가 github.com/조직이름 이 됩니다. 그 주소를 통째로 붙여넣으셔도 됩니다.",
    guideImage: "/guides/github-org.png",
  },
  "connect-vercel": {
    provider: "vercel",
    slugColumn: "vercel_team",
    serviceName: "Vercel",
    orgNoun: "팀(Team)",
    roleName: "Member",
    createUrl: "https://vercel.com/teams/create",
    inviteUrl: (slug) => `https://vercel.com/teams/${slug}/settings/members`,
    slugPlaceholder: "예: acme-shop",
    slugHelp:
      "팀을 만들면 주소가 vercel.com/팀이름 이 됩니다. 그 주소를 통째로 붙여넣으셔도 됩니다.",
    guideImage: "/guides/vercel-team.png",
  },
  "connect-supabase": {
    provider: "supabase",
    slugColumn: "supabase_org",
    serviceName: "Supabase",
    orgNoun: "조직(Organization)",
    roleName: "Administrator",
    createUrl: "https://supabase.com/dashboard/new",
    inviteUrl: (slug) => `https://supabase.com/dashboard/org/${slug}/team`,
    slugPlaceholder: "예: abcdefghijklmnop",
    slugHelp:
      "조직 화면의 주소 supabase.com/dashboard/org/여기부분 을 통째로 붙여넣으셔도 됩니다.",
    guideImage: "/guides/supabase-org.png",
  },
};

export const STEP_TEMPLATE: StepTemplate[] = [
  {
    key: "connect-github",
    title: "GitHub 조직 만들고 초대하기",
    owner_side: "client",
    verify_type: "github",
    description_md: `서비스의 **소스 코드**가 저장될 곳입니다. 개인 계정이 아니라 회사(프로젝트) 명의의 조직을 만들어야, 나중에 담당자가 바뀌어도 코드가 그대로 남습니다.

### 진행 순서

1. 아래 버튼으로 GitHub에 들어가 **무료 조직**을 만듭니다. 이름은 회사나 서비스 이름을 영문으로 적으면 됩니다.
2. 만들어진 조직 이름을 이 화면에 붙여넣고 저장합니다.
3. 멤버 초대 화면에서 제 이메일을 초대하고, 역할은 **Owner**로 지정해 주세요.

### 자주 막히는 곳

- **개인 계정에 만들어지는 경우** — "New repository"가 아니라 "New organization"입니다. 화면 상단에 조직 이름이 보여야 합니다.
- 초대 이메일 입력 시 오타가 가장 흔합니다. 아래 **이메일 복사 버튼**을 꼭 사용해 주세요.
- 역할을 Member로 두면 제가 설정을 만질 수 없습니다. **Owner**로 지정해 주세요.`,
  },
  {
    key: "connect-vercel",
    title: "Vercel 팀 만들고 초대하기",
    owner_side: "client",
    verify_type: "vercel",
    description_md: `만든 서비스가 실제로 **인터넷에 공개되는 곳**입니다. 여기도 개인 계정이 아니라 팀 명의로 만들어야 소유권이 확실해집니다.

### 진행 순서

1. 아래 버튼으로 Vercel에 들어가 **팀**을 만듭니다. (가입이 필요하면 GitHub 계정으로 가입하는 것이 가장 간단합니다)
2. 만들어진 팀 이름을 이 화면에 붙여넣고 저장합니다.
3. 멤버 초대 화면에서 제 이메일을 초대하고, 역할은 **Member**로 지정해 주세요.

### 자주 막히는 곳

- 팀을 만들면 **유료 요금제(Pro, 월 $20)** 안내가 나옵니다. 상업 서비스 운영에 필요한 비용입니다. 결제 수단 등록이 부담되시면 「막혔어요」를 눌러 주세요. 함께 정리해 드립니다.
- 초대 이메일은 아래 **이메일 복사 버튼**으로 붙여넣어 주세요.`,
  },
  {
    key: "connect-supabase",
    title: "Supabase 조직 만들고 초대하기",
    owner_side: "client",
    verify_type: "supabase",
    description_md: `회원 정보 등 서비스의 **데이터가 저장되는 곳**입니다. 데이터는 특히 소유권이 중요해서, 처음부터 의뢰인 명의 조직에 만듭니다.

### 진행 순서

1. 아래 버튼으로 Supabase에 들어가 가입하고 **조직**을 만듭니다. (GitHub 계정으로 가입하는 것이 가장 간단합니다)
2. 조직 화면의 주소를 이 화면에 붙여넣고 저장합니다.
3. 팀 초대 화면에서 제 이메일을 초대하고, 역할은 **Administrator**로 지정해 주세요.

### 자주 막히는 곳

- 가입 직후 "새 프로젝트 만들기" 화면이 나와도 프로젝트는 만들지 않으셔도 됩니다. **조직만** 있으면 됩니다. 프로젝트는 제가 만듭니다.
- 조직 주소(영문·숫자 조합)가 어디 있는지 모르겠으면, 지금 보고 계신 브라우저 주소창의 주소를 통째로 복사해 붙여넣어 주세요.`,
  },
  {
    key: "scope-review",
    title: "작업 범위 확인",
    owner_side: "client",
    verify_type: "manual",
    description_md: `통화·미팅에서 이야기한 작업 범위를 제가 문서로 정리해 두었습니다.

포털 홈의 **「작업 범위」**를 읽어 보시고, 이야기한 내용과 다르거나 빠진 부분이 있으면 이 화면 아래 **질문·요청 남기기**로 알려 주세요. 문제 없으면 「완료했습니다」를 눌러 주시면 됩니다.

### 자주 막히는 곳

- 여기 적힌 것이 이번 작업의 전부입니다. 적혀 있지 않은 기능은 별도 논의 대상이니, 애매하면 지금 물어봐 주세요.`,
  },
  {
    key: "build",
    title: "개발 진행",
    owner_side: "agency",
    verify_type: "manual",
    description_md: `제가 개발을 진행하는 단계입니다. 의뢰인이 하실 일은 없습니다.

- 진행 중간에 확인이 필요한 내용은 질문으로 남겨 드립니다. 포털에 들어오시면 알림이 보입니다.
- 중간 확인용 주소가 생기면 포털 홈의 링크 보드에 올려 둡니다.`,
  },
  {
    key: "domain",
    title: "도메인 연결",
    owner_side: "client",
    verify_type: "manual",
    description_md: `서비스 주소(도메인)를 연결하는 단계입니다.

- **이미 보유한 도메인이 있으면** — 어디서 구입하셨는지(가비아, 후이즈, GoDaddy 등) 질문·요청으로 알려 주세요. 설정 방법을 안내드리거나, 화면공유로 함께 진행합니다.
- **아직 없으면** — 원하는 주소를 알려 주세요. 구입 방법을 안내드립니다. 도메인은 반드시 **의뢰인 명의 계정**으로 구입합니다.

### 자주 막히는 곳

- 도메인 설정 반영에는 길면 하루 정도 걸릴 수 있습니다. 바로 안 열려도 고장이 아닙니다.`,
  },
  {
    key: "handover",
    title: "배포 및 인수인계",
    owner_side: "agency",
    verify_type: "manual",
    description_md: `개발이 끝나면 제가 서비스를 열고, 운영에 필요한 자료를 전달하는 단계입니다.

- 운영 방법 안내 문서(README)와 월 고정비 정리를 전달드립니다.
- 전달이 끝나면 제 계정은 세 서비스에서 모두 빠집니다. 이후 계정과 데이터는 온전히 의뢰인 소유입니다.`,
  },
];
