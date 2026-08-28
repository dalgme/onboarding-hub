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
    guideImage: "/guides/github-org.svg",
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
    guideImage: "/guides/vercel-team.svg",
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
    guideImage: "/guides/supabase-org.svg",
  },
};

export const STEP_TEMPLATE: StepTemplate[] = [
  {
    key: "connect-github",
    title: "GitHub 조직 만들고 초대하기",
    owner_side: "client",
    verify_type: "github",
    description_md: `서비스의 **소스 코드**가 저장될 곳입니다. 개인 계정이 아니라 회사(프로젝트) 명의의 조직을 만들어야, 나중에 담당자가 바뀌어도 코드가 그대로 남습니다.

아래 진행 표시줄을 따라 **한 번에 한 가지씩** 하시면 됩니다. 전체 순서를 미리 알고 싶으시면 아래를 읽어 주세요.

### ① 만들기

1. 아래 파란 버튼을 누르면 GitHub의 **조직 만들기 화면**이 새 탭으로 열립니다. (GitHub 계정이 없으면 먼저 가입 화면이 나옵니다 — 평소 쓰는 이메일로 가입하시면 됩니다)
2. 요금제를 고르라고 나오면 **Free(무료)** 를 선택합니다.
3. **Organization account name** 칸에 조직 이름을 영문으로 입력합니다. 회사나 서비스 이름이 좋습니다 (예: sangrok-academy).
4. **Contact email**에는 본인 이메일을 넣고, "My personal account"를 선택한 뒤 **Next**를 누릅니다.
5. 멤버 초대 화면이 나오면 일단 **Skip**해도 됩니다 — 초대는 ③에서 따로 안내합니다.

![GitHub 조직 만들기 화면 안내 그림](/guides/github-org.svg)

### ② 이름 알려주기

만든 조직의 이름을 이 화면에 입력하고 저장합니다. 정확한 이름이 헷갈리면, 조직 화면의 **브라우저 주소를 통째로 복사해 붙여넣으세요**. 자동으로 이름만 골라냅니다.

### ③ 초대하기

1. 이 화면의 **「초대할 이메일 복사」** 버튼으로 제 이메일을 복사합니다.
2. **「초대 화면 열기」** 버튼을 누르면 조직의 사람(People) 화면이 열립니다.
3. 초록색 **Invite member** 버튼 → 복사한 이메일 붙여넣기 → 검색 결과 선택.
4. 역할(Role)을 묻는 화면에서 반드시 **Owner** 를 선택하고 **Send invitation**.

![GitHub 초대 화면 안내 그림](/guides/github-invite.svg)

### ④ 연결 확인

「연결 확인하기」 버튼을 누르면 초대가 잘 됐는지 자동으로 확인됩니다. 제가 초대를 수락하기 전에는 "아직 확인 안 됨"으로 나올 수 있습니다 — 초대를 보내셨다면 그대로 두셔도 됩니다.

### 자주 막히는 곳

- **개인 계정에 만들어지는 경우** — "New repository"가 아니라 "New organization"입니다. 화면 상단에 조직 이름이 보여야 합니다.
- 초대 이메일 입력 시 오타가 가장 흔합니다. 꼭 **복사 버튼**을 사용해 주세요.
- 역할을 Member로 두면 제가 설정을 만질 수 없습니다. **Owner**로 지정해 주세요.`,
  },
  {
    key: "connect-vercel",
    title: "Vercel 팀 만들고 초대하기",
    owner_side: "client",
    verify_type: "vercel",
    description_md: `만든 서비스가 실제로 **인터넷에 공개되는 곳**입니다. 여기도 개인 계정이 아니라 팀 명의로 만들어야 소유권이 확실해집니다.

아래 진행 표시줄을 따라 **한 번에 한 가지씩** 하시면 됩니다.

### ① 만들기

1. 아래 파란 버튼을 누르면 Vercel의 **팀 만들기 화면**이 새 탭으로 열립니다.
2. 계정이 없으면 가입 화면이 먼저 나옵니다 — **Continue with GitHub** 를 누르면 앞 단계에서 만든 GitHub 계정으로 바로 가입됩니다 (가장 간단합니다).
3. **Team name** 칸에 팀 이름을 영문으로 입력하고 **Continue**.
4. 결제(Pro, 월 $20) 안내가 나오면 카드 정보를 등록합니다. 상업 서비스 운영에 필요한 고정비입니다 — 부담되시면 여기서 멈추고 「막혔어요」를 눌러 주세요. 함께 정리해 드립니다.

![Vercel 팀 만들기 화면 안내 그림](/guides/vercel-team.svg)

### ② 이름 알려주기

만든 팀 이름을 이 화면에 입력하고 저장합니다. 팀 화면의 **브라우저 주소를 통째로 붙여넣으셔도** 됩니다.

### ③ 초대하기

1. **「초대할 이메일 복사」** 버튼으로 제 이메일을 복사합니다.
2. **「초대 화면 열기」** 버튼을 누르면 팀의 멤버(Members) 설정 화면이 열립니다.
3. **Invite** 버튼 → 이메일 붙여넣기 → 역할(Role)은 **Member** 선택 → 초대 보내기.

![Vercel 초대 화면 안내 그림](/guides/vercel-invite.svg)

### ④ 연결 확인

「연결 확인하기」 버튼으로 초대 상태를 자동 확인합니다. 제가 수락하기 전에는 "아직 확인 안 됨"으로 보일 수 있습니다.

### 자주 막히는 곳

- 팀이 아니라 **개인(Hobby) 계정**으로 진행되는 경우 — 화면 왼쪽 상단에 팀 이름이 보여야 합니다.
- 결제 수단 등록이 막히면 그대로 두고 「화면공유로 도움받기」를 눌러 주세요.
- 초대 이메일은 꼭 **복사 버튼**으로 붙여넣어 주세요.`,
  },
  {
    key: "connect-supabase",
    title: "Supabase 조직 만들고 초대하기",
    owner_side: "client",
    verify_type: "supabase",
    description_md: `회원 정보 등 서비스의 **데이터가 저장되는 곳**입니다. 데이터는 특히 소유권이 중요해서, 처음부터 의뢰인 명의 조직에 만듭니다.

아래 진행 표시줄을 따라 **한 번에 한 가지씩** 하시면 됩니다.

### ① 만들기

1. 아래 파란 버튼을 누르면 Supabase가 새 탭으로 열립니다.
2. 계정이 없으면 **Continue with GitHub** 로 가입합니다 (앞에서 만든 GitHub 계정 그대로).
3. 가입하면 조직(Organization)을 만들라는 화면이 나옵니다. **Name**에 회사나 서비스 이름을 입력하고, 요금제는 **Free**로 두고 만듭니다. (요금제 조정은 나중에 제가 안내드립니다)
4. "새 프로젝트 만들기" 화면이 나와도 **프로젝트는 만들지 않으셔도 됩니다.** 조직만 있으면 됩니다 — 프로젝트는 제가 만듭니다.

![Supabase 조직 만들기 화면 안내 그림](/guides/supabase-org.svg)

### ② 이름 알려주기

조직 화면에서 **브라우저 주소창의 주소를 통째로 복사**해 이 화면에 붙여넣고 저장하세요. 주소 속 영문·숫자 조합이 조직 이름인데, 찾기 어려우니 통째로 붙여넣는 것이 가장 확실합니다.

### ③ 초대하기

1. **「초대할 이메일 복사」** 버튼으로 제 이메일을 복사합니다.
2. **「초대 화면 열기」** 버튼을 누르면 조직의 팀(Team) 화면이 열립니다.
3. **Invite** 버튼 → 이메일 붙여넣기 → 역할(Role)은 **Administrator** 선택 → 초대 보내기.

![Supabase 초대 화면 안내 그림](/guides/supabase-invite.svg)

### ④ 연결 확인

「연결 확인하기」 버튼으로 초대 상태를 자동 확인합니다. 제가 수락하기 전에는 "아직 확인 안 됨"으로 보일 수 있습니다.

### 자주 막히는 곳

- 역할을 Developer 등으로 두면 제가 데이터베이스를 만들 수 없습니다. **Administrator**로 지정해 주세요.
- 조직 이름이 어디 있는지 모르겠으면 그냥 **주소창 주소를 통째로** 붙여넣으세요.`,
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
