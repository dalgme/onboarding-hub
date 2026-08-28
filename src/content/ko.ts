// 화면 문구는 전부 여기서 가져온다. 컴포넌트에 한국어 직접 삽입 금지.
// (단계 안내문 본문만 예외 — src/lib/steps.ts)

export const ko = {
  common: {
    appName: "온보딩 허브",
    loading: "불러오는 중…",
    save: "저장",
    saved: "저장되었습니다",
    cancel: "취소",
    delete: "삭제",
    confirm: "확인",
    edit: "수정",
    add: "추가",
    close: "닫기",
    back: "뒤로",
    copy: "복사",
    copied: "복사되었습니다",
    logout: "로그아웃",
    error: "문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
    empty: "아직 아무것도 없습니다.",
    notFound: "페이지를 찾을 수 없습니다.",
    openInNewTab: "새 탭에서 열기",
    required: "필수 입력입니다",
    invalidEmail: "이메일 형식이 아닙니다",
    invalidUrl: "주소(URL) 형식이 아닙니다",
    unauthorized: "접근 권한이 없습니다.",
    guideTitle: "이 화면 사용법",
  },

  login: {
    title: "로그인",
    description:
      "담당자에게 안내받은 이메일과 비밀번호로 로그인해 주세요. 별도 가입은 없습니다.",
    emailLabel: "이메일 주소",
    emailPlaceholder: "you@example.com",
    passwordLabel: "비밀번호",
    submit: "로그인",
    submitting: "확인하는 중…",
    invalidCredentials:
      "이메일 또는 비밀번호가 맞지 않습니다. 안내받은 정보를 다시 확인해 주세요.",
    forgotHint:
      "비밀번호를 잊으셨거나 안내받지 못하셨다면 담당자에게 연락해 주세요. 새 비밀번호나 접속 링크를 보내드립니다.",
    errorNoAccess:
      "이 이메일로 열린 프로젝트가 없습니다. 안내받은 이메일 주소가 맞는지 확인하시고, 다르면 담당자에게 알려 주세요.",
    errorAuth: "접속 링크가 만료되었거나 잘못되었습니다. 담당자에게 새 링크를 요청해 주세요.",
  },

  status: {
    project: {
      onboarding: "온보딩",
      building: "개발 중",
      delivered: "전달 완료",
      closed: "종료",
    },
    step: {
      todo: "대기",
      doing: "진행 중",
      client_done: "완료 요청",
      verified: "확인 완료",
      blocked: "막힘",
      skipped: "건너뜀",
    },
    verify: {
      verified: "연결 확인됨",
      not_found: "아직 확인 안 됨",
      error: "확인 오류",
      never: "확인 전",
    },
    tier: {
      self: "셀프",
      assisted: "화면공유 지원",
    },
    ownerSide: {
      client: "의뢰인",
      agency: "제작자",
    },
  },

  portal: {
    homeTitle: "프로젝트 포털",
    progressLabel: "진행률",
    nextTaskTitle: "다음 할 일",
    nextTaskAllDone: "지금 하실 일이 없습니다. 나머지는 제가 진행하고 있어요.",
    nextTaskGo: "이어서 진행하기",
    linksTitle: "바로가기",
    linksEmpty: "등록된 링크가 아직 없습니다.",
    workUrlButton: "작업 URL 바로가기",
    workUrlEmpty: "작업 화면 주소가 준비되면 여기에 버튼이 생깁니다.",
    stepsTitle: "온보딩 단계",
    scopeTitle: "작업 범위",
    scopeEmpty: "작업 범위 문서가 아직 준비되지 않았습니다.",
    scopeAgreedAt: "확정일",
    commentsTitle: "질문·요청",
    closedNotice: "이 프로젝트는 종료되었습니다. 열람만 가능합니다.",

    pickerTitle: "내 프로젝트",
    pickerDescription: "진행 중인 프로젝트가 여러 개입니다. 확인할 프로젝트를 선택해 주세요.",
    switcherLabel: "프로젝트 전환",

    tabTasks: "설정",
    tabLog: "작업기록",
    tabComments: "질문·요청",
    tabHelp: "도움말",

    tasksGuide:
      "제작자가 진행 상황을 확인하고, 의뢰인께서 직접 해주셔야 하는 일들을 순서대로 정리한 화면입니다. 각 항목을 누르면 무엇을 어떻게 하면 되는지 단계별 안내가 나옵니다.",
    logGuide:
      "지금까지 프로젝트에서 일어난 일들의 기록입니다. 최근 일이 맨 위에 표시됩니다.",
    logEmpty: "아직 기록이 없습니다. 첫 단계를 시작하면 여기에 쌓입니다.",
    logProjectStart: "프로젝트가 시작되었습니다",
    logScopeAgreed: "작업 범위가 확정되었습니다",
    logStepClientDone: (title: string) => `「${title}」 완료 요청을 보냈습니다`,
    logStepVerified: (title: string) => `「${title}」 확인이 완료되었습니다`,
    logCommentQuestion: (side: string) => `${side}이 질문을 남겼습니다`,
    logCommentRequest: (side: string) => `${side}이 요청을 남겼습니다`,
    commentsGuide:
      "궁금한 점이나 요청사항은 여기에 남겨 주세요. 카톡과 달리 묻히지 않고, 제작자가 확인하는 대로 답을 답니다. 특정 단계에서 남긴 글에는 단계 이름표가 붙습니다.",

    helpTitle: "이 포털 사용 안내",
    helpSections: [
      {
        title: "이 페이지는 무엇인가요?",
        body: "의뢰하신 서비스가 만들어지는 과정을 함께 보는 전용 페이지입니다. 지금 어디까지 진행됐는지, 다음에 무엇을 하면 되는지, 궁금한 점은 어디에 남기면 되는지가 모두 여기에 있습니다.",
      },
      {
        title: "로그인은 어떻게 하나요?",
        body: "제작자에게 안내받은 이메일과 비밀번호로 로그인합니다. 별도 가입은 없습니다. 비밀번호를 잊으면 제작자에게 연락해 주세요 — 새 비밀번호를 바로 만들어 드립니다. 한 번 로그인하면 같은 브라우저에서는 로그인 상태가 유지됩니다.",
      },
      {
        title: "전체 진행 순서",
        body: "① 계정 3개 연결(GitHub·Vercel·Supabase — 서비스의 소유권을 의뢰인 명의로 두기 위한 준비) → ② 작업 범위 확인 → ③ 개발 진행(제작자) → ④ 도메인 연결 → ⑤ 전달 및 인수인계. 의뢰인께서 직접 하시는 일은 ①·②·④뿐이고, 나머지는 제작자가 진행합니다.",
      },
      {
        title: "계정 연결이 왜 필요한가요?",
        body: "코드 저장소(GitHub), 서비스 공개(Vercel), 데이터 저장(Supabase) — 이 세 가지를 처음부터 의뢰인 명의 계정에 만들어야, 작업이 끝난 뒤 제작자가 빠져도 서비스와 데이터가 온전히 의뢰인 소유로 남습니다. 각 연결 화면에서 「만들기 → 이름 알려주기 → 초대 → 확인」 순서로 하나씩 안내합니다.",
      },
      {
        title: "하다가 막히면?",
        body: "각 단계 화면 아래에 버튼 세 개가 있습니다. 「완료했습니다」— 다 하셨을 때. 「막혔어요」— 어디서 막혔는지 적어 보내면 제작자가 확인 후 연락드립니다. 「화면공유로 도움받기」— 20분 정도 화면을 함께 보며 같이 진행합니다. 부담 갖지 말고 눌러 주세요. 그 밖의 질문은 질문·요청 탭에 남기면 됩니다.",
      },
    ],
  },

  stepDetail: {
    yourTurn: "의뢰인이 진행하는 단계입니다",
    agencyTurn: "제작자가 진행하는 단계입니다. 기다려 주세요.",
    stageCreate: "1. 만들기",
    stageSlug: "2. 이름 알려주기",
    stageInvite: "3. 초대하기",
    stageVerify: "4. 연결 확인",
    createButton: (service: string) => `${service} 열기 (새 탭)`,
    createDone: "만들었습니다 — 다음 단계로",
    slugLabel: (noun: string) => `만든 ${noun}의 이름(주소)`,
    slugSave: "저장하고 다음으로",
    slugSaved: "저장되었습니다",
    slugNormalized: (slug: string) => `이렇게 저장됩니다: ${slug}`,
    slugEmptyError: "이름을 알아볼 수 없습니다. 주소를 통째로 붙여넣어 보세요.",
    inviteTitle: "제 계정을 초대해 주세요",
    inviteRole: (role: string) => `역할은 반드시 ${role} 로 지정해 주세요`,
    inviteCopyEmail: "초대할 이메일 복사",
    inviteOpenPage: "초대 화면 열기 (새 탭)",
    inviteHint:
      "이메일을 직접 입력하면 오타가 나기 쉽습니다. 꼭 복사 버튼을 사용해 주세요.",
    verifyButton: "연결 확인하기",
    verifyChecking: "확인하는 중…",
    verifiedTitle: "연결이 확인되었습니다. 감사합니다!",
    verifyNotFoundHint:
      "초대 직후에는 반영에 잠깐 시간이 걸릴 수 있습니다. 초대를 보내셨다면 잠시 후 다시 확인해 보세요.",
    verifyErrorHint:
      "확인 과정에 문제가 있습니다. 의뢰인 잘못이 아니니 그대로 두시면 제가 확인 후 처리하겠습니다.",
    stuckTitle: "자주 막히는 곳",
    doneButton: "완료했습니다",
    blockedButton: "막혔어요",
    helpButton: "화면공유로 도움받기",
    blockedPrompt: "어디서 막히셨는지 짧게 적어 주세요",
    blockedPlaceholder: "예: 조직을 만들었는데 초대 화면을 못 찾겠어요",
    blockedSubmit: "보내기",
    blockedSent: "전달되었습니다. 확인하는 대로 연락드릴게요.",
    helpSent:
      "요청이 전달되었습니다. 화면공유 일정을 잡아 연락드리겠습니다. 20분이면 충분합니다.",
    needHelpReason: "화면공유 도움 요청",
    doneSent: "확인 요청이 전달되었습니다. 제가 실제 연결 상태를 확인합니다.",
    blockedBanner: (reason: string) => `막힌 상태입니다 — ${reason}`,
    resume: "다시 진행하기",
  },

  comments: {
    title: "질문·요청",
    empty: "아직 남긴 글이 없습니다. 궁금한 것은 무엇이든 남겨 주세요.",
    kindQuestion: "질문",
    kindRequest: "요청",
    bodyPlaceholder: "카톡에 묻히지 않게, 여기에 남겨 주세요",
    submit: "남기기",
    submitting: "남기는 중…",
    deleted: "삭제된 글입니다",
    deleteConfirm: "이 글을 삭제할까요?",
    stepPrefix: "단계",
    markRead: "읽음 처리",
    unreadBadge: (count: number) => `안 읽음 ${count}`,
    mine: "나",
  },

  admin: {
    dashboardTitle: "프로젝트",
    newProject: "새 프로젝트",
    tableName: "이름",
    tableClient: "의뢰인",
    tableStatus: "상태",
    tableProgress: "진행률",
    tableOrgs: "조직 연결",
    tableUnread: "안 읽음",
    tableCreated: "생성일",
    emptyProjects: "프로젝트가 없습니다. 새 프로젝트를 만들어 시작하세요.",
    portalLink: "의뢰인 포털 열기",
    copyPortalLink: "포털 주소 복사",

    tabProcess: "프로세스",
    tabSteps: "단계",
    tabLinks: "링크",
    tabScope: "범위",
    tabSettings: "설정",
    tabClose: "종료",

    guide: {
      steps: [
        "의뢰인 온보딩의 현재 상태를 한눈에 보고, 각 단계의 상태를 판정하는 화면이다.",
        "상태 흐름: 대기 → 진행 중 → 완료 요청(의뢰인이 「완료했습니다」를 누름) → 확인 완료(나만 가능). 「완료 요청」과 「확인 완료」를 절대 같은 것으로 취급하지 않는다 — 개인 계정에 만들었거나 이메일 오타가 가장 흔한 사고다.",
        "「지금 확인」: 실제로 초대가 됐는지 각 서비스에 자동으로 물어본다. 결과는 연결 확인됨 / 아직 확인 안 됨 / 확인 오류 3가지. 「확인 오류」는 의뢰인 문제가 아니라 내 토큰 문제이니 환경변수(GITHUB_TOKEN·MY_VERCEL_TOKEN·SUPABASE_ACCESS_TOKEN)를 점검한다.",
        "「확인 완료로」: 눈으로 직접 확인했을 때 수동으로 통과시킨다. 「건너뜀으로」: 이번 의뢰에 해당 없는 단계 제외(진행률 계산에서도 빠진다). 「대기로 되돌리기」: 상태 초기화.",
        "의뢰인이 「막혔어요」·「화면공유로 도움받기」를 누르면 여기에 막힘 사유가 빨간색으로 표시되고, 아래 질문·요청에도 알림이 쌓인다.",
      ],
      links: [
        "의뢰인 포털에 보여줄 링크를 등록하는 화면이다. 의뢰인은 읽기만 가능하다.",
        "「고정」을 켠 링크는 포털 최상단의 「작업 URL 바로가기」 큰 버튼이 된다 — 중간 확인용 배포 주소를 여기에 고정해 두면 의뢰인이 헤매지 않는다.",
        "그 외 링크(레포·Figma·문서 등)는 포털의 바로가기 목록에 표시된다.",
      ],
      scope: [
        "통화·미팅에서 합의한 작업 범위를 마크다운으로 정리해 두는 칸이다. 의뢰인 포털에는 읽기 전용으로 보인다.",
        "「저장」은 내용만 갱신하고, 「이 내용으로 범위 확정」은 확정 시각을 도장 찍는다. 확정 이후 의뢰인이 남긴 요청 수가 곧 범위 증가분으로 집계된다 — 추가 견적 이야기를 꺼낼 근거가 된다.",
        "「미리보기」로 의뢰인에게 보이는 모습 그대로 확인할 수 있다.",
      ],
      settings: [
        "프로젝트 기본 정보와 조직 연결 상태를 관리한다.",
        "조직 이름(GitHub·Vercel·Supabase) 세 칸은 의뢰인이 포털에서 입력하지만, 여기서 직접 고칠 수도 있다. URL을 통째로 붙여넣어도 자동으로 정리된다.",
        "「포털 접근 이메일」: 여기 등록된 이메일만 의뢰인 포털에 로그인할 수 있다. 담당자가 여럿이면 추가한다.",
        "「접속 정보 발급」: 임시 비밀번호를 만들어 접속 안내문(주소+이메일+비밀번호)을 카톡으로 전달한다. 분실 시 같은 버튼으로 재발급하면 이전 비밀번호는 무효가 된다.",
        "「로그인 링크 만들기」: 비밀번호 없이 클릭 한 번으로 로그인되는 1회용 링크. 비상용 보조 수단.",
      ],
      close: [
        "프로젝트를 끝낼 때의 체크리스트다. 위에서부터 순서대로만 체크할 수 있게 되어 있다.",
        "특히 ②토큰 폐기가 ③멤버 탈퇴보다 먼저다 — 조직에서 먼저 나가면 남은 토큰을 회수할 방법이 사라진다.",
        "모두 체크하고 종료 처리하면 상태가 「종료」로 바뀌고, 의뢰인 포털은 열람만 가능해진다.",
      ],
    },

    process: {
      title: "전체 프로세스",
      description:
        "의뢰 시작부터 종료까지의 흐름. 각 순서에서 어느 화면(탭)을 쓰는지 함께 표시한다.",
      whoMe: "나",
      whoClient: "의뢰인",
      whoBoth: "함께",
      stages: [
        {
          title: "프로젝트 생성",
          who: "me",
          where: "새 프로젝트",
          body: "코드·의뢰인 정보를 입력해 만들면 온보딩 단계 7개가 템플릿에서 자동으로 채워지고, 의뢰인 이메일이 포털 접근 목록에 등록된다.",
        },
        {
          title: "작업 범위 정리",
          who: "me",
          where: "범위 탭",
          body: "통화·미팅에서 합의한 내용을 정리해 적고 「범위 확정」을 누른다. 의뢰인이 포털에서 읽고 확인하는 근거 문서가 된다.",
        },
        {
          title: "의뢰인 초대",
          who: "me",
          where: "설정 탭",
          body: "「비밀번호 발급」으로 접속 안내문(포털 주소 + 이메일 + 임시 비밀번호)을 만들어 카톡으로 전달한다. 비밀번호 분실 시에도 같은 버튼으로 재발급.",
        },
        {
          title: "계정 3개 연결",
          who: "client",
          where: "단계 탭에서 모니터링",
          body: "의뢰인이 포털 안내를 따라 GitHub 조직·Vercel 팀·Supabase 조직을 만들고 나를 초대한다. 완료 요청이 오면 「지금 확인」 또는 눈으로 확인 후 「확인 완료로」. 막힘 표시가 뜨면 연락하거나 화면공유를 잡는다.",
        },
        {
          title: "개발 진행",
          who: "me",
          where: "링크 탭",
          body: "의뢰인 조직 안에서 개발한다. 중간 확인 주소가 생기면 링크로 등록하고 「고정」해 포털 최상단 버튼으로 보여준다.",
        },
        {
          title: "도메인 연결",
          who: "both",
          where: "단계 탭",
          body: "의뢰인 명의로 도메인을 준비하게 안내하고 연결한다. 눈으로 확인 후 「확인 완료로」 처리한다.",
        },
        {
          title: "배포·인수인계",
          who: "me",
          where: "단계 탭",
          body: "서비스를 열고 README·운영 방법·월 고정비 자료를 전달한다. 월 고정비는 상단의 계산기를 활용한다.",
        },
        {
          title: "종료",
          who: "me",
          where: "종료 탭",
          body: "체크리스트를 순서대로 완료한다. 토큰 폐기 → 멤버 탈퇴 순서가 핵심. 완료하면 프로젝트가 종료 상태가 된다.",
        },
      ],
    },

    form: {
      code: "코드 (URL에 쓰이는 고유 slug)",
      codePlaceholder: "예: acme-shop",
      codeHelp: "포털 주소가 /p/코드 가 됩니다. 영문 소문자·숫자·하이픈만.",
      name: "프로젝트 이름",
      clientName: "의뢰인 이름",
      clientEmail: "의뢰인 이메일",
      clientEmailHelp:
        "이 이메일로 매직링크 로그인하면 포털 접근이 열립니다. 초대 메일을 따로 보내지 않습니다.",
      supportTier: "지원 등급",
      status: "프로젝트 상태",
      githubOrg: "GitHub 조직",
      vercelTeam: "Vercel 팀",
      supabaseOrg: "Supabase 조직",
      domain: "도메인",
      create: "프로젝트 만들기",
      creating: "만드는 중…",
      createHelp: "생성하면 온보딩 단계가 템플릿에서 복사되어 채워집니다.",
      guests: "포털 접근 이메일",
      guestsHelp: "의뢰인 쪽에서 포털에 들어올 수 있는 이메일 목록입니다.",
      addGuest: "이메일 추가",
      codeDuplicate: "이미 사용 중인 코드입니다.",
      invalidCode: "영문 소문자·숫자·하이픈만 쓸 수 있습니다.",
    },

    password: {
      title: "접속 정보 발급 (비밀번호)",
      help: "임시 비밀번호를 만들어 카톡으로 전달한다. 비밀번호는 프로젝트가 아니라 계정(이메일) 단위라, 이 의뢰인의 다른 프로젝트에도 같은 비밀번호 하나로 로그인된다. 재발급하면 이전 비밀번호는 즉시 무효 — 이미 잘 쓰고 있는 의뢰인에게는 함부로 누르지 않는다.",
      issue: "비밀번호 발급",
      reissue: "재발급",
      issuing: "발급하는 중…",
      copyMessage: "안내문 복사",
      messageReady: (email: string) =>
        `${email} 접속 안내문이 준비되었습니다. 카톡에 붙여넣으세요.`,
      kakaoMessage: (params: {
        projectName: string;
        portalUrl: string;
        email: string;
        password: string;
      }) =>
        `[${params.projectName}] 진행 상황 포털 안내\n\n` +
        `아래 주소에서 진행 상황 확인과 요청을 하실 수 있습니다.\n\n` +
        `▶ 주소: ${params.portalUrl}\n` +
        `▶ 이메일: ${params.email}\n` +
        `▶ 비밀번호: ${params.password}\n\n` +
        `주소를 즐겨찾기 해두시면 다음부터 바로 들어오실 수 있습니다.`,
      myPasswordTitle: "내 비밀번호 변경",
      myPasswordHelp: "관리자 계정(내 이메일)의 로그인 비밀번호를 바꾼다.",
      newPasswordLabel: "새 비밀번호 (8자 이상)",
      change: "변경",
      changed: "비밀번호가 변경되었습니다",
      tooShort: "8자 이상 입력해 주세요",
    },

    magicLink: {
      title: "로그인 링크 만들기 (보조 수단)",
      help: "비밀번호 없이 클릭 한 번으로 로그인되는 1회용 링크. 의뢰인이 비밀번호 입력을 어려워할 때 비상용으로 쓴다. 링크는 24시간 유효하고 1회만 쓸 수 있다.",
      warning:
        "링크만 있으면 로그인되니, 반드시 그 이메일의 주인에게만 전달할 것.",
      generate: "링크 만들기",
      generating: "만드는 중…",
      copyLink: "링크 복사",
      linkReady: (email: string) => `${email} 용 로그인 링크가 준비되었습니다`,
      regenerateNote: "다시 만들면 새 링크가 발급됩니다 (이전 링크는 무효).",
    },

    steps: {
      verifyNow: "지금 확인",
      markVerified: "확인 완료로",
      markSkipped: "건너뜀으로",
      reset: "대기로 되돌리기",
      lastVerify: "마지막 확인",
      blockedReason: "막힌 사유",
      clientDoneAt: "완료 요청 시각",
    },

    links: {
      label: "이름",
      url: "주소",
      pinned: "고정",
      pinnedHelp: "고정하면 포털 홈 최상단에 큰 버튼으로 보입니다.",
      addLink: "링크 추가",
      empty: "등록된 링크가 없습니다.",
      unpin: "고정 해제",
      pin: "고정",
    },

    scope: {
      title: "작업 범위 (Markdown)",
      help: "통화·미팅에서 합의한 범위를 정리해 적는다. 의뢰인은 읽기 전용.",
      agree: "이 내용으로 범위 확정",
      agreedAt: (date: string) => `${date} 확정됨`,
      notAgreed: "아직 확정 전",
      requestsSince: (count: number) => `확정 이후 들어온 요청 ${count}건`,
      requestsHelp: "확정 이후 쌓인 요청 수가 곧 범위 증가분이다.",
      preview: "미리보기",
    },

    offboard: {
      title: "종료 체크리스트",
      help: "위에서부터 순서대로만 진행한다. 특히 토큰 폐기가 멤버 탈퇴보다 먼저다.",
      completeButton: "프로젝트 종료 처리",
      completeConfirm:
        "체크리스트를 모두 마쳤습니까? 종료하면 상태가 closed로 바뀝니다.",
      closedAt: (date: string) => `${date} 종료됨`,
      notReady: "위 항목을 순서대로 모두 체크하면 종료할 수 있습니다.",
    },
  },

  cost: {
    title: "월 고정비 계산기",
    description:
      "서비스 운영에 매달 들어가는 고정비를 계산합니다. 의뢰인 안내용.",
    tableService: "서비스",
    tablePlan: "요금제",
    tablePrice: "비용",
    tableNote: "비고",
    perMonth: (usd: number) => `$${usd}/월`,
    perYearKrw: (krw: number) => `연 ${krw.toLocaleString("ko-KR")}원`,
    freeLabel: "무료",
    totalTitle: "합계",
    totalMonthly: (usd: number, krw: number) =>
      `월 $${usd} (약 ${krw.toLocaleString("ko-KR")}원)`,
    disclaimer:
      "환율과 요금제는 바뀔 수 있습니다. 정확한 금액은 각 서비스의 결제 화면 기준입니다.",
  },

  privacy: {
    title: "개인정보 처리방침",
  },
} as const;
