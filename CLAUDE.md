# 온보딩 허브 라이트 — CLAUDE.md

> 지인·소규모 의뢰용 온보딩 관리 도구. 혼자 쓰고, 의뢰인이 손님으로 들어온다.
> **원칙: 없어도 굴러가는 것은 만들지 않는다. 관리자가 손으로 하는 일은 굴러가는 것이 아니다.**
> v0.5 · 2026-09-10 (시계 = 크론 tick 1개 · 장부 notices · 「보낼 카톡」 · 사전 점검 게이트 · 프래그먼트 로그인 링크)

---

## 1. 무엇을 만드는가

의뢰받은 웹서비스를 의뢰인 명의 계정(GitHub Org / Vercel Team / Supabase Org)에
귀속시키는 절차를, 의뢰인과 함께 한 화면에서 보며 완주하는 도구.

- 사용자 2종: **나**(`/a`, 관리) / **의뢰인**(`/p/[code]`, 손님)
- 규모 전제: 동시 진행 1~3건. 나 혼자 씀
- 수익 모델 없음. 멀티테넌시 없음. 계약 기반 아님

### 이 도구의 존재 이유 — 딱 4가지

1. **의뢰인이 계정 3개를 헤매지 않고 연결한다** ← 나머지는 전부 부속
2. 어느 단계에서 멈췄는지 물어보지 않고 안다
3. 질문·요청사항이 카톡에 묻히지 않는다
4. 어느 프로젝트가 어느 조직에 붙어 있는지 한눈에 본다

**1번이 이 도구의 전부다.** 화면·문구·설계 판단이 충돌하면 1번을 우선한다.

### 1인 유지보수 상한

테이블 ≤ 9개 · jsonb 컬럼 1개(`steps.verify_result`) · 크론 라우트 1개(`/api/cron/tick`) ·
바깥 채널 1개(관리자 웹 푸시) + 외부 heartbeat 1개 · 의뢰인에게 직접 보내는 채널 0개 —
의뢰인에게 갈 말은 시스템이 카톡 문구로 써서 `/a` 「보낼 카톡」에 두고 관리자가 보낸다.
모든 자동화는 env가 없으면 「지금 할 일」 칩으로 강등된다. tick은 순수 함수 `runTick(now)`이고
로컬 `curl`로 재현 가능해야 한다.

### 하지 않는 것 (다른 채널로 처리)

- **파일 주고받기** — 카톡·메일·드라이브로 한다. Supabase Storage를 쓰지 않는다
- **기획 문답 폼** — 통화·미팅으로 하고, 결과만 `projects.scope_md`에 적는다

---

## 2. 기술 스택 (변경 금지)

Next.js App Router + TypeScript strict / Tailwind + shadcn/ui / Pretendard /
Supabase **ap-northeast-2 (서울)** / Supabase Auth 이메일+비밀번호 /
React Hook Form + Zod / react-markdown + rehype-sanitize /
lucide-react / date-fns / Vercel **함수 리전 icn1(서울)** / pnpm /
`@anthropic-ai/sdk` (온보딩 도우미 챗봇 전용) / `web-push` (관리자 휴대폰 알림, VAPID)

> Vercel 기본 리전은 미국 동부다. DB가 서울이므로 `vercel.json`에서
> `regions: ["icn1"]`을 반드시 유지한다 — 안 그러면 클릭마다 태평양을 왕복한다.

**쓰지 않는 것**: Supabase Storage · 메일 발송(Resend·SMTP 일체) · 문자·알림톡 ·
i18n · 상태관리 라이브러리 · 차트 · 결제 SDK · 파일 업로드

> 의뢰인에게 보내는 메일·문자·알림톡 채널을 만들지 않는다. 의뢰인에게 전할 말은 시스템이
> 카톡 문구로 작성해 `/a` 「보낼 카톡」에 두고, 관리자가 직접 카톡으로 보낸 뒤 「카톡으로
> 보내기」(공유/복사 = 보냈음)를 누른다(`notices.channel='outbox'`). 허브가 의뢰인에게 직접
> 보내는 경로는 없다.

> 크론은 **Vercel Cron 1개**(`/api/cron/tick`, 15분, `CRON_SECRET`)만. tick은 판단만 하고
> 행동은 기존 서버 함수를 부른다. 완주하지 않으면 `/a` 배너가 빨갛고, 외부 heartbeat
> (`HEARTBEAT_URL`, 선택)가 관리자에게 알린다. Vercel Cron은 Pro 유지가 전제다.

> 스크린샷 등 안내용 이미지는 `public/guides/`에 커밋한다. 업로드 기능이 아니다.

---

## 3. 폴더 구조

```
src/
  app/
    login/                  이메일+비밀번호 로그인
    auth/callback/          토큰 검증·역할별 이동
    auth/link/              1회용 로그인 링크 착지 (토큰은 #프래그먼트, 버튼 클릭 후 소비)
    (admin)/a/
      page.tsx              프로젝트 목록
      [code]/page.tsx       상세 (탭: 단계·링크·범위·설정·종료)
    (guest)/p/[code]/
      page.tsx              포털 홈 (링크 보드 + 진행률 + 다음 할 일)
      steps/[key]/page.tsx  단계 상세 ← 가장 공들일 화면
    api/verify/[type]/route.ts
    api/cron/tick/route.ts  유일한 크론 라우트 — 인증만 하고 runTick(now)을 부른다
    api/push/ack/route.ts   푸시 「배달됨」 (서비스워커가 부른다)
    cost/page.tsx           고정비 계산기 (정적)
    privacy/page.tsx
  components/
    ui|common
    onboarding/  StepStepper · DeepLinkCard · SlugInput · VerifyBadge
    comment/     CommentThread · CommentForm
  lib/
    supabase/  client.ts, server.ts, admin.ts
    verify/    github.ts, vercel.ts, supabase.ts
    steps.ts   STEP_TEMPLATE 상수 (안내문 본문 포함)
    tick.ts    runTick(now) — 토큰 점검·재검증·장부 정리·보낼 카톡 거둠
    notify.ts  pushAdmin — 장부(dedupe_key)를 거치는 관리자 푸시의 유일한 입구
    outbox.ts  「보낼 카톡」 문구 작성·거둠·대체
    preflight.ts 접속 정보 발급 전 점검 (빨강 = 발급 차단, 우회 없음)
    magic-link.ts 로그인 링크 형태·유효시간
    cost.ts    RATES 상수 + 계산 함수
    offboard.ts OFFBOARD_CHECKLIST 상수
    slug.ts    조직 slug 정규화
  content/ko.ts
public/guides/                안내용 스크린샷
supabase/migrations/
```

---

## 4. 데이터 모델 — 8개 테이블

```
admins(email)                     내 이메일 1건 (+ tick heartbeat·토큰 점검 시각)
push_subscriptions(endpoint)      내 휴대폰 알림 구독 (관리자만, 큐가 아니다)
notices(dedupe_key)               장부: 푸시 발송 이력 + 「보낼 카톡」 문구. 큐가 아니다
projects                          의뢰 사안
 ├─ project_guests(email)         의뢰인 접근 목록
 ├─ steps                         온보딩 단계
 ├─ links                         프로젝트 링크 (배포 URL 등)
 └─ comments(step_id nullable)    질문 · 요청사항
```

### 공통 규칙
- PK는 `uuid default gen_random_uuid()`
- 모든 테이블에 `created_at`, `updated_at timestamptz not null default now()`
- `updated_at`은 moddatetime 트리거
- FK는 전부 `on delete cascade`
- enum은 `text + check` 제약
- **jsonb는 `steps.verify_result` 하나뿐이다**

### notices — 장부이지 큐가 아니다
`channel`(push|outbox) · `kind` · `dedupe_key`(unique, **반드시 에폭 포함**) · `status`
(push: claimed→sent|failed / outbox: pending→sent|skipped|superseded) · `title`·`body`(outbox 문구
전문 — 비밀번호·토큰·로그인 링크 금지) · `skip_reason`(admin|condition_cleared|cap) · `sent_at`
(push: 푸시 서비스 201 / outbox: 관리자 「보냈음」) · `acked_at`(서비스워커 ack = 배달됨) · `day_kst`

> 「이미 만들었는가」를 답하는 멱등 키다. 실패·거둔 행은 재시도하지 않는다 — 다음 tick이 조건을
> 다시 계산해 새 키로 만든다. 같은 주제의 pending은 새 문구가 대체한다(superseded). 근거 조건이
> 사라진 문구는 tick이 거둔다(condition_cleared). 관리자만 읽고, 쓰기는 service_role만.

### projects
`code`(unique slug) · `name` · `client_name` · `client_email` ·
`support_tier`(self|assisted) · `status`(onboarding|building|delivered|closed) ·
`github_org` · `vercel_team` · `supabase_org` · `domain` ·
`scope_md` · `scope_agreed_at` · `closed_at` · `access_sent_at`(접속 안내 「보냈음」 시각 —
리마인드·미접속의 기준점) · `remind_paused_until`

> `scope_md`는 통화·미팅에서 합의한 범위를 **내가 정리해 적는 마크다운 한 칸**이다.
> 의뢰인은 읽기 전용. `scope_agreed_at` 이후 쌓인 `kind='request'` 코멘트 수가
> 곧 범위 증가분이며 `/a` 상세에 카운트로 노출한다. 문답 폼은 만들지 않는다.

### steps
`project_id` · `order_index` · `key` · `title` · `description_md` ·
`owner_side`(client|agency) · `verify_type`(manual|github|vercel|supabase) ·
`status` · `checked_at` · `verified_at` · `verify_result jsonb` · `blocked_reason`

> `verify_result`: `status`(3상태) · `code` · `checked_at`(CAS 기준값) · `client_attempts`(의뢰인이
> 「완료했습니다」를 누른 횟수 — 막힘 판정의 유일한 분모) · `auto_checks`(자동 재확인 횟수, 판정에
> 쓰지 않는다) · `next_check_at`(5m→30m→2h→6h→24h 백오프) · `first_failed_at`(dedupe 키의 에폭)

> `src/lib/steps.ts`의 `STEP_TEMPLATE`에서 **복사**해 넣는다. 템플릿 관리 화면 없음.
> `description_md`가 이 도구의 실질적 콘텐츠다. 성의 있게 쓴다.

### links
`project_id` · `order_index` · `label` · `url` · `is_pinned bool default false`

> 배포 URL · 관리자 화면 · 레포 · Figma · 문서. 내가 등록하고 의뢰인은 읽기만.
> `is_pinned=true`는 포털 홈 최상단 링크 보드에 큰 버튼으로 고정된다.

### comments
`project_id` · `step_id`(nullable) · `author_side`(admin|client) ·
`kind`(question|request) · `body` · `read_at` · `deleted_at`

> `read_at`이 null인 상대편 코멘트 수가 `/a` 대시보드의 «안 읽음» 배지다.

---

## 5. 상태 전이 — 이것만은 단순화하지 않는다

```
todo → doing → client_done → verified
 client_done → returned (시스템: 의뢰인이 고칠 원인이 확정됨 · 「안 왔음」)
 returned → client_done (의뢰인이 고치고 다시 「완료했습니다」 · 원인이 내 쪽으로 넘어옴)
 any → blocked (blocked_reason 필수)
 any → skipped (나만)
```

- **의뢰인은 `doing` / `client_done` / `blocked` 로만 변경 가능**
- `verified` / `skipped` 는 나만. RLS `WITH CHECK`로 DB 레벨 강제. `returned` 는 시스템(service_role)만 —
  의뢰인 화면에는 「한 가지만 더」, 관리자 화면에는 「되돌림」. 포털 「다음 할 일」 최상단에 원인 문장과 함께 뜬다
- 진행률 = `(verified × 1.0 + (client_done + returned) × 0.5) / 전체 단계 수`
- 프로젝트 상태는 사건이 올린다(`src/lib/lifecycle.ts`): 첫 제작자 단계 앞의 의뢰인 단계가 전부 끝나고 범위가 확정되면
  `building`, 「배포 및 인수인계」가 확인되면 `delivered`. 앞으로만 간다 — 되돌리기는 설정 탭에서 사람이

`client_done`("했어요")과 `verified`(실제로 됐음)를 절대 합치지 않는다.
개인 계정에 만들었거나 이메일 오타 난 경우가 가장 흔한 사고다.

---

## 6. 인증 — 이메일+비밀번호, 메일 의존 없음

- Supabase Auth `signInWithPassword`. 소셜·커스텀 인증 없음
- **비밀번호는 관리자가 발급·재발급한다** — `/a/[code]` 설정 탭
  「접속 정보 발급」이 임시 비밀번호와 안내문(주소+이메일+비밀번호)을 만들어
  주고, 카톡으로 전달한다. 재발급하면 이전 비밀번호는 무효
- 보조 수단: 관리자가 생성하는 1회용 로그인 링크(매직링크). 비밀번호 입력을
  어려워하는 의뢰인용 비상 수단. 유효시간은 코드가 아니라 Supabase 대시보드
  Auth › Email › Email OTP Expiration(최대 86400초, 기본 3600초)이 결정한다 — 86400으로
  설정하고 `MAGIC_LINK_TTL_HOURS`와 일치시킨다. 링크는 `/auth/link#token_hash=…`
  프래그먼트 형태이며 **사람이 버튼을 누른 뒤에만** 소비된다(카톡 링크 미리보기·메일
  스캐너가 먼저 열어도 소진되지 않게). 쿼리 파라미터 `?token_hash=`로 만들지 않는다
- 로그인 후 분기: `admins`에 있으면 `/a`, `project_guests`에 있으면 `/p/[code]`
- **초대 토큰 테이블을 만들지 않는다.** 프로젝트에 의뢰인 이메일을 등록해두고,
  그 이메일로 로그인하면 이메일 매칭으로 접근이 열린다
- **SMTP를 설정하지 않는다.** 메일을 보내는 경로 자체가 없다 —
  이메일 기반 셀프 재설정이 세 번 아쉬워지면 그때 Resend를 검토한다

---

## 7. RLS

모든 테이블 RLS 필수. 헬퍼 2개를 경유한다.

```sql
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists(select 1 from admins where email = auth.email())
$$;

create or replace function public.my_project_ids()
returns setof uuid language sql security definer stable
set search_path = public as $$
  select id from projects where public.is_admin()
  union
  select project_id from project_guests where email = auth.email()
$$;
```

### 의뢰인 쓰기 허용 — 정확히 세 곳뿐

| 대상 | 허용 |
|---|---|
| `steps` | status → doing / client_done / blocked 만 (owner_side='client'인 것만) |
| `projects` | 조직 slug 컬럼(`github_org`·`vercel_team`·`supabase_org`)만 |
| `comments` | INSERT + 자기 글 soft delete + 자기가 받은 글 `read_at` 갱신 |

`links`·`scope_md`·`status`·`verify_result`는 의뢰인 읽기 전용.
`author_side`와 검증 결과는 **서버에서 결정**한다. 클라이언트 값을 믿지 않는다.

가드 트리거는 **allow-list**다 — 새 컬럼은 추가하는 순간 기본이 「막힘」. `old.status`가
`verified`/`skipped`인 행은 의뢰인이 어떤 갱신도 못 한다(가드 + RLS USING 이중 강제).
`notices`·`push_subscriptions`·`admins`는 의뢰인 세션에 0행이다.

---

## 8. 검증 API — 3종, 3상태

결과는 반드시 `verified` / `not_found` / `error` 셋으로 구분한다.
`error`(토큰 만료 등)를 `not_found`(아직 안 함)로 뭉뚱그리면,
리마인더를 보내고 의뢰인은 "했다니까요"라고 답하는 상황이 반복된다.

| verify_type | API | 판정 |
|---|---|---|
| `github` | `GET /orgs/{org}/memberships/{me}` | `state === 'active'` |
| `vercel` | `GET /v2/teams`로 slug→id, `GET /v3/teams/{id}/members` | 내 `id`(`/v2/user`의 `id`, uid 아님) 항목이 confirmed |
| `supabase` | `GET /v1/organizations/{slug}/members` | 내 이메일 포함 |

DNS 검증은 만들지 않는다. 도메인은 눈으로 확인한다.

**검증은 사람이 누르지 않는다.** 의뢰인이 「완료했습니다」를 누르는 순간, 그리고 tick이
`next_check_at`이 지난 완료 요청을 백오프로 다시 확인한다. 결과 저장은 CAS(`checked_at`
비교)라 tick·화면 열림·의뢰인 클릭이 동시에 돌아도 알림은 한 번이다. 모든 외부 fetch에
`AbortSignal.timeout`. `/api/verify`는 의뢰인 클릭에 60초 쿨다운.

**사람이 「지금 확인」을 누르지 않는다.** `src/lib/verify/run.ts`가 단일 진입점이다.
의뢰인이 「완료했습니다」를 누르는 순간 검증하고(확인되면 그 자리에서 `verified`),
`/a`·`/a/[code]`·포털이 열릴 때 5분 넘은 완료 요청을 다시 확인한다 — 크론 대신
"화면이 열리는 것"이 시계다. `not_found`에는 `code`(pending_accept / check_invite /
no_slug)를 실어 「지금 할 일」이 "초대 수락 필요: Vercel"처럼 내 다음 행동을 말하게
한다. 「지금 확인」 버튼은 비상용으로만 남는다. (실제 지적: "이걸 내가 일일이
누를 거면 의뢰인과 둘이 앉아서 하는 게 빠르다")

**토큰 상태는 의뢰인보다 내가 먼저 안다.** `/a` 최상단 「검증 설정 점검」이
토큰 3개를 실제로 호출해 초록/빨강으로 보여주고, 의뢰인 화면에서 실패한
확인을 목록으로 띄운다. tick도 매시간(마지막 점검 기록 기준) 점검해 초록↔빨강
**전환**에만 푸시한다. **사전 점검 빨강 = 토큰 missing/invalid · Vercel 이메일 불일치 ·
의뢰인 이메일 형식 오류/관리자 이메일과 동일** — 이때 접속 정보·비밀번호 발급·로그인
링크가 막히고 우회 버튼은 없다. 푸시·크론 문제는 노랑 + 내 할 일이며 의뢰인 흐름을
막지 않는다. 의뢰인 화면에서 `error`는 「제작자 확인 중」으로
보인다 — 데이터는 그대로 `error`, 문구만 차분하게. (실제 사고: 토큰을
등록하지 않은 채 의뢰인이 확인을 눌러 빨간 「확인 오류」를 봤다)

**결과에는 원인 코드와 책임자가 붙는다.** `verify_result.code`(`src/lib/verify/types.ts`의
`CODE_TABLE`)가 status 와 `owner`(client / admin / system)를 결정한다. 의뢰인 화면은
코드→문장 매핑(`ko.stepDetail.verifyCode`)만 그리고 관리자 1인칭 `detail`은 절대 그리지 않는다.
Vercel·Supabase의 「멤버 목록에 없음」은 초대 전인지 내 수락 전인지 API로 구분할 수 없으므로
owner=admin(`await_admin_first`)에서 시작한다 — 내가 메일함을 보고 「왔음·수락했음 / 안 왔음」
2탭을 눌러야 다음이 정해진다. 「안 왔음」이면 의뢰인 원인(`check_invite`)으로 바뀌고 「초대 확인
부탁」 카톡 문구가 「보낼 카톡」에 오른다. Anthropic·Resend·Solapi 같은 수동 단계도 같은 2탭이다
(`ADMIN_ACK_KEYS`). 일시 오류(owner=system)는 조용히 백오프하고 3회째에만 알린다.

**관리자 이메일 = 내 GitHub·Vercel·Supabase·Anthropic 계정 이메일.** 의뢰인은
허브가 보여주는 이메일로 초대하므로, 다르면 초대를 수락할 수 없다. 점검 배너가
Vercel 계정 이메일과 대조해 「이메일 불일치」로 잡는다. (실제 사고: 허브는
한메일, 계정들은 gmail — 초대 4건이 전부 헛돌아 의뢰인에게 재초대를 부탁했다)

---

## 9. 계정 연결 화면 — 이 도구의 본체

`/p/[code]/steps/[key]`가 가장 많은 공을 들일 화면이다. 원칙 셋.

**① 한 화면에 한 가지만.** 조직 생성 · slug 입력 · 초대 세 가지를 동시에
보여주지 않는다. 앞 단계가 끝나야 다음이 나타나는 스텝퍼로 만든다.

**② 찾게 하지 말고 데려간다.**
- 딥링크 버튼(새 탭): `github.com/orgs/{org}/people` /
  `vercel.com/teams/{team}/settings/members` /
  `supabase.com/dashboard/org/{slug}/team`
- 「초대할 이메일 복사」 버튼 — 타이핑하면 반드시 오타 난다
- 지정할 역할을 정확히 명시: GitHub **Owner** / Vercel **Member** /
  Supabase **Administrator**
- 실제 화면 스크린샷을 `public/guides/`에 두고 안내문에 삽입

**③ 막힐 자리를 미리 막는다.**
- slug 입력은 정규화한다 — 의뢰인은 URL 전체를 붙여넣는다
  (`github.com/orgs/foo/people`, `@foo`, 공백, 대문자 모두 `foo`로)
- slug가 없는 초기 상태의 화면을 반드시 설계한다
- 단계마다 「자주 막히는 곳」 2~3줄
- 하단 sticky: [완료했습니다] [막혔어요] [화면공유로 도움받기]
- 「화면공유로 도움받기」 → `blocked` + 사유 `need_help` + 내게 알림

### 지원 등급 (support_tier)

| 등급 | 대상 | 방식 |
|---|---|---|
| `self` | 개발 좀 아는 의뢰인 | 딥링크 + 안내문으로 스스로 |
| `assisted` | 대부분 | 20분 화면공유로 3개 한 번에 |

**역방향 구축(내가 만들고 이관)은 채택하지 않는다.** Vercel은 인테그레이션·Blob·
로그가 안 옮겨지고, Supabase는 GitHub 연동이 붙는 순간 이관 자체가 막힌다.

### 온보딩 도우미 (계정 연결 단계 전용 AI 챗봇)

연결 단계 화면에서만 뜨는 「도우미에게 물어보기」 시트. Claude API로
"지금 어느 메뉴를 누르면 되는지"를 답한다. 화면 구성은 수시로 바뀌므로
web search(공식 문서 도메인 한정)로 최신 상태를 확인해 답하게 한다.

- **대화를 저장하지 않는다** — 메모리에만 두고, DB·localStorage 어디에도 쓰지 않는다.
  "의뢰인 작업 과정을 기록하지 않는다"는 원칙을 코드로 지킨 것
- 서버는 현재 단계·저장된 slug·검증 상태만 컨텍스트로 넘긴다
- 시스템 프롬프트에 **비밀번호·인증코드·API 키를 묻지 않는다**를 못박는다
- 키(`ANTHROPIC_API_KEY`)가 없으면 도우미만 조용히 비활성. 온보딩은 그대로 동작
- 호출량 제한은 라우트 모듈 메모리에만 둔다 (분 10회·시간 40회). 테이블을 만들지 않는다
- `max_tokens`는 답변 길이 손잡이가 아니다. Opus 5는 생각하기가 기본이고
  이 값이 (생각 + 답변)의 상한이라, 조이면 빈 답이 돌아온다
- 이것은 §12의 「실시간 채팅」이 아니다. 사람 간 소통은 여전히 질문·요청 코멘트 하나뿐

### 제작자 루프 — 의뢰인이 한 일에 제때 대처한다

의뢰인 쪽 흐름만 있고 제작자 쪽 루프가 없으면 「의뢰인용 안내 화면」이지
관리 도구가 아니다. (실제 사고: 의뢰인이 34분 만에 5단계를 끝내고 질문 3개를
남겼는데 나는 3시간 동안 몰랐다)

- **알림** — 의뢰인이 「완료했습니다」·「막혔어요」·「화면공유로 도움받기」·
  질문·요청을 남기거나 자동 확인이 실패하면 내 휴대폰으로 웹 푸시. 메일·외부
  서비스 없이 PWA만으로. 보내는 자리는 그 행동을 저장하는 서버 액션이고,
  `after()`로 응답을 막지 않는다. 알림 실패는 절대 저장을 막지 않는다
- **지금 할 일** — `src/lib/todo.ts`가 기존 데이터에서 계산한다. 완료 요청 확인 ·
  막힘 · 화면공유 요청 · 확인 실패 · 안 읽은 질문 · 범위 미작성/미확정 · 접근 이메일
  없음 · 미접속. `/a` 최상단과 `/a/[code]` 「현재 상황」에 칩으로, 누르면 그 탭
- **수동 단계의 자기확인** — API로 확인할 수 없는 의뢰인 단계(`DONE_CHECKLIST`)는
  「완료했습니다」 전에 스스로 확인할 항목을 모두 체크해야 넘어간다. 저장하지 않는다
- **보낼 카톡** — 의뢰인에게 전할 말(접속 안내·연결 확인·다음 안내·재요청·답글 알림)은
  시스템이 완성 문구로 써서 `/a` 최상단 「보낼 카톡」에 둔다. 나는 「카톡으로 보내기」
  (폰: 공유 창 / PC: 복사) 한 번으로 보내고, 그 순간 「보냈음」이 기록된다. 허브는 의뢰인에게
  직접 보내지 않는다. 철 지난 문구는 tick이 거둔다. 한 사건에 푸시는 하나 — 사건 푸시가
  이미 나갔으면 문구 생성은 조용하다. 적체(4시간)는 09~21시 KST에 하루 1회만 알린다
- **알림은 배달(ack)까지 본다** — `notices.sent`는 푸시 서비스가 받은 것이지 폰에 뜬 것이
  아니다. 서비스워커가 표시·클릭 시 `/api/push/ack`로 `acked_at`을 남긴다
- **시계는 tick이다** — 15분마다 토큰 점검·재검증·장부 정리·보낼 카톡 거둠이 화면과 무관하게
  돈다. 대시보드·포털 열림은 이중화일 뿐이다

### 오류 처리 — 의뢰인이 당황하지 않게

- 화면 오류는 `error.tsx`가 안심 문구로 받고, `/api/client-error`로 보고한다
- 보고는 **서버 로그(Vercel 런타임 로그)** 로만 간다. 오류 로그 테이블을 만들지 않는다
- 원인 분석·수정·배포는 그 로그를 보고 사람이 한다 (실제로 이 경로로 버그를 잡았다)

### 추가 연결 단계 (기본 3개 외)

- **Anthropic Console (Claude API)** — AI 기능 의뢰의 기본 템플릿 4번째 단계.
  의뢰인 조직에 만들고 나를 Developer로 초대, API 키는 의뢰인 조직에서 발급해
  서비스 환경변수로 직행. 키를 이 도구에 저장하지 않는다. AI 없는 의뢰는 「건너뜀」
- **선택 단계 (`OPTIONAL_STEP_TEMPLATES`)** — Resend(메일)·Solapi(문자·알림톡)
  등 의뢰별로 필요한 스택은 단계 탭 「선택 단계 추가」로 골라 넣는다.
  새 스택이 필요해지면 이 상수에 템플릿을 추가한다 (관리 UI는 만들지 않는다)

---

## 10. 종료(오프보딩) — 순서가 중요하다

`src/lib/offboard.ts`의 `OFFBOARD_CHECKLIST`를 `/a/[code]` 종료 탭에 렌더한다.
위에서부터 순서대로만 체크 가능하게 만든다. 완료 시 `status='closed'`, `closed_at`.

```
1. 인수인계 자료 전달 (README, 배포·운영 방법, 월 고정비)
2. 발급받은 토큰·키 폐기 (GitHub PAT / Vercel / Supabase 등) ← 먼저
   (서비스가 실제로 쓰는 키 — Anthropic API 키 등 — 는 의뢰인 조직 소유라 남긴다)
3. 연결된 모든 조직에서 내 멤버 권한 탈퇴                    ← 나중
   (GitHub·Vercel·Supabase + 연결했다면 Anthropic·Resend·Solapi)
4. 로컬 클론 · .env · 덤프 파일 삭제
5. 의뢰인 포털 접근 회수 (`project_guests` 행 삭제 + Auth 사용자 삭제)
6. 의뢰인에게 완료 안내 + 멤버 목록 확인 방법 안내
```

> 비밀번호에는 만료가 없다. 5번을 건너뛰면 종료된 프로젝트의 의뢰인이
> 포털·도우미·검증 API를 계속 호출할 수 있다.

> **2번과 3번의 순서를 지킬 것.** 멤버를 먼저 지우면 조직에서 나온 뒤라
> 남아 있는 토큰을 회수할 방법이 사라진다.

---

## 11. 절대 금지

1. `localStorage` / `sessionStorage`
2. Supabase 서울 외 리전
3. **Supabase Storage 사용 · 파일 업로드 기능**
4. `service_role` 키 클라이언트 노출 (`NEXT_PUBLIC_` 접두 금지)
5. RLS 없는 테이블
6. 의뢰인이 `verified`를 쓸 수 있는 정책
7. 의뢰인의 외부 서비스(GitHub·Vercel·Supabase 등) 비밀번호·인증코드 수집
   (어떤 형태로도 — 이 도구의 로그인 비밀번호와는 별개다)
8. `any` 타입
9. `useEffect` + `fetch` (Server Component 사용)
10. 컴포넌트에 한국어 문자열 직접 삽입 (`ko.ts` 사용 · 단, 단계 안내문은 `steps.ts`)
11. 검증 `error`를 `not_found`로 처리
12. 조직 slug를 정규화 없이 그대로 저장
13. `CRON_SECRET` 검증 없는 크론 라우트
14. `dedupe_key` 없는 자동 알림·문구 · 에폭 없는 `dedupe_key`
15. 사전 점검 빨강 우회 버튼
16. 토큰을 GET 즉시 소비하는 로그인 링크(쿼리 파라미터 `token_hash`)
17. 의뢰인에게 직접 보내는 메일·문자·알림톡 경로
18. `notices.body`에 비밀번호·토큰·로그인 링크

---

## 12. 만들지 않는 것 (요청받아도 되묻기)

파일 업로드·첨부 · 기획 문답 폼 · 멀티테넌시 · 온보딩 템플릿 관리 UI ·
초대 토큰 테이블 · 감사 로그 테이블 · 알림 큐·재시도 워커·워크플로 엔진(장부 `notices`
1개는 둔다 — 큐가 아니라 멱등 키. 실패 행은 재시도하지 않고 다음 tick이 새 키로 다시 계산한다) ·
두 번째 크론 · 자동 발송 채널 ·
동의 이력 테이블 · 요율 DB 테이블 · 산출물 승인 워크플로 ·
일정·간트·마일스톤 · 실시간 채팅 · 청구서·정산 · 실시간 협업 ·
회원가입 · 결제 · 다국어 · 다크 모드 · 차트 대시보드

필요해지면 그때 만든다. **지금 없어서 불편한 적이 세 번 생기기 전까지는 안 만든다.**

---

## 13. 항상 할 것

1. 새 테이블 → 같은 마이그레이션에 RLS 정책
2. 새 폼 → Zod 스키마
3. 새 문구 → `ko.ts` (단계 안내문은 `steps.ts`)
4. 외부 API → try/catch + 3상태 결과
5. 새 화면 → 375px 모바일 확인 (특히 `/p`)
6. 환경변수 추가 → `.env.example` 동기화
7. 새 자동 알림·문구 → 에폭 있는 `dedupe_key` + `ko.ts` 템플릿 + `notices` 기록 + 거둠 조건
8. 새 외부 API 응답 필드 → 공식 OpenAPI 또는 실호출 1회로 확인 후 코드에
9. 새 외부 fetch → `AbortSignal.timeout`
10. 새 tick 작업 → `runTick` 안에 넣고 로컬 `curl`로 재현

---

## 14. 스타일

- 인라인 `style` 금지. 컬러는 `tailwind.config.ts` `theme.extend`에만
- `/p`는 모바일 우선·여백 넓게·문장형 / `/a`는 PC 우선·테이블 밀도 높게
- 터치 타깃 44×44px 이상. `word-break: keep-all`
- 에러·로딩·빈 상태 UI는 빠뜨리지 않는다 (이건 «간소화» 대상이 아니다)
- 단계 안내문에 기술 용어를 쓰지 않는다
  («Organization을 프로비저닝» ✕ → «조직을 만들어주세요» ○)

---

## 15. 작업 시작 전 확인

1. `/a`(나)인가 `/p`(의뢰인)인가?
2. 의뢰인도 접근하는가? RLS는?
3. 상태 전이를 건드리는가? `WITH CHECK` 가드는?
4. **이 작업이 «계정 3개를 헤매지 않고 연결한다»에 기여하는가?**
   아니라면 정말 필요한지 다시 묻는다
