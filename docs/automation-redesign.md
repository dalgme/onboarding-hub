# 온보딩 허브 — 전사적 자동화 재설계 설계서 (개정 3판)

> 작성 2026-09-10 · 수석 설계자 종합본 (전문가 5인 설계안 통합) → 심사 지적 25건 반영(2판) →
> **3판: 사용자 결정 반영 — 의뢰인에게 가는 메시지는 허브가 보내지 않는다. 시스템이 카톡 문구를 써서
> 개발자 대시보드 「보낼 카톡」에 두고, 관리자가 직접 카톡으로 보낸다. 메일·문자 채널 없음(§11 #26)**
> 대상 코드: `src/lib/verify/*`, `src/lib/todo.ts`, `src/lib/push.ts`, `src/lib/steps.ts`,
> `src/app/(guest)/p/[code]/actions.ts`, `src/app/(admin)/a/actions.ts`, `src/app/auth/callback/route.ts`,
> `supabase/migrations/*`
> 규칙 기준: `CLAUDE.md` v0.4 → v0.5 개정안은 §6

**근거 표기 규칙.** 이 세션에서 공식 문서·공식 스펙 파일을 직접 열어 확인한 것은 「확인」, 심사관 또는
전문가가 인용했지만 이 환경(프록시 차단)에서 재확인하지 못한 것은 「인용·직접 재확인 못 함」,
아무도 확인하지 못한 것은 **확인 필요**로 적었다. 추측을 사실처럼 쓰지 않았다.

이번 개정에서 직접 확인한 것(§10 끝에 URL):
Supabase Management API v1 OpenAPI 원본(`V1OrganizationMemberResponse` 필드·`GET /v1/projects/{ref}/config/auth`의
`mailer_otp_exp`·조직 멤버 삭제 엔드포인트 부재) · Supabase 문서(Email OTP 만료 ≤ 86400초, 매직링크도 같은 설정,
메일 프리페치가 토큰을 소비) · Vercel 문서(`GET /v5/user/tokens/current`, `vercel crons run`은 프로덕션 배포 잡만,
CRON_SECRET은 `Authorization: Bearer`) · GitHub REST OpenAPI 원본(`PATCH /user/memberships/orgs/{org}` 설명에
classic 스코프 문구 없음 → **여전히 확인 필요**).

---

## 1. 한 문단 요약 — 무엇이 달라지는가

오늘의 사고 5건은 전부 「사람이 화면을 열어야 도는 것」과 「사람이 손으로 옮기는 것」에서 났다.
해법은 워크플로 엔진이 아니라 세 가지다. **(1) 시계 하나** — Vercel Cron 라우트 1개(`/api/cron/tick`, 15분)가
화면과 무관하게 토큰 점검·재검증·에스컬레이션·리마인드 판정을 돌린다. tick의 본체는 순수 함수 `runTick(now)`라
로컬에서 `curl`로 재현된다. **(2) 의뢰인에게 갈 말은 시스템이 쓰고, 보내는 손은 하나(관리자 카톡)** — 허브는
의뢰인에게 직접 아무것도 보내지 않는다(메일·문자 채널 없음, 3판 결정). 대신 「접속 안내」「연결 확인·다음 안내」
「재요청」「리마인드」「답글 알림」을 **완성된 카톡 문구로 작성해 `/a` 최상단 「보낼 카톡」에 올린다.** 관리자는
[복사] → 카톡 붙여넣기 → [보냈음]만 한다(건당 30초). 사람이 하는 일이 「무엇을 어떻게 쓸지 판단」에서 「붙여넣기」로
줄고, 자동 발송의 위험(오탐 리마인드·스팸함·피싱처럼 보이는 메일)은 사라진다. 의뢰인 쪽에는 같은 내용이 포털
카드로 항상 떠 있으므로 카톡은 포인터다. 철 지난 문구는 tick이 거둔다(조건 소멸 → 카드에서 내림). **(3) 「누가
다음에 움직이는가」를 데이터에 넣는다** — `verify_result`에 원인 코드와 책임자(`owner`)를 기록한다. **Vercel·Supabase의
「멤버 목록에 없음」은 "초대 없음"과 "내가 수락 전"을 API로 구분할 수 없으므로 owner=admin에서 시작한다** — 내가
「초대 안 왔음」을 누르기 전에는 재요청 문구도 되돌림도 만들어지지 않는다. 사전 점검이 빨강(토큰·이메일 불일치·의뢰인
이메일 형식)이면 접속 정보가 아예 만들어지지 않는다(우회 버튼 없음). 알림 인프라(푸시·크론) 문제는 노랑 + 내 할 일이지
의뢰인 흐름을 막지 않는다. `notices`는 큐가 아니라 **멱등 장부**다 — 푸시 행은 「보냈다/배달됐다(서비스워커 ack)」를,
보낼 카톡 행은 「작성됐다/보냈음(관리자 클릭)」을 남긴다. 실패한 행은 재시도하지 않고, 다음 tick이 상태에서 다시
계산한다. 새 테이블은 `notices` 하나, 새 크론 1개, **새 외부 채널 0개, 새 npm 의존성 0개**, 외부 heartbeat 1개(env
1개)가 상한이다.

---

## 2. 오늘의 사고 5건 → 새 설계의 방어 장치 대응표

| # | 사고 | 1차 장치(예방) | 2차 장치(감지) | 3차 장치(의뢰인 보호) |
|---|---|---|---|---|
| 1 | 검증 토큰 3개가 Production에 없었다 → 의뢰인이 빨간 「확인 오류」를 봤다 | **사전 점검 게이트**: 토큰 3개가 `ok`가 아니면 「접속 정보 발송」「비밀번호 발급」「매직링크 생성」 버튼 비활성. 우회 버튼 없음(빨강 목록은 M3에 고정) | tick이 매시간(마지막 점검 기록 기준) `checkVerifyTokens()`를 돌려 초록→빨강 전환 시 1회 푸시 + 「지금 할 일: 검증 설정 고치기 — {ENV}」 | `owner='admin'` 오류는 의뢰인 화면에 「제작자 확인 중」(이미 있음). 되돌림·리마인드 대상에서 제외 |
| 2 | 허브 이메일(한메일) ≠ 계정 이메일(gmail) → 초대 4건 헛돌음 | 사전 점검 `mismatch`(Vercel 계정 이메일 대조, 이미 있음)가 접속 정보 발급을 차단. 안내문·재요청 문구에 넣는 이메일 = `admins.email` = 초대할 이메일 | GitHub·Supabase 계정 이메일 대조는 **확인 필요** → 확인 불가는 **노랑**으로 표시 | 재요청 문구·포털 카드에는 매번 정확한 초대 이메일을 [복사] 버튼으로 다시 넣는다 |
| 3 | 5단계 완료·질문 3건을 3시간 몰랐다 | 웹 푸시(이미 있음) + `notices`로 「보냈는가」와 「배달됐는가(`acked_at`)」를 따로 남긴다 | **tick 안전망**: urgent 항목 발생 30분 내 `acked_at`이 없으면 다이제스트 푸시, 4시간 내에도 없으면 **다른 채널**(외부 heartbeat 사망 알림은 Phase 1a부터, 관리자 본인용 2차 채널은 D17). 09:00 KST 요약 | 의뢰인에게는 「제작자가 확인 중」. 48h 무응답 질문은 관리자에게 「의뢰인 질문 2일째 미답」 |
| 4 | 검증이 클릭에만 의존, Vercel uid/id 버그를 실행해 본 적 없었다 | **카나리 검증**(should): 사전 점검이 실제 `verify*()`를 내 소유 조직에 호출 | tick이 `next_check_at` 지난 `client_done` 단계를 백오프로 재확인(자동 재확인 횟수는 `auto_checks`에 따로 센다 — 막힘 판정에 쓰지 않는다) | `owner='system'`(429·5xx·timeout)은 3회까지 조용히 재시도 |
| 5 | Claude 단계에 초대 없이 「완료」를 눌러도 몰랐다 | 자기확인 체크리스트(이미 있음) + **관리자 확인 대기(admin ack)** | 「지금 할 일: Anthropic 초대 왔는지 확인 [왔음][안 왔음]」 + 24h 미응답 시 나에게만 재알림 | 「안 왔음」→ `returned` + 재요청. 같은 단계 **의뢰인 재시도** 3회면 화면공유 제안(자동 재확인 횟수는 세지 않는다) |

---

## 3. 관리자가 손으로 하는 일: 지금 vs 재설계 후

| # | 일 | 지금 | 재설계 후 |
|---|---|---|---|
| 1 | 검증 토큰 3개 등록·갱신 | 손. 잊었고 아무도 몰랐다 | 여전히 손(1회·만료 시). tick이 매시간 점검, 빨강이면 푸시 + **발송 차단**. 만료 D-30/7/1 예고 — GitHub는 응답 헤더, Vercel은 `GET /v5/user/tokens/current`(확인), Supabase만 env |
| 2 | 허브 관리자 이메일 = 계정 이메일 맞추기 | 사고 난 뒤 손으로 | 사전 점검 `mismatch`면 발송 버튼 비활성. 1회로 끝 |
| 3 | 프로젝트 생성 → 선택 단계 추가 → 게스트 등록 → 비밀번호 발급 | 화면 3개, 버튼 4개 | 생성 위저드 1개(스택 체크박스 → 단계 미리보기 → 사전 점검 → 접속 정보) |
| 4 | 접속 안내문 작성·카톡 전송 | 손 | 발급 화면이 안내문(주소+이메일+임시 비밀번호)을 만들고, 나는 [카톡으로 보내기](폰: 공유 창 / PC: 복사) 한 번 — 성공한 순간 `access_sent_at` 기록. 비밀번호는 발급 화면에만 있고 장부(`notices.body`)에는 마스킹. 안 보내면 「접속 안내 아직 안 보냄」 칩. 메일 병행 없음(3판) |
| 5 | 「지금 확인」 클릭 | 손 | 없음. 의뢰인 클릭 즉시(있음) + tick 백오프 재확인 |
| 6 | 초대 수락(GitHub·Vercel·Supabase·Anthropic) | 손 | 손(불가피). 푸시에 수락 화면 딥링크(GitHub는 `github.com/orgs/{org}/invitation`). 초대 만료 D-2(5일째) 재알림. API 자동 수락은 하지 않는다(D5=B 확정) |
| 7 | 재초대 부탁 문구 작성·카톡 | 손 (오늘 4건) | 문구는 시스템이 원인 코드별로 쓴다 — 포털 카드 즉시 + 「보낼 카톡」에 완성 문구(GitHub는 owner=client 확정 즉시, Vercel·Supabase는 내가 「초대 안 왔음」을 누른 뒤). 나는 붙여넣기만 |
| 8 | 미진행 리마인드 | 없음(기억에 의존) | 3일·7일에 리마인드 문구가 「보낼 카톡」에 올라온다(단계당 2회 상한, 정지 조건 7개(§4-4), 「보류」 스위치). 보낼지는 내가 정한다 — [보내지 않음]도 기록. 결제 필요 단계는 문구 대신 칩 |
| 9 | 질문 답글 | 손 | 손. 24h 미답이면 재푸시. 답글을 저장하면 「포털에 답글을 남겼습니다 + 본문 전문」 카톡 문구가 「보낼 카톡」에 즉시 생긴다. 의뢰인이 카톡으로 답하면 **내가 포털에 옮겨 적는다**(수동 항목 #18) |
| 10 | 범위 작성·확정 | 손 | 손. 칩은 이미 있음 |
| 11 | 단계 verified/skipped 전환 | 손 | API 단계는 자동(있음). 수동 단계는 할 일 칩에서 원클릭 |
| 12 | Anthropic 등 수동 단계 실제 확인 | 몰랐음 | 자기확인 체크(있음) + 「초대 왔음/안 왔음」 2탭 |
| 13 | `onboarding → building → delivered` 전환 | 손 | 조건 충족 시 자동(D6) + 푸시 |
| 14 | 개발 착수 셋팅 | 손 | 손(later). 딥링크 3개 + 링크 등록만 반자동 |
| 15 | 종료 체크리스트 6개 | 전부 손 | 5번(접근 회수) 원클릭, Vercel 팀 탈퇴 API. 나머지 손(딥링크) |
| 16 | 하루 상황 파악 | 대시보드를 열어야 | 09:00 요약 푸시(있을 때만) + 상태 카드 1행(신호등+기준 시각) |
| 17 | 크론·알림이 살아 있는지 확인 | 해당 없음 | `last_tick_finished_at` 3시간 초과 시 빨간 배너, started만 갱신되면 「완주 못 함」 빨강. 외부 heartbeat가 대시보드 밖에서 **나에게** 메일로 알린다(의뢰인 채널이 아니다). 푸시는 ack 기준 자기진단 |
| 18 | 카톡 답장 옮겨 적기 (신설·수동) | — | 의뢰인이 카톡으로 답하면 관리자가 포털 코멘트로 옮겨 적는다. 자동화하지 않는다(N1·N4) |
| 19 | 리마인드 보류 (신설·수동 원클릭) | — | 카톡·전화로 일정을 들으면 칩 「3일/7일/날짜까지 보류」 |
| 20 | 「보낼 카톡」 처리 (신설·수동, 건당 10초) | — | `/a` 최상단 「보낼 카톡 N건」 카드에서 [카톡으로 보내기](공유/복사 = 보냈음) 또는 [보내지 않음], 실수는 [되돌리기]. 4시간 넘게 남아 있으면 09~21시에 하루 1회 푸시. 근거 조건이 사라진 문구는 tick 이 kind 별 술어로 거둔다 |

---

## 4. 생애주기 상태기계

`projects.status`는 기존 4값을 **그대로 둔다**. ①~④는 `onboarding` 안에서 파생한다
(새 컬럼은 `projects.access_sent_at`, `projects.remind_paused_until` 둘).

```
[전화 확정]
   │ 관리자: /a/new 위저드 (이름·이메일·등급·스택 체크)
   ▼
① drafted ──사전 점검 빨강 0개──▶ ② ready
   │ (빨강이면 접속 정보 버튼 비활성. 우회 없음)
   ▼                                  │ 「보낼 카톡」 카드(credentials) → [복사] → 카톡 → [보냈음] = access_sent_at
③ invited ◀───────────────────────────┘
   │ 의뢰인 첫 로그인 (project_guests.last_seen_at)
   ▼
④ connecting  (단계별 하위 상태기계)
   │ 의뢰인 단계 전부 verified|skipped  AND  scope_agreed_at
   ▼
⑤ building → ⑥ delivered → ⑦ closed   (변경 없음)
```

파생 규칙: ①/② = `access_sent_at is null` + 사전 점검 결과(실시간) · ③ = `access_sent_at not null` and 모든
guest `last_seen_at is null` · ④ = guest 중 하나라도 `last_seen_at not null`. (`todo.ts`의 `notSeen`은 `created_at`
기준이라 오탐 — `access_sent_at` 기준으로 바꾼다.) **③에서 48h 미로그인은 자동 문구를 만들지 않는다** — 카톡을 못 본
것과 안 본 것을 구분할 수 없고, 같은 말을 두 번 보내게 할 뿐이다. 관리자 칩 「카톡으로 접속 여부 확인」으로만.

### 4-1. 단계 상태기계 확장 (§5)

```
현재:  todo → doing → client_done → verified
       any → blocked (blocked_reason 필수)
       any → skipped (나만)

추가:  todo → doing                    (의뢰인: 「만들었습니다 — 다음으로」 또는 slug 저장 시 서버가 올린다)
       client_done → returned          (시스템만: owner='client' 원인 확정 시. Vercel·Supabase는 관리자 「안 왔음」 후에만)
       returned    → doing | client_done | blocked   (의뢰인)
       returned    → verified | skipped | todo       (나)
       client_done → client_done       (재확인은 상태 불변, verify_result만 갱신)
금지:  verified | skipped → 무엇이든  (의뢰인 세션. 가드 트리거 + RLS USING 이중 강제 — 현행 코드에 구멍이 있다)
```

`returned`가 필요한 이유(코드 근거): "완료를 눌렀지만 초대가 없다"는 지금 `client_done + check_invite`로만 남고
`nextClientStep()`의 `CLIENT_OPEN`(todo/doing/blocked)에 들어가지 않아 **포털 「다음 할 일」에서 사라진다**. 상태
하나로 두어야 포털·리마인드·진행률·RLS가 한 값을 읽는다. `returned`는 service_role만 쓴다.

**의뢰인 화면에서의 `returned`(개정)**: 라벨은 「한 가지만 더」(관리자 화면은 「되돌림」). 진행률은 **client_done과
같은 0.5를 유지**하고 배지 색만 바꾼다 — 한 일은 인정하고 남은 한 가지만 가리킨다. 작업기록 문장은 「「{단계}」에서
확인할 것이 하나 생겼습니다」. 「되돌려짐·실패」 어휘 금지. 포털 홈 「다음 할 일」 카드에 최우선으로 올리되 제목 아래
원인 한 문장 + [이메일 복사] / [초대 화면 열기]를 바로 붙인다.

`todo → doing`을 실제로 기록하는 이유: 지금 `doing`은 blocked에서 「다시 진행하기」를 눌렀을 때만 생기고
(`sticky-actions.tsx`), `connect-flow.tsx`의 create→slug→invite 전환은 클라이언트 `useState`뿐이다. 그래서 「doing
48시간」 신호는 조용히 붙잡고 있는 의뢰인을 절대 잡지 못한다. 「만들었습니다」·slug 저장 시 서버 액션이 `doing`으로
올리면(의뢰인 허용 전이 안) 「slug 저장 후 48시간 완료 요청 없음」이 진짜 신호가 된다 — 자동 문구가 아니라 관리자 칩
「{단계} 이틀째 초대 전 — 카톡으로 한 줄」로만 노출한다.

### 4-2. 생애주기 표

| 국면 | 트리거 | 자동 행동 | 남는 사람 일(「지금 할 일」 문구) | 실패 대응 |
|---|---|---|---|---|
| ① 접수(drafted) | `/a/new` 위저드 제출 | STEP_TEMPLATE + 체크한 스택 복사(AI 미체크면 connect-anthropic은 skipped) · project_guests 등록 · 사전 점검 P1~P11 실행 | 3분 입력 · 「범위 미작성」 · 빨강일 때만 「검증 설정 고치기 — {ENV}: {원인}」 | 빨강은 생성을 막지 않고 접속 정보만 막는다. 점검 결과는 저장하지 않는다 |
| ②→③ 초대(invited) | 빨강 0개에서 「접속 정보 만들기」 클릭 | **액션 안에서 동기 실행**: 점검 재실행(60초 캐시) → `issueGuestPassword` → 안내문(주소+이메일+임시 비밀번호+보조 링크) 생성 → 발급 화면에 「보낼 카톡」 카드(credentials, 전문) → [복사] → 카톡 → [보냈음] 시 `access_sent_at`. 비밀번호는 응답에만 있고 `notices.body`에는 넣지 않는다 | 카톡 붙여넣기 1회(이것이 첫 접촉이다) | 「보냈음」을 누르지 않은 채 4시간이면 푸시 1회, 이후 09:00 요약에만. 비밀번호는 응답에만 존재하므로 재발급은 관리자가 버튼을 다시 누른다(이전 비밀번호 무효 = §6 규칙과 일치) |
| ④ 연결 중(connecting) | 의뢰인: 「만들었습니다」·slug 저장·「완료했습니다」·「막혔어요」·「화면공유로 도움받기」 | 「만들었습니다」/slug 저장 → `doing` + GitHub 선검사(`GET /orgs/{slug}`·`GET /users/{slug}`로 org_not_found/personal_account를 초대 전에) · 완료 요청 즉시 검증(있음) → code·owner 판정 → verified면 다음 단계 안내 문구(보낼 카톡) / owner=client면 포털 카드 + returned + 재요청 문구(보낼 카톡) / owner=admin이면 푸시 / owner=system이면 조용히 백오프 · need_help/blocked → 즉시 푸시, 30분·4시간 재알림 | 「질문·요청 N건」 · 「화면공유 요청 — {의뢰인}, {단계}」 · 「막힘 — {단계}」 · 「{단계} 의뢰인 3회 재시도 — 화면공유 제안됨」 · 「{단계} 이틀째 초대 전 — 카톡 한 줄」 | 의뢰인 화면에는 `code → ko.ts` 매핑 문장만. `detail`은 절대 렌더하지 않는다. admin/system은 「제작자 확인 중」/「잠시 후 자동 재확인」 |
| ④-b 확인(verifying) | tick(15분): `client_done`이고 `next_check_at` 지난 단계 · 토큰 점검(마지막 점검 55분 경과 시) | GitHub `check_invite`(404 = 진짜 초대 없음): 포털 카드 즉시 · 2h 지속 → **강제 재확인 1회 후 그대로면 returned + 재요청 문구 #1 을 한 사건으로**(그 사이 pending_accept로 바뀌면 취소 — 카톡과 포털이 같은 말을 한다) · **Vercel·Supabase `await_admin_first`**: 나에게 「{서비스} 초대 메일 왔는지 확인 [왔음→수락함][안 왔음]」, 24h 재알림, 초대 만료 D-2 재알림. 「안 왔음」을 눌러야 owner=client로 넘어가 재요청·returned 진행 · error(admin) 회복 감지 → 밀린 단계 재확인 + 푸시 「복구됨」 · verified → `advanceProjectStatus()` | 「Supabase 초대 메일 확인 [왔음][안 왔음]」 · 「Anthropic 초대 왔는지 확인 [왔음][안 왔음]」 · 「검증 설정 고치기 — {ENV}」 | tick 한 번 최대 10단계, 재검증 합계 30초 예산, fetch마다 `AbortSignal.timeout(8000)`. system 3회 연속이면 admin 승격. 결과 저장은 CAS(§4-3) |
| ⑤ 개발(building) | 자동 전이 또는 수동 | 「연결이 모두 확인됐습니다」 문구 · 고정 링크 등록 시 링크 안내 문구 · 관리자 답글 즉시 **본문 전문** 문구 — 전부 「보낼 카톡」 카드 | 개발 · 「배포 링크 미등록」(7일) · 「범위 확정 후 요청 N건」 · 「카톡 답장 옮겨 적기」(수동) | 전이 조건 부분 충족이면 「개발 시작을 막는 항목 1건」으로 이유 표시 |
| ⑥ 인도(delivered) | handover 「확인 완료」 | status='delivered' · 완료 안내 문구(최종 주소·문서·고정비) → 「보낼 카톡」 · 종료 탭 활성화 | README·운영 방법·고정비 | 30일 경과 시 「종료 미완료 30일」 |
| ⑦ 종료(closed) | 종료 탭 순서 진행 | 항목 3 중 Vercel 탈퇴 [자동] · 항목 5 접근 회수 [자동] · 항목 6 완료 안내 문구 [자동 작성 → 내가 보냄] | 항목 1·2(프로젝트 전용 키만)·3 나머지·4 | 자동 실행 실패는 그 항목만 미체크 + HTTP 코드. 접근 회수 실패는 close를 막지 않되 빨강 |
| 상시 — 관리자 루프 | tick + 의뢰인 행동 즉시 | urgent 30분(푸시)·4시간(다른 채널) 재알림 · 09:00 KST 요약 · 토큰 전환 알림 · 발송 이력 「현재 상황」 | 알림에 반응한다 | 푸시 구독 0개·7일 무ack면 **노랑 + urgent 칩**(발급은 막지 않는다) |

### 4-3. verify_result 확장 — 「누가 움직이나」를 데이터에 넣는다

jsonb 컬럼은 여전히 `steps.verify_result` 하나뿐이다. 필드만 늘린다.

```ts
type VerifyResult = {
  status: 'verified' | 'not_found' | 'error';  // 3상태 유지 (§8, §11-11)
  code: VerifyCode;
  owner: 'client' | 'admin' | 'system';
  checked_at: string;          // CAS 기준값이기도 하다
  detail?: string;             // 관리자 화면·로그 전용. side='client' 렌더 금지
  client_attempts: number;     // 의뢰인이 「완료했습니다」를 누른 횟수 (trigger='client') — 막힘 판정의 유일한 분모
  auto_checks: number;         // tick·화면 열림 재확인 횟수 (trigger='auto') — 통계용, 판정에 쓰지 않는다
  next_check_at?: string;      // 5m→30m→2h→6h→24h
  first_failed_at?: string;    // dedupe 키의 에폭
  admin_first_ack?: 'came' | 'not_came';  // Vercel·Supabase: 관리자 2탭 결과
  team_id?: string;            // Vercel: 오프보딩 재사용
};
```

| status | code | owner | 판정 근거 | 의뢰인 화면(`ko.stepDetail.verifyCode[code]`) | 시스템 행동 |
|---|---|---|---|---|---|
| verified | `member_active` | – | GitHub `state==='active'` / Vercel `confirmed!==false` + `role` 허용 집합 / Supabase `role_name` 허용 집합 | 연결이 확인됐습니다 | status=verified, 다음 단계 안내 문구(보낼 카톡) |
| not_found | `no_slug` | client | slug null | 조직 주소를 먼저 붙여넣어 주시면 바로 확인해 드려요 | 즉시 returned(포털 안에서 고친다) |
| not_found | `org_not_found` | client | GitHub `GET /orgs/{slug}` 404 (Vercel·Supabase는 멤버 전 조회 불가 → 이 코드 없음) | 붙여넣은 주소로는 조직이 찾아지지 않아요 — 조직 화면 주소창의 주소를 한 번 더 붙여넣어 주세요 | 즉시 returned |
| not_found | `personal_account` | client | GitHub `GET /users/{slug}`.type==='User' | 붙여넣은 주소가 개인 계정 주소예요(github.com/이름). 조직 화면의 주소를 다시 붙여넣어 주세요. 조직을 아직 안 만드셨다면 ①로 돌아가시면 됩니다 | 즉시 returned |
| not_found | `check_invite` | **client (GitHub만)** | GitHub `GET /user/memberships/orgs/{org}` 404인데 `GET /orgs/{org}`는 200 = 초대 없음 | 초대를 보내신 뒤라면 반영에 잠시 걸릴 수 있어요. 초대 화면에서 이 이메일이 보이는지만 한 번 확인해 주세요 [이메일 복사] | 카드 즉시 · 2h → 강제 재확인 후 returned + 재요청 문구 #1(pending_accept로 바뀌면 취소) |
| not_found | `await_admin_first` | **admin (Vercel·Supabase)** | Vercel `/v2/teams`에 팀 없음 / Supabase 403·404 — 초대 전인지 내 수락 전인지 API로 구분 불가 | 초대를 보내셨다면 제가 수락하는 중입니다. 확인되는 대로 소식을 드릴게요 | 내 할 일 「{서비스} 초대 메일 확인 [왔음][안 왔음]」 · 24h 재알림 · 초대 만료 D-2 재알림. 「안 왔음」→ owner=client, `check_invite`로 전환해 위 행의 절차 |
| not_found | `wrong_role` | client | GitHub `membership.role!=='admin'` / Vercel `role ∉ {OWNER, MEMBER}` / Supabase `role_name ∉ 허용 집합` | 초대는 잘 됐어요. 역할 하나만 {Owner/Member/Administrator}로 바꿔 주시면 끝이에요 [역할 화면 열기] | 재요청 문구 즉시 작성(보낼 카톡) — 보내는 사람이 관리자라 승인 단계가 곧 발송이다(D7 종결). 허용 role 집합(확인 필요 10-10) 전까지 문구 끝에 「제가 역할을 한 번 더 확인하겠습니다」 |
| not_found | `pending_accept` | admin | GitHub `state==='pending'` / Vercel `confirmed===false` | 제작자가 초대를 수락하는 중입니다 | 내 할 일 + 24h 재알림 + 만료 D-2 재알림. 자동 수락 없음(D5=B) |
| not_found | `await_admin_ack` | admin | admin-ack 단계(Anthropic 등) 완료 요청 | 초대는 제작자 메일함으로 갑니다. 도착하면 제가 수락하고 소식을 드릴게요 | 내 폰 알림, 24h 재알림 |
| error | `token_missing` / `token_invalid` / `token_scope` / `email_mismatch` / `admin_email_missing` / `field_missing` | admin | 사전 점검과 동일 판정. `field_missing` = Supabase 멤버 응답에 `email`이 없어 대조 불가(email은 OpenAPI에서 선택 필드 — 확인) | 제작자 확인 중 | 푸시(전이당 1회) + 할 일, 해당 제공자 재검증 일시 중지 |
| error | `rate_limited` / `upstream` / `network` | system | 429·5xx·timeout·ECONN* | 잠시 후 자동으로 다시 확인합니다 | 조용히 백오프 3회, 연속 3회면 admin 승격 1회 푸시 |

규칙:
- `makeResult(code, detail?)` + `CODE_TABLE: Record<VerifyCode, {status, owner}>`. code가 status를 결정하므로 "error를 not_found로 뭉뚱그리는" 실수가 타입에서 막힌다.
- **`detail`은 관리자 화면과 로그 전용이다.** `connect-flow.tsx`의 `{lastResult.detail}` 렌더(현행 231~234행)를 삭제하고 `side='client'`에서는 `code → ko.ts` 매핑만 쓴다. 현행 detail 문자열("내가 속한 팀 목록에 없습니다")은 관리자 1인칭이라 의뢰인에게 보이면 안 된다.
- Supabase 403은 `/v1/organizations`로 토큰 생존을 확인한 뒤 분류한다(401/403 = token_invalid, 200이면 await_admin_first).
- **동시 실행 방어**: 결과 저장은 CAS — `update steps set verify_result=… where id=? and coalesce(verify_result->>'checked_at','') = :이전값`. 0행이면 다른 실행이 이긴 것이므로 알림·전이를 하지 않는다. tick·`reverifyStale`(대시보드/포털 렌더)·`/api/verify`(의뢰인 클릭)가 같은 단계를 동시에 돌 수 있고 Vercel은 같은 스케줄을 두 번 부를 수 있다(인용·직접 재확인 못 함).
- `/api/verify`에 서버 쿨다운(단계당 60초, `checked_at` 기준). 의뢰인 트리거 푸시는 「client_done 전이 후 첫 1회」만.
- tick 진입 시 `pg_try_advisory_xact_lock(hashtext('tick'))`로 단일 실행 보장. 못 잡으면 즉시 200 `{skipped:'locked'}`.

### 4-4. 리마인드·되돌림 판정표 (tick이 판정하고 문구를 「보낼 카톡」에 올린다 — 작성은 평일 10~18시 KST에만)

허브는 보내지 않는다. 아래 「1차·2차」는 **문구가 카드로 만들어지는 시점**이고, 보내는 것은 관리자의 [보냈음]이다.

| 조건 | 1차(문구 작성) | 2차 | 사람에게(칩·푸시) |
|---|---|---|---|
| 접속 안내 「보냈음」 후 미로그인 | (자동 문구 없음) | – | 3일: 「카톡으로 접속 여부 확인」 · 5일: 「전화」 |
| 의뢰인 다음 단계가 3일째 그대로 (결제 필요 단계 제외) | 3일: 「막힌 곳 있으신지」 + 딥링크 | 7일: 화면공유 제안 | 7일: 「{단계} 7일째 정체 — 전화 제안」 |
| ↳ 「그대로」의 기준 시각 `stallSince` = max(접속 안내 보낸 시각, 직전 의뢰인 단계 확인 시각, 이 단계가 마지막으로 움직인 시각(doing: `updated_at` · returned: 원인 사이클 시작 `first_failed_at`), 마지막 의뢰인 코멘트, 보류 해제 시각). 대상은 **onboarding 프로젝트의 첫 제작자 단계 앞 의뢰인 단계**만(개발 뒤의 「도메인 연결」은 재촉하지 않는다). dedupe 에폭 = `stallSince` 분 — 진전이 생기면 새 사이클 | | | |
| 결제 필요 단계(connect-vercel·connect-anthropic) 3일째 | (자동 문구 없음) | – | 3일: 「결제 부담 여부 통화」 |
| `returned` 후 미조치 | 즉시: 원인별 재요청 | 3일·7일: 위 정체 리마인드가 같은 규칙으로 잇는다(같은 단계에는 재요청·리마인드 통틀어 카드 1장) | 완료 2회 실패: 포털 화면공유 버튼 1순위 · 의뢰인 재시도 3회: 칩 「assisted 전환 검토」 |
| `returned` → `client_done` 역전이 | 원인이 내 쪽으로 넘어오면(초대가 보이기 시작함·내 메일함 차례) 시스템이 「한 가지만 더」를 거둔다. 일시 오류로는 오가지 않는다 | | |
| `blocked` / `need_help` | (의뢰인 문구 없음 — 내가 직접 답한다) | – | 즉시 → 30분(푸시) → 4시간(D17) , 답글·상태 변경 시 중단 |
| `pending_accept` / `await_admin_first` / `await_admin_ack` | – | – | 즉시 → 24h → 초대 만료 D-2(GitHub·Vercel 7일 — 인용·직접 재확인 못 함) |
| slug 저장 후 48h 완료 요청 없음 | – | – | 「{단계} 이틀째 초대 전 — 카톡 한 줄」 |
| `support_tier='assisted'` | 리마인드 없음. 포털 홈 최상단 「화면공유 20분으로 한 번에 끝내기」 카드(편한 시간 입력 → 요청 코멘트 → 관리자 푸시) | – | 첫 접속 24h 내 시간이 안 남겨지면 「전화로 일정 잡기」 |
| 「보낼 카톡」 pending 4시간 초과 | – | – | 푸시 1회 「보낼 카톡 N건」 + P6 노랑, 09:00 요약에 건수 |

**정지 조건(전부 코드로 강제, 하나라도 참이면 그 프로젝트의 리마인드 문구 작성 전체 정지)** — 보내는 사람이 나라서
오탐의 비용은 줄었지만, 헛 문구가 쌓이면 카드 자체가 무시되므로 조건은 그대로 둔다:
(a) `projects.status='closed'` · (b) `support_tier='assisted'` · (c) `blocked` 단계 존재 · (d) owner=admin 오류(`token_*`·`email_mismatch`) 존재 ·
(e) **같은 프로젝트에 owner=admin인 `client_done` 단계(pending_accept·await_admin_first·await_admin_ack)가 하나라도 있다** — "앞 것이 확인되면 다음을 하자"고 기다리는 의뢰인을 재촉하지 않는다 ·
(f) **최근 7일 내 의뢰인 코멘트 또는 관리자 미답 질문**이 있다(기간 없는 「코멘트 존재」는 첫날 질문 하나로 영원히 정지되고 조용한 의뢰인만 재촉받는다) ·
(g) `projects.remind_paused_until > now()` — 관리자 칩 「3일/7일/날짜까지 보류」(카톡·전화로 일정을 들었을 때 누른다) ·
(h) `projects.status <> 'onboarding'` — 개발이 시작된 뒤의 의뢰인 단계(「도메인 연결」)는 재촉 대상이 아니다. 대상 단계도 첫 제작자 단계 앞으로 한정한다(`onboardingClientSteps`).

**상한(종류별로 다르다)**: `reminder` 계열(정체·미접속·화면공유 제안)만 「프로젝트당 하루 1건·주말 보류·단계당 2건」. `credentials`·`rerequest` #1·`next_step`(연결 확인)·`admin_replied`는 **즉시 작성**, 「같은 단계·같은 code에 하루 1건」(dedupe_key)로만 제한. **묶음 문구는 만들지 않는다** — 상한을 넘는 리마인드는 `skipped(cap)`로 기록하고 포털 카드로만 보인다. 공휴일은 최소 토·일 제외로 시작(확인 필요 9).

**거둠(신설, kind 별 술어)**: tick 이 pending 행마다 「아직 필요한가」를 계산해 거짓이면 `skipped(condition_cleared)`로 바꾸고 카드에서 내린다. 프로젝트 `closed` 는 전 종류 거둠. `next_step` — 카드 생성 이후 의뢰인이 포털에 접속했거나(`last_seen_at > created_at`) 다음 의뢰인 단계가 `todo` 를 벗어났으면 필요 없다(포털이 본체). `rerequest` — 그 단계가 `client_done` 이 아니거나 `verify_result.code` 가 카드의 원인 코드와 다르면 필요 없다(의뢰인이 로그인만 한 것은 거두지 않는다 — 행동이 필요한 문구다). `admin_replied` — 그 답글의 `read_at` 이 찍히면 필요 없다. `reminder`(Phase 2) — 정지 조건 a~h 중 하나라도 참이거나 대상 단계가 열려 있지 않거나 카드 생성 뒤 단계가 움직였으면(returned 는 원인 사이클 기준) 필요 없다. 관리자가 철 지난 문구를 보내는 일을 코드로 막는다.
**대체(신설)**: 같은 `(project_id, step_id, kind)`의 pending 행이 있는데 새 문구가 계산되면 이전 행을 먼저 `superseded`로 바꾸고 새 행을 넣는다. `rerequest`·`reminder`는 종류를 묶어 한 단계에 카드 1장만 둔다(둘 다 「이 단계를 이어서 해 주세요」라 두 장이면 같은 말이 두 번 간다). 카드에는 항상 주제당 최신 1건.

문구 원칙(CX): 주어는 "우리 작업", 원인은 화면·기본값 탓, 한 일은 먼저 인정, 바꿀 것은 하나, 끝은 항상 「화면공유 20분」
또는 「이 카톡으로 답 주셔도 됩니다」(답장 채널이 관리자 카톡 자체라 별도 답장 정책이 필요 없다).
금지어: 아직·안 하셨·빨리·지연·미완료·독촉·확인 바랍니다·되돌려짐·실패. 형식: 카톡 1건 ≤ 8줄·300자, 첫 줄
「{의뢰인 이름}님, 」, 링크 ≤ 1개 — 카톡은 링크 미리보기를 서버에서 긁으므로 로그인 링크는 M14 프래그먼트 형태여야
한다. 의뢰인이 받는 첫 문구는 접속 안내(credentials), 두 번째는 「연결이 확인됐습니다」다. 48h 미로그인 자동 문구는
없다(관리자 칩만).

---

## 5. 자동화 기능 목록

효율 표기: 노력 S(반나절 이하)/M(1~2일)/L(3일 이상). 우선순위 must → should → later → no.

### MUST

**M1. 크론 tick 1개 — `/api/cron/tick`, `*/15 * * * *`**
- 트리거: Vercel Cron(프로덕션 배포에서만 — 확인, vercel.com/docs/cron-jobs/quickstart). 라우트는 인증만 하고 본체는 **순수 함수 `runTick(now: Date)`**(`src/lib/tick.ts`)라 로컬에서 `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/tick`으로 재현된다. `vercel crons run <path>`은 프로덕션에 배포된 잡만 실행한다(확인) — CLI가 CRON_SECRET 헤더를 붙이는지는 **확인 필요**
- 행동(각 작업 개별 try/catch, 시간 예산): ① `admins.last_tick_started_at` 갱신 → 락 획득 ② 토큰 점검 — `last_token_check_at < now()-55분`일 때만(시각 슬롯이 아니라 마지막 실행 기록으로 판정: 지연·누락·중복 호출 환경에서 슬롯은 조용히 건너뛰어진다) ③ `next_check_at` 지난 재검증(최대 10건, 합계 30초) ④ **stale claim 청소**(`claimed`이고 `claimed_at < now()-10분` → `failed`, detail=`stale_claim`) ⑤ urgent 안전망(ack 기준) ⑥ 리마인드·되돌림 판정(채널 있을 때) ⑦ 09:00 KST 요약 — `daily:{KST 날짜}` 키가 없고 KST 09:00 이후면 발송(슬롯 놓쳐도 그날 안에 나간다) ⑧ `notices` 정리(휘발성 kind만 90일) ⑨ 프로젝트 상태 자동 전이 ⑩ 외부 heartbeat GET ⑪ `last_tick_finished_at` 갱신. `maxDuration = 60`, `dynamic = "force-dynamic"`
- 인증: `Authorization: Bearer ${CRON_SECRET}`. `timingSafeEqual`은 길이 불일치 시 throw하므로 **길이 비교를 먼저** 한다. 미설정·불일치 401(fail-closed)
- 실패 대응: Vercel은 실패한 크론을 재시도하지 않는다(인용·직접 재확인 못 함) → tick은 "밀린 일을 매번 다시 계산"하는 멱등 설계. 도중 사망은 started≠finished로 드러난다(배너 「tick이 완주하지 못함」 빨강). 모든 외부 fetch에 `AbortSignal.timeout(8000)` — 현재 `verify/*.ts`에는 타임아웃이 없다(`health.ts`만 6초)
- 권한·API: `CRON_SECRET`, Vercel Pro. 근거(확인): vercel.com/docs/cron-jobs/manage-cron-jobs(vercel.json `crons`, CRON_SECRET 핸들러, 같은 path 복수 schedule), vercel.com/docs/cli/crons
- 노력 M(하위 작업 5개+) · 위험: Hobby로 내려가면 하루 1회. UTC 고정 → KST 판정은 코드에서
- 주기 근거: 15분. "3시간 몰랐다"가 사고의 본질이라 안전망 최대 지연 45분을 택한다. 월 2,880회는 비용상 무의미

**M2. `notices` 테이블 — 푸시 장부 + 「보낼 카톡」 (큐 아님 · 재계산 모델)**
- 행은 두 종류다. `channel='push'`: 내 폰으로 실제 보낸 기록. `channel='outbox'`: 의뢰인에게 보낼 **완성 문구**(`body`)를 관리자가 처리할 때까지 두는 행. 같은 테이블·같은 dedupe 규칙. 이메일·SMS 채널 값은 없다(3판)
- push: `insert … (status='claimed', claimed_at=now()) on conflict (dedupe_key) do nothing returning id` — 반환 행이 있을 때만 실제 발송. 성공 시 `sent`(+`sent_at`), 실패 시 `failed`. **기본값이 `sent`인 설계는 폐기한다** — claim 직후 타임아웃·크래시·`after()` 유실이 「보냈다」로 남아 영구 침묵이 된다. `claimed`가 10분 넘게 남으면 tick이 `failed(stale_claim)`로 바꾸고 카드 빨강. 서비스워커 ack가 `acked_at`
- outbox: `insert … (status='pending', title, body) on conflict (dedupe_key) do nothing` — 생성 즉시 내 폰에 푸시 「보낼 카톡 1건 · {의뢰인}: {사유}」(푸시 행은 별도 dedupe_key). 관리자 [보냈음] → `sent`+`sent_at`(사람이 누른 시각) · [보내지 않음] → `skipped(admin)` · 조건 소멸 → tick이 `skipped(condition_cleared)` · 같은 주제의 새 문구 → 이전 행 `superseded`(§4-4)
- **재시도 모델은 하나 — 「재계산」**: 실패·거둔 행은 장부이지 재시도 대상이 아니다. 다음 tick이 상태에서 "만들어야 할 것"을 다시 계산해 **새 dedupe_key**(에폭·회차 포함)로 다시 만든다. `next_attempt_at`·`attempts`·재시도 인덱스는 두지 않는다
- dedupe_key 규칙 — **시간 성분(에폭)을 반드시 넣는다**: 오류·전이 계열 `verify:{step_id}:{이전 code}->{새 code}:{first_failed_at ISO 분}` · 토큰 `token_red:{env}:{전환 시각 ISO 분}` · 재요청 `rerequest:{step_id}:{code}:{n}` · 리마인드 `reminder:{project_id}:{step_key}:{access_sent_at ISO 분}:{n}` · 다음 안내 `next_step:{step_id}:{verified_at ISO 분}` · 답글 `admin_replied:{comment_id}` · 접속 안내 `credentials:{project_id}:{issued_at ISO 분}` · 다이제스트 `todo_digest:{project_id}:{yyyy-mm-dd KST}` · 적체 `outbox_stale:{yyyy-mm-dd KST}`
- `body`(outbox만): 카톡 문구 전문. **비밀번호·매직링크 토큰·API 토큰은 절대 넣지 않는다** — credentials 행의 body는 비밀번호 자리를 「(발급 화면에 표시)」로 두고, 전문은 발급 응답에만 존재한다. CI grep 대상(§11-21)
- **일일 상한 인덱스와 `on conflict (dedupe_key) do nothing` 은 별개다**(심사 #35): 부분 유니크 인덱스 `(project_id, kind, day_kst)` 충돌은 23505 로 올라온다 — `pushAdmin`·`createOutbox` 는 23505 를 「오늘 몫은 이미 만들었다」(duplicate) 로 조용히 처리한다. 상한 초과를 `skipped(cap)` 행으로 남기고 싶으면 삽입 전에 오늘 건수를 세어 넣는다(Phase 2 reminder)
- 정리: `kind in ('digest','push_test','verify_event','token_event','preflight')`만 90일. `reminder`·`rerequest`·`credentials`·`next_step`·`admin_replied`·`escalation`은 프로젝트 `closed` 후 cascade로만 지운다(90일 정리가 상한 카운트를 리셋하는 것을 막는다). 「같은 사유로 하루 2건 금지」(§11-14)는 `(project_id, kind, day_kst)` 부분 유니크 인덱스로 별도 강제
- 웹 푸시는 `topic`(dedupe_key 해시 32자) + TTL. 근거(확인): github.com/web-push-libs/web-push README
- `detail`은 redact 경유. 토큰·비밀번호·매직링크·이메일 전체는 넣지 않는다
- 노력 S · RLS는 §9

**M3. 사전 점검(preflight) 게이트 — 빨강은 「의뢰인 초대를 직접 실패시키는 것」으로 한정한다**

| # | 항목 | 판정 | **빨강(차단)** | 노랑(경고, 진행 가능) |
|---|---|---|---|---|
| P1 | `GITHUB_TOKEN` | `/user` 200 + `x-oauth-scopes` read:org + classic 접두 + `GitHub-Authentication-Token-Expiration` 헤더 | missing/401·403/fine-grained/스코프 없음/만료 | 만료 30일 이내 |
| P2 | `MY_VERCEL_TOKEN` | `/v2/user` 200 + 계정 이메일 == `admins.email` + `GET /v5/user/tokens/current`의 `expiresAt`(확인) | missing/401·403/이메일 불일치/만료 | 만료 30일 이내 |
| P3 | `SUPABASE_ACCESS_TOKEN` | `/v1/organizations` 200 | missing/401 | 만료일 env 미등록 |
| P4 | 이메일 일치 | Vercel 대조(현행). GitHub·Supabase는 **확인 필요** → "확인 불가" 노랑 | Vercel 불일치 | GitHub/Supabase 확인 불가 |
| P5 | 푸시 배달 가능성 | VAPID 두 키 + `push_subscriptions ≥ 1` + 7일 내 **ack**(`last_ack_at`) | — | 키 없음/구독 0대/7일 무ack/테스트 4xx → 노랑 + urgent 칩 + 「테스트 알림」 버튼 |
| P6 | 「보낼 카톡」 적체 | `notices` pending 행 중 4시간 초과 건수 | — | 1건 이상 → 노랑 + urgent 칩 「보낼 카톡 N건」 |
| P7 | `ANTHROPIC_API_KEY` | 존재 여부 | — | 없음 → 도우미 비활성 |
| P8 | 의뢰인 이메일 | Zod + 정규화 + `resolveMx` + 오타 사전 | 형식 오류/관리자 이메일과 동일 | MX 없음/오타 의심/**다른 진행 중 프로젝트 게스트와 동일 → "같은 의뢰인의 두 번째 프로젝트인가요?"** (스키마 `unique(project_id,email)`가 다중 프로젝트를 허용하고 S6(a)도 정상으로 취급한다) |
| P9 | 크론 생존 | `CRON_SECRET` + `last_tick_finished_at` 2×주기 이내 | — | 없음/오래됨/started≠finished → 노랑 + 상태 카드 빨강 |
| P10 | 카나리(should) | S3 | — | 카나리 실패 |
| P11 | 로그인 링크 유효시간 | `GET /v1/projects/{ref}/config/auth`의 `mailer_otp_exp`(확인)가 `MAGIC_LINK_TTL_HOURS`×3600과 같은가 | — | 불일치 → 안내문 유효시간을 **실제 값**으로 바꿔 쓴다 + 「대시보드에서 86400으로」 링크 |

- 규칙: **빨강은 P1~P4와 P8의 형식 오류·관리자 이메일 동일뿐이다.** 빨강 1개면 「접속 정보 만들기」「비밀번호 발급」「매직링크 생성」 비활성 + 사유 + 고치는 링크. **우회 버튼 없음**. P5·P9(알림 인프라)는 의뢰인이 계정을 연결하는 데 필요한 조건이 아니다 — 구독은 브라우저 데이터 삭제·iOS 재설치·푸시 서비스 만료(`push.ts`가 404/410에 행 삭제)로 관리자 모르게 0이 된다. 빨강 목록은 CLAUDE.md v0.5 §8에 고정
- `error`(일시 네트워크)와 `invalid`를 구분해 `error`는 경고만
- 노력 M · 위험: 외부 호출 지연 → 6초 타임아웃·Suspense 분리

**M4. verify_result code/owner 세분화 + `returned` + 백오프 재검증 + 동시성 방어**
- §4-3 표와 규칙. `classify → persist(CAS) → transition → notify(전이 기반 dedupe) → advanceProjectStatus`
- Vercel: `GET /v3/teams/{teamId}/members` 멤버 객체에 `role`(enum OWNER·MEMBER·DEVELOPER·CONTRIBUTOR·BILLING·VIEWER·SECURITY·VIEWER_FOR_PLUS)·`uid`·`confirmed`가 required(심사관 확인 인용 — 직접 재확인 못 함). Supabase: `V1OrganizationMemberResponse` = `user_id`·`user_name`·`role_name`·`mfa_enabled`·`avatar_url` required, `email` 선택(확인, OpenAPI 원본) → email 없는 멤버는 `check_invite`가 아니라 `error(field_missing)`. 현행 코드는 email로만 대조해 email이 비면 영원히 check_invite다
- `calcProgress`: returned = 0.5. `nextClientStep` CLIENT_OPEN에 returned 추가. `todo.ts`에 returned·await_admin_first·await_admin_ack·경과 시간
- 노력 M+ · 위험: 코드가 늘면 의뢰인 문장도 는다(`ko.ts`)

**M5. 관리자 확인 대기(admin ack) — Anthropic·Resend·Solapi 단계 + Vercel·Supabase `await_admin_first`**
- 두 흐름은 같은 UI(칩 2탭)다. [왔음 → 수락했음] = 재검증 → verified / [안 왔음] = owner=client로 전환 → returned + 재요청 문구(보낼 카톡). 24h 미응답 시 나에게만 재알림, 초대 만료 D-2에 한 번 더
- 왜 API 검증이 아닌가(확인): Anthropic Admin API는 admin 역할만 쓸 수 있고 developer는 "Can use playground and manage API keys"뿐 — platform.claude.com/docs/en/manage-claude/admin-api. Resend 팀 멤버 API 없음(전문가 2인). Vercel 「내가 받은 초대 목록」 API는 문서에서 발견 못 함(**확인 필요**)
- 구현: 새 `verify_type` 대신 키 집합 `ADMIN_ACK_KEYS` + `verify_type in ('vercel','supabase')`로 파생. 마이그레이션 없음
- 노력 S

**M6. `redact()` 헬퍼 + 로그 규칙 강제** — 변경 없음(Bearer·ghp_·github_pat_·sbp_·sk-ant-·이메일 로컬파트·임시 비밀번호·`token_hash=` 치환, 300자 절단, CI grep). 노력 S

**M7. 가드 트리거 allow-list 전환 + verified/skipped 이탈 금지**
- 현행 `guard_step_update`와 RLS `steps_guest_update`는 `new.status`만 보고 `old.status`를 보지 않아 의뢰인 세션이 `verified → client_done`·`skipped → doing`을 통과시킨다(확인: `20260828010000_fix_guard_triggers_service_role.sql`, `20260827000000_init.sql` 283~292행). 새 설계에서 `client_done` 전이는 검증·푸시·상태 전이·카운트의 입력이므로 구멍을 막는다: 트리거에 `if old.status in ('verified','skipped') then raise exception` + RLS USING에 `and status not in ('verified','skipped')`. `returned → client_done`은 의도된 경로라 그대로
- projects는 slug 3컬럼 외 전부 예외. steps는 `status·blocked_reason·checked_at` 외 전부 예외
- 노력 S · 회귀 목록: 포털 doing/client_done/blocked/slug/코멘트/읽음 8개 + 「verified 단계를 doing으로 → 예외」

**M8. 푸시 배달 자기진단 — 「배달됨」을 따로 정의한다**
- `notices.status='sent'`는 푸시 서비스가 201을 준 시점이지 단말에 표시된 것이 아니다(OS 알림 끔·iOS PWA 삭제·방해금지). 서비스워커가 표시/클릭 시 `POST /api/push/ack {dedupe_key}` → `notices.acked_at` + `push_subscriptions.last_ack_at`. 「테스트 알림」은 ack까지 받아야 초록
- 노력 S

**M9. tick 안전망 + 상태 카드 + 배너**
- 안전망 조건은 「최근 1시간 `sent`가 없으면」이 아니라 **「urgent 항목 발생 30분 내 `acked_at`이 없으면」** 다이제스트 푸시, **4시간 내에도 없으면 다른 채널** — Phase 1a에서는 외부 heartbeat(L3 → must 승격: healthchecks.io 계열은 ping 누락 시 메일을 보낸다; 「tick 사망」만이라도 대시보드 밖에서 안다), 2차 채널은 D17. 배달되지 않은 인라인 푸시의 `sent`가 안전망을 억제하는 구조를 없앤다
- `/a` 최상단: 신호등 + 한 줄 사유 + 기준 시각 → 타일(토큰3·알림(ack 기준)·크론(finished 기준, stale_claim 건수)·발송·도우미·의뢰인 접근) → 지금 할 일 → 최근 자동 조치 10건
- 노력 M

**M10. 「보낼 카톡」 — 문구 작성기 `composeOutbox(kind, vars)` + `/a` 카드 (D1 종결: 허브는 보내지 않는다)**
- 트리거: `credentials`는 **액션 안에서 동기**(발급 화면에 전문 표시 + outbox 행). 나머지(`next_step`·`rerequest`·`reminder`·`admin_replied`·`scope_ready`·`link_pinned`·`closed`)는 `after()` 또는 tick이 outbox 행을 만든다
- 화면: `/a` 최상단 「보낼 카톡 N건」 — 카드 1장 = 의뢰인 이름·프로젝트 · 사유 라벨(`title`, 예: 「GitHub 초대 재요청」) · 만든 시각 · 본문 전문(읽기 전용, 줄바꿈 유지) · [복사] [보냈음] [보내지 않음]. `/a/[code]` 「현재 상황」에도 그 프로젝트 것만. 0건이면 섹션을 숨긴다. 375px에서 본문이 잘리지 않는다
- 동작(3판 심사 반영): 버튼은 둘이다. **[카톡으로 보내기]** = 폰이면 `navigator.share`(공유 창에서 카톡 선택), PC면 클립보드 복사 — **성공한 그 순간 `sent`+`sent_at`** 를 기록한다(「복사」와 「보냈음」을 나누면 「보냈음」이 상습적으로 누락된다 — 심사 #27). 공유 창을 닫거나 복사가 실패하면 기록하지 않는다. **[보내지 않음]** → `skipped(admin)`. 최근 24시간 처리 목록에서 **[되돌리기]**(sent·skipped(admin) → pending)로 오조작을 되돌린다. 세 액션 모두 서버 액션(service_role). 의뢰인 세션은 이 테이블을 읽지도 쓰지도 못한다
- credentials 는 pending 으로 두지 않는다: 발급 화면의 안내문(비밀번호 포함)에 같은 [카톡으로 보내기] 버튼이 붙고, 성공 시 `projects.access_sent_at` + 장부 `sent` 행(본문은 비밀번호 자리를 「(발급 화면에만 표시)」로 마스킹). 발급만 하고 안 보내면 「지금 할 일: 접속 안내 아직 안 보냄」 칩이 남는다 — 발급 화면을 떠난 관리자를 재발급 함정에 빠뜨리지 않는다(심사 #28)
- 푸시(한 사건에 하나 — 심사 #29): 사건 푸시가 이미 나간 문구(verified → next_step, 의뢰인 클릭 → no_slug 재요청, 관리자 답글 → admin_replied)는 **조용히 만든다**. tick 이 스스로 만드는 문구(2h 재요청)만 「보낼 카톡 1건 · {의뢰인}: {사유}」(`/a#outbox`). 4시간 넘게 pending 이면 하루 1회 적체 알림 — 둘 다 **09~21시 KST 에만**(심사 #31), 밤에 만든 문구는 아침 적체 알림이 부른다. 09:00 요약(Phase 2)에 건수. P6 는 상태 카드 노랑일 뿐 「지금 할 일」 칩을 따로 만들지 않는다(같은 화면의 바로 위 섹션을 가리키는 자기참조 — 심사 #32)
- 거둠·대체: §4-4 의 **kind 별 「아직 필요한가」 판정**(심사 #30 — 사건 열거식이 아니라 술어). 카드에는 주제당 최신 1건만
- 템플릿: `ko.ts` `outbox.*`(CX 원칙 §4-4). 카톡 1건 ≤ 8줄·300자·링크 ≤ 1개 — **예외: `admin_replied`(답글 전문)·`credentials`(접속 정보 전체)**. 로그인 링크는 M14 프래그먼트(카톡 미리보기 스크래퍼도 프래그먼트는 받지 않는다, 확인 필요 10-4). 첫 줄 「{의뢰인 이름}님, 」+ 한 일 인정. 마지막 줄은 종류별 — 재요청은 「화면공유 20분이면 함께 끝낼 수 있어요」, 답글 알림은 「포털에서도 보실 수 있어요」. 「이 카톡으로 답 주셔도 됩니다」는 넣지 않는다(포털 「여기에 남겨 주세요」와 충돌 — 심사 #34)
- 포털 미러: 같은 내용이 의뢰인 포털 카드로 항상 떠 있다(재요청·다음 안내·되돌림). 카톡은 포인터라 늦게 보내도 포털은 정확하다
- 권한·의존성: 없음. 새 env 없음. 새 npm 의존성 없음
- 노력 M(카드 UI + 액션 3개 + 템플릿 9종 + 거둠·대체 로직 + 375px)

**M11. 생성 위저드 (스택 선택 → 미리보기 → 사전 점검 → 접속 정보)**
- 4단계. 마지막 단계는 발급 화면에 「보낼 카톡」 카드(credentials, 전문)가 바로 뜬다 — [복사] → 카톡 → [보냈음](= `access_sent_at`). 화면을 떠나도 카드는 `/a` 최상단에 남는다(비밀번호 없는 판 — 비밀번호가 필요하면 재발급). 노력 S

**M12. 원인별 자동 재요청 (포털 카드 즉시 + 「보낼 카톡」 문구 1건)** — GitHub는 owner=client 확정 즉시. Vercel·Supabase는 관리자 「안 왔음」 후. wrong_role도 즉시 작성(D7 종결 — 보내는 사람이 관리자다). 의뢰인 재시도(`client_attempts`) 2회 반복 시 sticky 버튼 순서를 [화면공유] 1순위로. 문구는 §4-3 표(CX 원칙 준수). 노력 S

**M13. 미진행 리마인드** — §4-4 표와 정지 조건 7개(a~g) + `remind_paused_until` 보류 스위치. tick은 문구를 「보낼 카톡」에 올릴 뿐 보내지 않는다 — 보낼지는 내가 정하고 [보내지 않음]도 기록된다. 결제 필요 단계는 문구 대신 칩. 노력 S

**M14. 로그인 링크 — URL 프래그먼트 랜딩 + 설정 의존 명시 (신설)**
- 현행 `/auth/callback?token_hash=…&type=magiclink`는 GET 즉시 `verifyOtp`로 토큰을 소비한다(확인: `src/app/auth/callback/route.ts`). 메일 보안 스캐너나 **카톡 링크 미리보기 스크래퍼**가 링크를 먼저 열면 의뢰인이 누르기 전에 소진된다 — Supabase 트러블슈팅이 "email prefetching"을 만료 오류의 가장 흔한 원인으로 명시(확인)
- 변경: 링크를 `/auth/link#token_hash=…&type=magiclink`(프래그먼트)로 만들고, 이 페이지는 **버튼 클릭 후에만** `verifyOtp`를 호출한다. 프래그먼트는 서버·스캐너에 전달되지 않는다. `generateGuestMagicLink`의 링크 조립만 바뀐다
- 유효시간: Supabase 매직링크 만료는 프로젝트의 Email OTP Expiration 설정이 결정하고 최대 86400초(확인). 기본값 3600초(인용). 코드 어디에도 24h를 만드는 설정이 없으므로 **CLAUDE.md §6·`ko.ts`의 "24시간"은 지금 기본 설정에서는 거짓이다**. 대시보드에서 86400으로 맞추고 `MAGIC_LINK_TTL_HOURS=24`를 env로 두어 안내문·ko.ts·P11이 같은 값을 읽는다. 보안 어드바이저가 1시간 초과를 경고하는지는 **확인 필요**(경고 시 무시 사유를 기록)
- 실패 문구: `ko.login.errorAuth`를 「링크 유효시간이 지났습니다. 안내받은 이메일과 비밀번호로 아래에서 로그인하시면 됩니다」로 바꾸고 담당자 연락은 마지막 줄
- 노력 S · Phase 1a

### SHOULD

**S1. 프로젝트 상태 자동 전이 (D6)** — 변경 없음. 노력 S
**S2. 에스컬레이션 + 09:00 요약** — 30분 재알림은 푸시, 4시간은 다른 채널(M9). 요약은 `daily:{KST 날짜}` 키 부재 + 09:00 이후 판정. 노력 S
**S3. 카나리 검증** — 변경 없음. 노력 S
**S4. 토큰 만료 추적** — GitHub는 `GitHub-Authentication-Token-Expiration` 헤더, **Vercel은 `GET /v5/user/tokens/current`의 `expiresAt`(확인 — env 불필요)**, Supabase만 `SUPABASE_ACCESS_TOKEN_EXPIRES_AT` env. D-30/7/1 푸시. 노력 S
**S5. (삭제 → N6)** GitHub 초대 자동 수락은 하지 않는다. D5=B 확정. `pending_accept` 푸시에 `github.com/orgs/{org}/invitation` 딥링크를 넣어 수락을 두 탭으로
**S6. 오프보딩 부분 자동화** — 변경 없음(접근 회수 원클릭 — 같은 이메일이 다른 진행 중 프로젝트 게스트면 Auth 사용자는 남김 · Vercel 팀 탈퇴 API · 공용 PAT 폐기 금지 문구). Supabase 조직 멤버 삭제 v1 엔드포인트 없음(확인, OpenAPI 원본: `/v1/organizations/{slug}/members`는 GET만). 노력 M
**S7. 알림 상한(프로젝트당 시간당 20건)** — 유지하되 `/api/verify` 쿨다운(M4)이 1차 방어. 노력 S
**S8. 관리자 답글·범위 확정·링크 고정 → 「보낼 카톡」 문구** — 답글은 본문 전문(M10). 노력 S
**S9. 카톡 = 포인터** — 모든 문구는 포털 카드를 가리키는 포인터다. 접속 안내(credentials)만 카톡이 본체(비밀번호가 카톡에만 있다). 노력 S
**S10. assisted 등급 전용 첫 화면** — 변경 없음. **support_tier 자동 변경은 하지 않는다** — 등급은 의뢰인과 통화로 정하는 값. 의뢰인 재시도 3회·need_help 2회면 관리자 칩 「assisted 전환 제안」만. 노력 S
**S11. `todo → doing` 기록 (신설)** — 「만들었습니다」·slug 저장 서버 액션이 `doing`으로 올린다. 파생 신호 「slug 저장 후 48h 완료 요청 없음」을 `todo.ts`가 계산해 칩으로. 노력 S

### LATER

**L1. 개발 착수 셋팅** — 변경 없음(딥링크 반자동, 3건 후 API 재검토)
**L2. Solapi 문자 — 관리자 본인용 2차 채널(D17=B일 때만)** — 의뢰인 발송 채널로는 쓰지 않는다(3판)
**L3. (must로 승격 → M9)**
**L4. (삭제 → D8 종결)** 셀프 접속 링크 재발급은 링크를 전달할 채널이 없으므로 만들지 않는다. 로그인 실패 문구는 「담당자에게 카톡 주세요」, 관리자 재발급 문구가 「보낼 카톡」에 뜬다
**L5. 개발 기간 주간 소식 초안** · **L6. 포털 「받은 안내」 탭** · **L7. Anthropic 1회용 확인** — 변경 없음

### NO

**N1. 카카오톡·이메일·SMS 자동 발송 (3판 결정)** — 카카오는 개인 메시지 API가 없고 알림톡은 템플릿 사전 검수. 메일·문자는 만들 수 있어도 쓰지 않는다 — 의뢰인에게 가는 말은 관리자가 카톡으로 직접 보낸다. 허브는 문구만 쓴다(M10)
**N2. Anthropic·Resend·Solapi 단계 API 검증** — 변경 없음
**N3. 알림 큐·재시도 워커·워크플로 엔진·감사 로그 테이블** — `notices`는 장부. 실패 행 재시도·묶음 발송도 하지 않는다(재계산 모델)
**N4. 받은편지함 초대 감지·카톡/메일 답장 자동 수집** — 답은 사람이 포털에 옮겨 적는다(§3 #18)
**N5. 사전 점검 빨강 우회 버튼** — 우회 없음. 대신 빨강 범위를 M3에 좁게 고정한다
**N6. GitHub 초대 API 자동 수락 (D5=B 확정)** — `PATCH /user/memberships/orgs/{org}`의 classic 스코프는 GitHub REST OpenAPI 원본 설명에 명시돼 있지 않다(확인 — 문구 없음). 심사관 검색 요약은 `admin:org` 또는 `repo`, 커뮤니티 토론은 `org:write`를 언급해 **확인 필요**로 남는다. 어느 쪽이든 read:org보다 넓고 `repo`면 내 모든 비공개 레포 쓰기 권한이 15분마다 도는 크론 토큰에 상주한다. fine-grained 「수락 전용」 토큰은 의뢰인 조직에 리소스 소유자 지정이 필요해 자동화가 성립하지 않을 가능성이 높다(**확인 필요**) → 실질 NO
**N7. support_tier 자동 변경** — S10 참조
**N8. 48h 미로그인 자동 문구·다음 날 묶음 문구** — §4·§4-4 참조

---

## 6. 바꿔야 할 스펙 조항 — CLAUDE.md 개정안 (v0.5)

| 조항 | 처리 | 대체 문구(그대로 넣을 수 있게) |
|---|---|---|
| §1 「없어도 굴러가는 것은 만들지 않는다」 | 유지 + 각주 | `> 원칙: 없어도 굴러가는 것은 만들지 않는다. **관리자가 손으로 하는 일은 굴러가는 것이 아니다.**` |
| §1 (신설) 복잡도 상한 | 신설 | `### 1인 유지보수 상한` · 테이블 ≤ 9개 · jsonb 컬럼 1개 · 크론 라우트 1개(/api/cron/tick) · 바깥 채널 1개(관리자 웹 푸시 — 의뢰인에게 가는 말은 허브가 보내지 않고 「보낼 카톡」에 문구로 둔다) + 외부 heartbeat 1개 · 모든 자동화는 env가 없으면 「지금 할 일」 칩으로 강등 · **tick은 순수 함수 `runTick(now)`이고 로컬 curl로 재현 가능해야 한다** |
| §2 「메일 발송(Resend·SMTP 일체)」 | **유지 + 각주** | 쓰지 않는 것에 그대로 둔다. 각주: `의뢰인에게 보내는 메일·문자·알림톡 채널을 만들지 않는다. 의뢰인에게 전할 말은 시스템이 카톡 문구로 작성해 /a 「보낼 카톡」에 두고, 관리자가 직접 카톡으로 보낸 뒤 「보냈음」을 누른다(notices.channel='outbox'). 허브가 의뢰인에게 직접 보내는 경로는 없다.` |
| §2 「크론」 | 완화 | `크론은 **Vercel Cron 1개**(/api/cron/tick, 15분, CRON_SECRET)만. tick은 판단만 하고 행동은 기존 서버 함수를 부른다. tick이 3시간 완주하지 않으면 /a 배너가 빨갛고 외부 heartbeat가 관리자에게 메일로 알린다(의뢰인 채널이 아니다).` |
| §4 테이블 목록 | 갱신 | 8 → 9개. `notices(dedupe_key) 푸시 발송 이력 + 「보낼 카톡」 문구 — 큐가 아니다. 「이미 만들었는가」를 답하는 멱등 키. 실패·거둔 행은 재시도하지 않고 다음 tick이 새 키로 다시 계산한다. 관리자만 읽는다.` 컬럼 추가: `projects.access_sent_at`·`projects.remind_paused_until`·`push_subscriptions.last_ack_at`·`admins.last_tick_started_at`·`last_tick_finished_at`·`last_token_check_at` |
| §5 상태 6개 | 확장 | `client_done → returned (시스템만)` · `returned → doing \| client_done \| blocked (의뢰인)` · `returned → verified \| skipped \| todo (나)` · `todo → doing은 「만들었습니다」·slug 저장 시 서버가 기록한다` · **`verified·skipped에서는 의뢰인이 어떤 상태로도 나갈 수 없다(가드 + RLS USING)`** · 진행률 `returned = 0.5`(의뢰인 라벨 「한 가지만 더」) |
| §6 「SMTP를 설정하지 않는다」 | 유지 + 각주 | 문장은 그대로. 「매직링크 24시간 유효」에 각주: `유효시간은 Supabase 대시보드 Auth › Email › Email OTP Expiration(최대 86400초, 기본 3600초)이 결정한다. 86400으로 설정하고 MAGIC_LINK_TTL_HOURS와 일치시킨다 — 사전 점검 P11이 대조한다. 링크는 /auth/link#token_hash=… 프래그먼트 형태이며 버튼 클릭 후에만 소비된다(카톡 링크 미리보기·메일 스캐너 선클릭 방지). 접속 정보는 비밀번호 로그인이 1순위, 링크는 보조다.` |
| §7 컬럼 가드 | 강화 | `가드 트리거는 **allow-list**다. 새 컬럼은 추가하는 순간 기본이 「막힘」. old.status가 verified/skipped인 행은 의뢰인이 어떤 갱신도 못 한다.` |
| §8 「토큰 상태는 의뢰인보다 내가 먼저 안다」 | 강화 | `점검은 tick이 매시간 돌린다. 사전 점검 **빨강 = P1~P3 토큰 invalid/missing · P4 Vercel 이메일 불일치 · P8 의뢰인 이메일 형식 오류/관리자 이메일과 동일** — 이때 접속 정보·비밀번호 발급·매직링크가 막히고 우회 버튼은 없다. 푸시·크론 문제는 노랑 + 내 할 일이며 의뢰인 흐름을 막지 않는다. 검증 error가 내 쪽 원인이면 그 프로젝트의 의뢰인 리마인드는 정지한다.` 검증 결과에 `owner` 필수 · `detail`은 의뢰인 화면에 렌더하지 않는다 |
| §8 verify 3종 | 정밀화 | `Vercel·Supabase의 「멤버 목록에 없음」은 초대 없음과 내 수락 전을 구분하지 못한다 → owner=admin(await_admin_first)에서 시작하고, 내가 「초대 안 왔음」을 누른 뒤에만 의뢰인 원인으로 다룬다. GitHub만 404를 초대 없음으로 본다.` |
| §9 지원 등급 | 추가 | `assisted 등급은 리마인드 대상이 아니라 일정을 잡을 대상이다.` · `등급은 통화로 정한다 — 자동 변경하지 않는다. 의뢰인 재시도 3회·need_help 2회면 「assisted 전환 제안」 칩만.` |
| §9 제작자 루프 | 추가 | `**보낼 카톡**: 의뢰인에게 전할 말(접속 안내·연결 확인·재요청·리마인드·답글 알림)은 시스템이 완성 문구로 작성해 /a 최상단 「보낼 카톡」에 둔다. 나는 복사 → 카톡 → 「보냈음」. 철 지난 문구는 tick이 거둔다. 허브는 의뢰인에게 직접 보내지 않는다.` · `**막힘 감지**: 의뢰인이 「완료했습니다」를 3회 누르거나(자동 재확인은 세지 않는다) slug 저장 후 48h 완료 요청이 없으면 화면공유 버튼을 1순위로 승격하고 내게 1회 알린다.` · `**리마인드(문구 작성, 발송은 내가)**: 단계당 2회(3일·7일), 프로젝트당 하루 1건, 평일 10~18시 KST. 정지: 의뢰인 7일 내 코멘트·미답 질문·막힘·내 쪽 오류·내 수락 대기 단계 존재·assisted·remind_paused_until.` · `**알림은 배달(ack)까지 본다**: 30분 내 ack 없으면 다이제스트, 4시간이면 다른 채널.` |
| §10 종료 2번 | 수정 | `2. **이 프로젝트를 위해 별도 발급한** 토큰·키 폐기. 허브 공용 검증 토큰은 폐기하지 않는다.` |
| §11 절대 금지 | 추가 | `13. CRON_SECRET 검증 없는 크론 라우트` · `14. dedupe_key 없는 자동 발송 · 에폭 없는 dedupe_key` · `15. redact() 미경유 로그` · `16. 사전 점검 빨강 우회 버튼` · `17. verify_result.detail을 의뢰인 화면에 렌더` · `18. 토큰을 GET 즉시 소비하는 로그인 링크(쿼리 파라미터 token_hash)` · `19. support_tier 자동 변경` · `20. 의뢰인에게 직접 보내는 메일·문자·알림톡 경로` · `21. notices.body에 비밀번호·토큰·로그인 링크` |
| §12 「크론 리마인더」 | 삭제 | (§9 리마인드 규칙으로 대체) |
| §12 「알림 큐 테이블」 | 정밀화 | `알림 큐·재시도 워커·워크플로 엔진 — 다만 푸시 이력·「보낼 카톡」 문구를 담는 notices 1개는 둔다(큐가 아니라 멱등 키. 실패 행은 재시도하지 않는다 — 다음 tick이 조건을 다시 계산해 새 키로 보낸다. 묶음 발송 없음)` |
| §13 항상 할 것 | 추가 | `7. 새 자동 알림·문구 → 에폭 있는 dedupe_key + ko.ts 템플릿 + notices 기록 + 거둠 조건` · `8. 새 외부 API 응답 필드 → 공식 OpenAPI 또는 실호출 1회로 확인 후 코드에` · `9. 새 외부 fetch → AbortSignal.timeout` · `10. 새 tick 작업 → runTick 안에 넣고 로컬 curl로 재현` |

---

## 7. 결정이 필요한 항목

### 결정 없이도 진행 가능한 것
크론 tick(순수 함수 + 락) · 사전 점검 게이트(빨강 범위 고정) · `notices`(claimed 상태·재계산 모델) · verify_result code/owner/CAS ·
Vercel·Supabase `await_admin_first` · 가드 allow-list + verified/skipped 이탈 금지 · redact · 푸시 ack · 안전망 · 상태 카드 ·
admin ack 파생 · 프래그먼트 로그인 링크(M14) · **「보낼 카톡」(D1 종결)** · 오프보딩 접근 회수 · 오프보딩 2번 문구 · D5=B · CLAUDE.md v0.5 선반영

### 결정 항목

| # | 질문 | 선택지 | 권장안 | 근거 |
|---|---|---|---|---|
| D1 | 의뢰인 자동 메시지 채널 | A. Gmail SMTP / B. Resend / C. SMS / D. 없음 — 대시보드 「보낼 카톡」 | **D 확정(사용자 결정 09-10)** | 허브는 의뢰인에게 직접 보내지 않는다. 문구만 쓰고 관리자가 카톡으로 보낸다(M10). 채널·의존성·스팸함·피싱 외형 문제가 통째로 사라진다 |
| D2 | 크론 주기 | 15분 / 60분 / 매 분 | **15분** | 안전망 최대 지연 45분. 비용 무의미 |
| D3 | 되돌림 표현 | A. `returned` 상태 / B. client_done + 파생 / C. doing 복귀 | **A** (진행률 0.5, 라벨 「한 가지만 더」) | 소비자 3곳이 한 값을 읽는다. 0.5 유지로 벌점감을 없앤다 |
| D4 | 발송 이력 저장소 | A. `notices` / B. 컬럼 분산 / C. 없음 | **A** (§12 문구 개정 승인 필요) | 5인 일치 |
| D5 | GitHub 초대 자동 수락 | A. 켠다 / B. 끈다 | **B 확정** ("실측 후 A" 삭제) | 필요한 classic 스코프가 문서 원본에 없고, 후보(admin:org·repo·org:write) 전부 read:org보다 넓다. 딥링크 2탭으로 충분 |
| D6 | 프로젝트 status 자동 전이 | A. 허용 / B. 칩만 | **A** | 조건이 전부 데이터에서 결정 |
| D7 | 재요청 문구 자동 작성 범위 | A. 전부 / B. 승인 후 / C. 일부 | **A 확정(D1=D의 귀결)** | 보내는 사람이 관리자라 승인 단계가 곧 발송이다. wrong_role은 허용 role 집합(확인 필요 10-10) 전까지 문구 끝에 확인 문장 |
| D8 | 로그인 실패 시 셀프 링크 | A. 허용 / B. 현행 | **B 확정(D1=D의 귀결)** | 링크를 의뢰인에게 자동으로 전달할 채널이 없다. 실패 문구 → 「담당자에게 카톡」 + 관리자 재발급 문구(「보낼 카톡」) |
| D9 | 리마인드 주기·상한 | A. 3일·7일·2회·하루 1통·평일 / B. 48h·5일 / C. 무제한 | **A + 정지 조건 7개 + 보류 스위치** | 정지 조건이 상한보다 중요 |
| D10 | 토큰 만료 정책 | A. 1년 만료 + env / B. 없음 / C. API만 | **A' — 1년 만료, env는 Supabase 1개** | GitHub 헤더·Vercel `tokens/current`(확인)로 2개는 API |
| D11 | 개발 착수 자동화 | A~D | **C, 3건 후 재검토** | 변경 없음 |
| D12 | CLAUDE.md 개정 시점 | A. 구현 전 / B. 후 | **A** | 변경 없음 |
| D13 | (종결) 접속 정보 메일의 비밀번호 | — | **해당 없음** | 메일이 없다. 비밀번호는 발급 화면 → 카톡에만. `notices.body`에는 넣지 않는다(§11-21) |
| D14 | (종결) 메일 답장 정책 | — | **해당 없음** | 답장 채널은 관리자 카톡 자체다. 카톡 답은 내가 포털에 옮겨 적는다(§3 #18) |
| D15 (신설) | Supabase Email OTP Expiration을 86400으로 올리는가 | A. 86400(24h) / B. 기본 3600 유지 + 안내문 「1시간」 | **A** | 링크는 카톡 안내문 안의 보조 수단이라 1시간이면 사실상 못 쓴다. 보안 어드바이저 경고 여부 확인 필요 — 경고 시 사유 기록 |
| D16 (신설) | 외부 heartbeat 서비스 | A. healthchecks.io 무료 / B. 다른 서비스 / C. 없음 | **A** | 4시간 에스컬레이션의 "다른 채널"이 Phase 1에서 이것뿐. env 1개 |
| D17 (신설) | 4시간 무응답 에스컬레이션의 2차 채널(관리자 본인용) | A. 없음 — 푸시 ack 자기진단 + 외부 heartbeat(크론 사망)만 / B. Solapi 문자를 내 번호로(L2) | **A, 한 번 놓치면 B** | 메일 채널이 사라져 「관리자 본인 메일」 선택지가 없어졌다. 푸시는 크롬 PWA에서 동작 확인됨. B는 env 2개·비용 |

---

## 8. 구현 단계(Phase)

추정 근거: 1인 개발자. 같은 저자의 기존 단위(`push.ts` 85줄 + 구독 UI + 마이그레이션)가 하루였다. Phase 1은 `verify/*` 528줄·`actions.ts` 646줄을 거의 전부 손댄다. 기존 「3~4일」은 절반 추정이었다 — **Phase 1 합계 7~10 사람일**로 잡고 둘로 쪼갠다.

### Phase 1a — 시계·장부·게이트·하드닝 + 「보낼 카톡」 최소판 (결정 없이 시작) · 약 4~5 사람일

범위:
1. 마이그레이션 1개: `notices`(claimed 포함) + RLS · `admins.last_tick_started_at/finished_at/last_token_check_at` · `push_subscriptions.last_ack_at` · `projects.access_sent_at`·`remind_paused_until` · 가드 allow-list + verified/skipped 이탈 금지 + RLS USING
2. `src/lib/notify.ts`: `claim(dedupeKey) → send → mark(sent|failed)` · `notifyAdmin` 서명에 `dedupeKey` 필수 · web-push `topic`/TTL · `/api/push/ack` + 서비스워커 ack
3. `src/lib/tick.ts` `runTick(now)` + `/api/cron/tick` + `vercel.json crons` + `CRON_SECRET`(길이 비교 후 timingSafeEqual) + 어드바이저리 락: heartbeat(started/finished) · 토큰 점검(마지막 기록 기준) · `reverifyStale` → `next_check_at` 백오프(최대 10건, 30초 예산) · stale claim 청소 · 외부 heartbeat GET(`HEARTBEAT_URL`)
4. `verify/*` fetch 전부 `AbortSignal.timeout(8000)` · 결과 저장 CAS · `/api/verify` 60초 쿨다운 · 의뢰인 트리거 푸시 「client_done 후 첫 1회」
5. `preflight.ts` P1~P4 + P8 게이트(빨강 범위 고정) + `issueGuestPassword`·`generateGuestMagicLink` 직전 재실행 · 버튼 비활성 + 사유
6. M14: `/auth/link` 프래그먼트 랜딩 + `generateGuestMagicLink` 링크 조립 변경 + `ko.login.errorAuth` 문구 + `MAGIC_LINK_TTL_HOURS`
7. `last_tick_finished_at` 배너(3h) + 「완주 못 함」 빨강 · `.env.example`(`CRON_SECRET`, `HEARTBEAT_URL`, `MAGIC_LINK_TTL_HOURS`)
8. **「보낼 카톡」 최소판(M10)**: `notices.channel='outbox'` + `/a` 최상단 카드([복사]·[보냈음]·[보내지 않음] 서버 액션 3개) + 템플릿 3종(`next_step` 연결 확인·다음 안내 / `rerequest` GitHub `check_invite`·`no_slug` / `admin_replied` 답글 전문) + 생성 푸시 + 거둠(`condition_cleared`) + 4시간 적체 푸시 + `/a/[code]` 「현재 상황」 미러

수용 기준:
- 로컬: `curl localhost:3000/api/cron/tick` 헤더 없음 → 401 · `curl -H "Authorization: Bearer $CRON_SECRET" …` → 200 + `{tokens, reverified, stale, digests}` · `runTick(now)` 단위 테스트가 시각을 주입해 토큰 점검 게이트·백오프를 검증(**프로덕션 배포 없이 재현 가능**이 기준이다)
- 프로덕션: `vercel crons run /api/cron/tick` 200(헤더 여부 확인 필요 — 실패하면 curl 경로로) · 실행 후 started·finished 갱신, 배너 초록
- Production에서 `SUPABASE_ACCESS_TOKEN`을 비운다 → 다음 tick 안에 푸시 1건, 이후 tick 푸시 없음, 복구 시 「복구됨」 1건
- **발송 함수에서 인위적으로 throw** → 15분 내 `failed(stale_claim)` 전환 + 카드 빨강
- 의뢰인 세션으로 `projects.access_sent_at`·`steps.verify_result` update → 예외 · **verified 단계를 doing으로 update → 예외** · 포털 회귀 8개 클릭 정상
- 테스트 프로젝트에서 「완료했습니다」 후 대시보드를 열지 않고 초대 수락 → 30분 안에 자동 `verified` 푸시 · 같은 단계에 tick과 「연결 확인하기」를 동시에 → 푸시 1건
- 푸시 구독을 전부 지운다 → **P5 노랑 + urgent 칩, 비밀번호 발급은 가능**
- 「테스트 알림」 → 폰에서 탭 → `acked_at`·`last_ack_at` 갱신 후 초록. 탭하지 않으면 노랑 유지
- `HEARTBEAT_URL`을 잘못된 값으로 → tick은 200, 외부 서비스가 ping 누락 메일(나에게)
- 카톡 미리보기·메일 스캐너 모사: 매직링크 URL을 `curl`로 먼저 GET → 그 뒤 브라우저에서 버튼 클릭 로그인 성공
- GitHub 단계에 slug 없이 「완료했습니다」 → 30초 안에 `/a` 「보낼 카톡 1건」 카드(no_slug 문구, 첫 줄 「{이름}님, 」) + 푸시 1건 · [복사] → 클립보드에 본문 전문 · [보냈음] → `sent_at` 기록, 카드 사라짐 · 같은 상태에서 tick 3회 → 카드 여전히 1건(중복 없음)
- 카드가 pending인 채 의뢰인이 slug 저장·초대까지 끝내 verified → 다음 tick에 그 카드가 자동으로 사라지고(`skipped(condition_cleared)`) 「연결 확인·다음 안내」 카드 1건이 새로 뜬다
- 관리자 답글 저장 → 「보낼 카톡」에 본문 전문 카드 즉시 · 의뢰인 세션으로 `notices` select → 0행 · 375px에서 카드 본문·버튼 3개 모두 보임
- `notices.body` 전체 grep: 임시 비밀번호 패턴·`token_hash=`·`ghp_`·`sbp_` 0건
- `grep -rn "process.env" src | grep console` 0건 · `notices.detail`에 `ghp_`·`Bearer`·`@` 로컬파트 0건

의존성: healthchecks.io 계열 계정 1개(D16). Supabase 대시보드 Email OTP Expiration = 86400(D15). CLAUDE.md v0.5 §4·§5·§6·§7·§8·§11·§12 개정을 같은 PR에

### Phase 1b — 판정·확인 루프·상태 카드 · 약 4~5 사람일

범위: `verify/types.ts` `VerifyCode`·`CODE_TABLE`·`owner`·`client_attempts`/`auto_checks` · GitHub 선조회(org_not_found/personal_account) · Vercel `role`·Supabase `role_name`/`field_missing` · Supabase 403 재분류 · system 3회 → admin 승격 · **Vercel·Supabase `await_admin_first`** + admin ack 칩 2탭(Anthropic 포함) + 24h/D-2 재알림 · `connect-flow.tsx` detail 렌더 삭제 + `ko.stepDetail.verifyCode` 매핑 · S11 `todo → doing` 기록 · `todo.ts`(`access_sent_at` 기준 미접속·await_*·경과·이틀째 초대 전·assisted 전환 제안) · 안전망 다이제스트(ack 기준) · 상태 카드(신호등+기준 시각+타일+최근 10건) · `preflight.ts` P5~P11 노랑 · `redact.ts` + 기존 로그 전면 경유 · 오프보딩 항목 2 문구 + 항목 5 접근 회수 원클릭 · 375px 확인(§13-5)

수용 기준:
- 내 GitHub 개인 계정 login을 slug로 넣고 「만들었습니다」 → `doing` + `personal_account` 카드 즉시(원칙 문구)
- Vercel 팀 이름을 틀리게 넣고 완료 → 의뢰인 화면 「초대를 보내셨다면 제가 수락하는 중입니다」, 내 칩 「Vercel 초대 메일 확인 [왔음][안 왔음]」, **「보낼 카톡」에 재요청 문구 0건, 48h 지나도 returned 없음** · 「안 왔음」 클릭 → returned + 재요청 카드
- 「완료했습니다」 1회 후 tick이 3회 재확인 → `auto_checks=3`, `client_attempts=1`, 화면공유 승격 없음
- Supabase 멤버 응답에 email 없는 계정 → `error(field_missing)` + 내 할 일(check_invite 아님)
- 의뢰인 화면 어디에도 `verify_result.detail` 문자열이 렌더되지 않음(관리자 1인칭 문구 grep 0건)
- 30분 방치된 urgent + ack 없음 → 45분 안에 다이제스트 1건, 1시간 안에 2건째 없음
- 접근 회수 원클릭: 다른 진행 중 프로젝트에 같은 이메일 → 행만 삭제, Auth 사용자 유지

의존성: Phase 1a

### Phase 2 — 되돌림·리마인드·위저드·나머지 문구 (D3·D9 결정 후) · 약 3~4 사람일

범위: `returned` 마이그레이션 + `calcProgress`(0.5)·`nextClientStep`·배지 「한 가지만 더」 · 원인별 재요청 전 종류(Vercel·Supabase는 ack 후, wrong_role 포함) · 리마인드(정지 조건 7개 + `remind_paused_until` 칩 + 결제 단계 제외 + 주말 보류) · 「보낼 카톡」 나머지 템플릿(`credentials`·`reminder`·`scope_ready`·`link_pinned`·`closed`) + 대체(`superseded`) + 상한 `skipped(cap)` · 생성 위저드(4단계, 마지막이 credentials 카드) · 09:00 요약(보낼 카톡 건수 포함) · `advanceProjectStatus` · assisted 첫 화면 · D17=B면 관리자 본인 문자

수용 기준:
- 위저드 → credentials 카드가 발급 화면에 뜨고 [보냈음] 전에는 `access_sent_at` null · [보냈음] → 기록 · `notices.body`에 비밀번호 문자열 없음 · 빨강 상태에서는 발급 버튼 자체가 비활성
- GitHub 초대 없이 완료 → 2h 후 tick 이 강제 재확인 → 그대로면 `returned` + 재요청 문구 #1 카드(단계 링크·이메일 복사 안내·Owner)를 **한 tick 에** · 포털 「다음 할 일」 최상단 「한 가지만 더」 · **진행률 유지(0.5)** · 그 사이 pending_accept 로 바뀌면 둘 다 없음
- 의뢰인 세션: 주소 없이 완료 → 홈 최상단 「한 가지만 더」 카드 + 단계 화면은 주소 입력 칸으로 착지 · check_invite 확인 카드에 [초대할 이메일 복사]·[초대 화면 열기] · 완료 2회 실패 → 화면공유 버튼 1순위 · 375px 스크린샷
- 관리자 「확인 완료로」(수동 단계·현재 상황 카드에서 1클릭) → 「확인됐습니다 + 다음은 …」 카드 · 범위 확정 → 「작업 범위 확인」 단계 verified · 첫 제작자 단계 앞 의뢰인 단계 전부 끝 + 범위 확정 → `building` (「도메인 연결」은 조건 밖) · 의뢰인이 직접 완료해 즉시 확인된 단계의 푸시는 「보낼 것 없음」이라고 말한다
- 선택 단계(Resend·Solapi)는 생성 시에도 나중에 추가해도 「개발 진행」 앞에 들어간다 · 설정 탭에서 의뢰인 이메일을 고치면 아직 접속 안 한 게스트 행이 따라간다
- 초대 수락 → `verified` + 「확인됐습니다 + 다음은 Vercel」 카드 즉시 · 같은 날 두 번째 단계 verified도 **즉시 카드 1건**(next_step은 하루 1건 상한 대상이 아님)
- `SUPABASE_ACCESS_TOKEN` 무효 + 3일 정체 → 리마인드 카드 0건 · GitHub가 `pending_accept`인 채 Vercel 3일 정체 → 0건(정지 e) · 「7일 보류」 칩 → 0건
- connect-vercel 3일 정체 → 카드 0건, 칩 「결제 부담 여부 통화」
- 토요일 조건 성립 → 월요일 10:00 카드 생성 · assisted → 0건
- 리마인드 카드가 pending인 채 의뢰인이 로그인·코멘트 → 다음 tick에 카드 거둠(`condition_cleared`) · 같은 단계에 2차 문구가 계산되면 1차는 `superseded`, 카드는 1장
- 관리자 답글 → 카드 본문에 답글 전문 + 마지막 줄 「이 카톡으로 답 주셔도 됩니다」 · [보내지 않음] → `skipped(admin)`, 같은 키로 다시 만들어지지 않음

### Phase 3 — 확인·종료 자동화 (D10 결정 후) · 약 2~3 사람일

범위: 카나리(S3) · 토큰 만료 추적(S4: GitHub 헤더 + Vercel `tokens/current` + Supabase env) · Vercel 팀 탈퇴 [자동] + 완료 안내 문구(보낼 카톡) + 체크리스트 메타(S6) · Anthropic D-2 만료 알림

수용 기준: 기존과 동일 + `GET /v5/user/tokens/current`를 D-7 토큰으로 → D-7 푸시 1회

### Later — 실제 의뢰 3건 후
L1 · L2 · L5 · L6 · L7

---

## 9. 데이터 모델 변경 — 최소안과 RLS

```sql
-- 20260911000000_automation.sql (Phase 1a)

-- 1) 장부 = 멱등 키. 큐가 아니다. 실패·거둔 행은 재시도하지 않는다 — 다음 tick이 새 키로 다시 계산한다.
--    channel='push'  : 내 폰으로 실제 보낸 기록            (claimed → sent | failed)
--    channel='outbox': 의뢰인에게 보낼 완성 카톡 문구. 관리자가 보내고 「보냈음」을 누른다 (pending → sent | skipped | superseded)
--    관리자만 읽는다. 쓰기는 service_role만(정책 없음 = 막힘). 의뢰인에게 직접 보내는 채널 값은 없다.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,   -- 시스템 전체 알림은 null
  step_id uuid references public.steps (id) on delete cascade,
  kind text not null check (kind in (
    'credentials','next_step','rerequest','reminder','escalation','digest',
    'admin_replied','scope_ready','link_pinned','closed',
    'verify_event','token_event','push_test','preflight')),
  channel text not null check (channel in ('push','outbox')),
  dedupe_key text not null unique,            -- 반드시 에폭(전이 시각·access_sent_at·회차)을 포함한다
  status text not null
    check (status in ('claimed','pending','sent','failed','skipped','superseded')),
  title text,                                 -- outbox: 카드 사유 라벨 (「GitHub 초대 재요청」)
  body text,                                  -- outbox: 카톡 문구 전문. 비밀번호·토큰·로그인 링크 금지(§11-21, CI grep)
  skip_reason text
    check (skip_reason in ('admin','condition_cleared','cap')),  -- outbox skipped 사유
  claimed_at timestamptz,                     -- push
  sent_at timestamptz,                        -- push: 푸시 서비스 201 시각 / outbox: 관리자 「보냈음」 클릭 시각
  acked_at timestamptz,                       -- push: 서비스워커 ack. 「배달됨」의 유일한 근거
  day_kst date not null,                      -- 앱이 KST로 계산해 넣는다 (일일 상한 인덱스용)
  detail text,                                -- redact() 경유. 상태 코드·오류 클래스·단계 키만
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notices_project_idx on public.notices (project_id, created_at desc);
create index notices_claimed_idx on public.notices (claimed_at) where status = 'claimed';  -- stale claim 청소
create index notices_pending_idx on public.notices (created_at) where status = 'pending';  -- 「보낼 카톡」 카드·4시간 적체
-- 「같은 사유로 하루 2건 금지」— 리마인드 계열만 (project, kind, KST 날짜) 유니크. 대체는 이전 행을 superseded로 바꾼 뒤 삽입한다
create unique index notices_daily_cap_idx on public.notices (project_id, kind, day_kst)
  where kind in ('reminder','escalation') and status in ('claimed','pending','sent');
create trigger set_updated_at before update on public.notices
  for each row execute procedure extensions.moddatetime (updated_at);
alter table public.notices enable row level security;
create policy notices_select on public.notices
  for select to authenticated using (public.is_admin());
-- insert/update/delete 정책 없음 → authenticated는 쓰지 못한다. service_role만 쓴다(「보냈음」도 서버 액션).

-- 2) 컬럼
alter table public.projects add column access_sent_at timestamptz;        -- credentials 카드 「보냈음」 시각(리마인드·미접속 기준점)
alter table public.projects add column remind_paused_until timestamptz;   -- 관리자 「보류」 칩
alter table public.push_subscriptions add column last_ack_at timestamptz; -- 마지막 ack(배달 확인)
alter table public.admins add column last_tick_started_at timestamptz;
alter table public.admins add column last_tick_finished_at timestamptz;   -- 배너는 이 값으로 판정
alter table public.admins add column last_token_check_at timestamptz;     -- 토큰 점검 게이트(시각 슬롯 아님)

-- 3) 가드 트리거 allow-list 전환 + verified/skipped 이탈 금지
create or replace function public.guard_project_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then return new; end if;
  if to_jsonb(new) - 'github_org' - 'vercel_team' - 'supabase_org' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'github_org' - 'vercel_team' - 'supabase_org' - 'updated_at'
  then raise exception 'guests may only update org slug columns'; end if;
  return new;
end; $$;

create or replace function public.guard_step_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or public.is_admin() then return new; end if;
  if old.status in ('verified','skipped')
  then raise exception 'guests may not reopen a verified/skipped step'; end if;
  if to_jsonb(new) - 'status' - 'blocked_reason' - 'checked_at' - 'updated_at'
     is distinct from
     to_jsonb(old) - 'status' - 'blocked_reason' - 'checked_at' - 'updated_at'
  then raise exception 'guests may only update step status'; end if;
  if new.status is distinct from old.status
     and new.status not in ('doing','client_done','blocked')
  then raise exception 'guests may only set doing / client_done / blocked'; end if;
  return new;
end; $$;

-- RLS 이중 강제: USING 에 이탈 금지 추가
drop policy steps_guest_update on public.steps;
create policy steps_guest_update on public.steps
  for update to authenticated
  using (
    not public.is_admin()
    and project_id in (select public.my_project_ids())
    and owner_side = 'client'
    and status not in ('verified','skipped')
  )
  with check (status in ('todo','doing','client_done','blocked'));
```

```sql
-- 20260918000000_returned_status.sql (Phase 2, D3 승인 후)
alter table public.steps drop constraint steps_status_check;
alter table public.steps add constraint steps_status_check
  check (status in ('todo','doing','client_done','verified','blocked','skipped','returned'));
-- WITH CHECK 는 변경 없음(returned 를 넣지 않는다 — 의뢰인은 만들 수 없다).
-- USING 은 returned 행에서 doing/client_done/blocked 로 나가는 것을 허용한다.
```

`steps.verify_result` jsonb 필드 추가(스키마 변경 없음): `code`, `owner`, `client_attempts`, `auto_checks`,
`next_check_at`, `first_failed_at`, `admin_first_ack`, (Vercel) `team_id`. jsonb 컬럼은 여전히 하나다.

새 환경변수(`.env.example` 동기화): Phase 1a `CRON_SECRET`·`HEARTBEAT_URL`·`MAGIC_LINK_TTL_HOURS` · Phase 2 없음(D17=B일 때만 `SOLAPI_*`) · Phase 3 `CANARY_GITHUB_ORG`·`CANARY_VERCEL_TEAM`·`CANARY_SUPABASE_ORG`·`SUPABASE_ACCESS_TOKEN_EXPIRES_AT`.
**만들지 않는 것**: `GITHUB_TOKEN_EXPIRES_AT`(헤더)·`MY_VERCEL_TOKEN_EXPIRES_AT`(`tokens/current`) · `notices.next_attempt_at`·`attempts`·`payload jsonb`·`to_addr` · `GMAIL_*` ·
`projects.client_phone` · 오류 로그 테이블 · 큐 테이블.

의뢰인 세션으로 절대 못 하는 일(DB·서버 이중 강제): `verified`/`skipped`/`returned` 설정 · **verified/skipped에서 이탈** ·
`verify_result`·`verified_at`·`access_sent_at`·`remind_paused_until` 쓰기 · `notices`·`push_subscriptions`·`admins` 조회 · tick 호출 ·
비밀번호·매직링크 발급 · 종료된 프로젝트의 검증·도우미 호출 · 상태 토글로 내 폰 울리기(CAS + 전이 기반 dedupe + 60초 쿨다운 + 시간당 20건).

---

## 10. 위험과 하지 않기로 한 것

### 위험과 완화

| 위험 | 완화 |
|---|---|
| 크론이 조용히 죽는다 / 매번 도중에 죽는다 | started·finished 분리 배너 + P9 + **외부 heartbeat(Phase 1a)** + 모든 fetch 타임아웃 + 작업별 시간 예산. 화면 열림 경로(`reverifyStale`)는 이중화로 남긴다 |
| 푸시가 「보냈다」인데 폰에 안 뜬다 | ack 기준 배달 판정. 30분 무ack 다이제스트, 4시간 무ack 다른 채널 |
| claim 직후 크래시로 영구 침묵 | `claimed` 상태 + stale claim 청소 + 카드 빨강 |
| 리마인드 폭주·중복 발송 | 에폭 있는 dedupe_key + 종류별 상한 + 일일 상한 부분 유니크 인덱스. tick은 멱등 |
| 검증 동시 실행으로 중복 푸시 | CAS 저장 + 전이 기반 dedupe + `/api/verify` 쿨다운 + tick 어드바이저리 락 |
| 내 지연으로 의뢰인을 재촉 | Vercel·Supabase는 owner=admin 시작. 정지 조건 (e). 자동 재확인은 막힘 판정에 넣지 않는다 |
| 잘못된 원인 분류로 엉뚱한 재요청 | owner=client 즉시 되돌림은 GitHub 확정 코드 3개(+wrong_role) + GitHub check_invite 2h 유예(되돌리기 직전 강제 재확인 1회). wrong_role 문구는 즉시 작성하되(D7=A) 허용 role 집합 확정 전까지 끝에 「제가 역할을 한 번 더 확인하겠습니다」— 보내는 사람이 관리자라 오분류의 마지막 방어선은 카드 위의 사람이다 |
| 첫 접촉 실패 | 접속 정보는 카톡 하나(발송 채널 없음)·비밀번호 로그인 1순위. 링크는 프래그먼트 랜딩 + 유효시간 P11 대조. 실패 문구가 비밀번호 로그인으로 안내 |
| 관리자가 「보낼 카톡」을 안 본다 | 생성 즉시 푸시 + 4시간 적체 푸시 + 09:00 요약 건수 + P6 노랑. 포털 카드가 미러라 카톡이 늦어도 의뢰인 화면은 정확하다 |
| 카톡 답이 포털에 안 남는다 | §3 #18 수동 「옮겨 적기」 + 24h 미답 질문 재푸시. 자동 수집 없음(N4) |
| 리마인드 오탐(결제 대기·합의된 일정·연휴) | 정지 조건 7개 + 보류 스위치 + 결제 단계 제외 + 주말 보류(공휴일은 확인 필요) |
| 사전 점검이 정상 운영을 막음 | 빨강 범위를 P1~P4·P8 형식으로 고정. 알림 인프라는 노랑 |
| 철 지난 문구를 보낸다 | tick 거둠(`condition_cleared`)·대체(`superseded`)·카드에 만든 시각·주제당 1건 |
| 토큰 권한 상승 | D5=B 확정. 검증 토큰은 read:org·읽기 전용 유지 |
| 새 컬럼이 의뢰인 쓰기 가능으로 열림 | allow-list 가드 |
| 의뢰인이 verified 단계를 되돌려 카운트 오염 | 가드 + RLS USING 이탈 금지 |
| 로그·장부·푸시에 비밀 값 유출 | `redact()` + CI grep. detail은 관리자 전용 |
| Phase 1이 반쯤 된 채 다음 의뢰를 맞음 | 1a/1b 분할. 1a만으로도 "3시간 몰랐다"·토큰 사고·첫 접속 실패는 막힌다 |
| Vercel Hobby로 내려가면 크론 일 1회 | Pro 유지 전제를 CLAUDE.md §2에 명시 |

### 하지 않기로 한 것
카카오톡 자동 발송 · Anthropic/Resend/Solapi API 검증 · 의뢰인 조직 키 저장 · 알림 큐·재시도 워커·워크플로 엔진·감사 로그 ·
**실패 행 재시도·묶음 문구** · **의뢰인에게 직접 보내는 메일·문자·알림톡** · 받은편지함·카톡 답장 자동 수집 · 사전 점검 우회 버튼 · **GitHub 초대 API 자동 수락** ·
**support_tier 자동 변경** · **48h 미로그인 자동 재발송** · Supabase 프로젝트 API 생성(3건 전) · 캘린더 연동 · 비밀번호 재설정 폼 ·
DNS 자동 검증 · 두 번째 크론 · 두 번째 jsonb 컬럼 · 공용 PAT의 종료 시 폐기 · 쿼리 파라미터형 매직링크.

### 이번 개정에서 닫은 「확인 필요」 (근거 URL)
- Vercel `GET /v5/user/tokens/{tokenId}`의 `tokenId="current"` = 현재 요청을 인증한 토큰, 응답 `token.expiresAt` — 확인, https://vercel.com/docs/rest-api/authentication/get-auth-token-metadata (Vercel 문서 검색 도구로 원문 확인)
- Supabase `V1OrganizationMemberResponse` required = `user_id, user_name, role_name, mfa_enabled, avatar_url`; `email`은 선택 — 확인, https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/spec/api_v1_openapi.json (원본 파싱)
- Supabase `GET /v1/projects/{ref}/config/auth` 응답에 `mailer_otp_exp`(integer) — 확인, 같은 OpenAPI 원본 (P11의 근거)
- Supabase 조직 멤버 삭제 v1 엔드포인트 없음 — 확인, 같은 원본(`/v1/organizations/{slug}/members`는 GET만)
- Supabase Email OTP 만료 "An expiry duration of more than 86400 seconds (one day) is disallowed", "This is configurable via Auth > Providers > Email > Email OTP Expiration", 매직링크와 OTP는 같은 구현 — 확인, https://supabase.com/docs/guides/auth/auth-email-passwordless (Supabase 문서 도구로 원문). 기본값 3600은 검색 요약 인용(원문은 SharedData 변수로 감춤)
- 메일 프리페치가 토큰을 소비("The root cause: Email prefetching") — 확인, https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0
- Vercel Cron: 프로덕션 배포에서만 활성("Deploy … to the production environment to activate"), `vercel crons run`은 "already deployed to production" 잡만, CRON_SECRET은 `Authorization: Bearer` 비교 — 확인, https://vercel.com/docs/cron-jobs/quickstart, https://vercel.com/docs/cli/crons, https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Vercel 멤버 응답 `role` enum 8종 — 심사관 확인 인용(vercel.com/docs/rest-api/sdk/teams/list-team-members), 직접 재확인 못 함

### 여전히 「확인 필요」 (구현 전 실호출·원문으로 닫을 것)
1. GitHub `PATCH /user/memberships/orgs/{org}`의 classic 스코프명 — REST OpenAPI 원본 설명에 없음(확인). D5=B라 구현에 영향 없음
2. GitHub·Supabase 계정 이메일을 API로 대조하는 방법
3. Vercel Cron 실패 재시도 없음·중복 호출 가능의 공식 문구(인용) — 설계는 어느 쪽이든 견디게 했다
4. 카카오톡 링크 미리보기 스크래퍼가 URL 프래그먼트를 서버로 보내지 않는가(HTTP 표준상 프래그먼트는 전송되지 않음 — 실측 1회로 닫는다)
5. `vercel crons run`이 CRON_SECRET 헤더를 붙이는가 — 안 붙이면 curl 경로만 수용 기준
6. Supabase 보안 어드바이저의 OTP 만료 1시간 초과 경고 여부(D15)
7. Vercel 「내가 받은 초대 목록」 API 존재 여부 — 있으면 `await_admin_first`를 `pending_accept`/`check_invite`로 자동 분리 가능
8. GitHub·Vercel 초대 만료 7일(인용) · Anthropic 초대 만료 기본값 · Developer 개인 키로 `/v1/organizations/me` 200 여부
9. 공휴일 판정(토·일 제외로 시작)
10. Vercel `MEMBER` 역할이 검증·배포에 충분한가 / Supabase 허용 `role_name` 집합(D7)
11. fine-grained PAT 「수락 전용」이 의뢰인 조직에 대해 성립하는가(N6 — 성립해도 채택 안 함)

---

## 11. 심사 반영 기록

번호는 심사 지적 순서. 「반영」은 어디에 어떻게, 「부분」은 무엇을 받고 무엇을 달리했는지.

| # | 지적 | 처리 | 어떻게 / 왜 |
|---|---|---|---|
| 1 | 24h 매직링크가 Supabase 기본 설정·메일 스캐너와 충돌 | **반영** | M14 신설: `/auth/link#token_hash=…` 프래그먼트 랜딩 + 버튼 클릭 후 `verifyOtp`. D15(86400 설정) + `MAGIC_LINK_TTL_HOURS` + P11이 `mailer_otp_exp`를 실제로 읽어 대조(OpenAPI 원본으로 엔드포인트 확인). 안내문은 비밀번호 1순위. CLAUDE.md §6 각주(§6 표). 보안 어드바이저 경고는 확인 필요 10-6 |
| 2 | `notices` "큐 아님"과 재시도·묶음 발송의 모순 | **반영** | 재계산 모델로 통일(M2): 실패 행은 장부, 다음 tick이 새 키(에폭·회차)로 재claim. `next_attempt_at`·`attempts`·재시도 인덱스 삭제. credentials는 액션 안 동기 발송, 실패 시 재계산 제외(비밀번호는 응답에만). 묶음 발송 삭제 → skipped + 포털 카드. §12 문구 개정 |
| 3 | P5 푸시·P8 동일 이메일 빨강이 정상 운영을 막음 | **반영** | M3 빨강을 P1~P4 + P8 형식/관리자 동일로 한정. P5·P9 노랑 + urgent 칩 + 테스트 알림. P8 타 프로젝트 동일 → 노랑 「두 번째 프로젝트인가요?」. 빨강 목록을 CLAUDE.md §8에 고정. 수용 기준 수정 |
| 4 | Phase 1 노력 과소 추정 | **반영** | §8: 1a(3~4일)/1b(4~5일)로 분할, 합계 7~10일. `runTick(now)` 순수 함수 + 로컬 curl 수용 기준 추가. `ko.ts`·375px를 1b 범위에 명시 |
| 5 | 확인 필요 3건이 공식 스펙으로 닫힘 | **반영** | Vercel `role`(인용)·Supabase `role_name`/`email` 선택(원본 확인)·`tokens/current`(원문 확인)를 §4-3·M4·S4·D10에 반영. email 없음 → `error(field_missing)`. env는 Supabase 1개로. D7 문구를 「허용 role 집합 확정」으로 |
| 6 | Vercel·Supabase check_invite = 내 수락 대기인데 owner=client | **반영** | 코드 `await_admin_first`(owner=admin) 신설(§4-3). 재요청·returned는 관리자 「안 왔음」 후에만. 24h 재알림 + 만료 D-2. 의뢰인 문구 「초대를 보내셨다면 제가 수락하는 중입니다」. GitHub만 404=초대 없음 |
| 7 | not_found 3회를 tick 백오프가 채움 → 오분류 | **반영** | `attempts`를 `client_attempts`(의뢰인 클릭)와 `auto_checks`(자동)로 분리. 막힘 판정은 `client_attempts`·returned 횟수만. support_tier 자동 변경 삭제 → 칩 「assisted 전환 제안」(S10·N7) |
| 8 | 첫 접촉을 gmail 자동 메일로, 카톡 격하 | **반영** | 위저드 마지막 단계 「카톡 안내문 복사」 필수(복사 시각 = `access_sent_at`). 메일은 「카톡으로 드린 안내와 같습니다」 첫 줄로 병행. 48h 자동 재발송 삭제 → 칩. D13(메일에 비밀번호 제외, 권장 B). §4-4 모순 정리: 첫 자동 메일은 「연결 확인」 **→ 3판: 메일 부분은 「보낼 카톡」 문구로 대체(#26)** |
| 9 | 「24h 링크」 전제가 코드·설정에 없음 | **반영** | #1과 통합. P11 신설(Management API `mailer_otp_exp` 대조 — 실제로 읽을 수 있음을 원본에서 확인). `ko.login.errorAuth` 문구를 비밀번호 로그인 안내로 |
| 10 | 3일 리마인드 정지 조건 부족·스누즈 없음 | **반영** | 정지 조건 (e) owner=admin client_done 존재 (f) 7일 내 코멘트/미답 질문 (g) `remind_paused_until` 컬럼 + 「3일/7일/날짜」 칩 추가. 결제 단계(connect-vercel·anthropic) 1차는 메일 대신 칩 「결제 부담 여부 통화」 |
| 11 | 관리자 1인칭 detail이 의뢰인에게 노출·문구가 CX 원칙 위반 | **반영** | 규칙: `detail`은 관리자·로그 전용, `connect-flow.tsx` 231~234 삭제, `code → ko.stepDetail.verifyCode` 매핑만(§4-3, §11-17). 표의 의뢰인 문구를 원칙대로 재작성(personal_account·check_invite 등). 「아직」 제거 |
| 12 | returned의 진행률 회수·표시 정의 없음 | **반영** | 라벨 「한 가지만 더」/관리자 「되돌림」, `calcProgress` returned=0.5, 작업기록 문장·금지 어휘, 홈 카드 구성(§4-1). D3 갱신 |
| 13 | 하루 1통 상한이 즉시성 메일까지 미룸 | **반영** | 상한을 종류별로: reminder 계열만 하루 1통·주말 보류. credentials·rerequest #1·next_step·admin_replied는 즉시(단계·code당 하루 1통). 묶음 없음(§4-4, M10, Phase 2 수용 기준 수정) **→ 3판: 메일 부분은 「보낼 카톡」 문구로 대체(#26)** |
| 14 | 답글 메일 본문 미포함·답장 처리 미정의 | **반영** | 답글 메일에 본문 전문(M10·S8). D14 신설(권장 A: 「답장하셔도 됩니다 — 옮겨 적습니다」 + 수동 항목 §3 #18). N4에 답장 자동 수집 금지 명시 **→ 3판: 메일 부분은 「보낼 카톡」 문구로 대체(#26)** |
| 15 | 「doing 48시간」이 실제로 발화하지 않음 | **반영** | S11: 「만들었습니다」·slug 저장 시 서버가 `doing` 기록(의뢰인 허용 전이 안). 신호를 「slug 저장 후 48h 완료 요청 없음」으로 재정의, 자동 메일 아닌 칩만(§4-1, §6 §9) |
| 16 | 안전망이 같은 채널(푸시)만 봄, sent≠배달 | **반영** | `acked_at` + `/api/push/ack` + `last_ack_at`(M8). 안전망 조건을 「30분 내 ack 없음」으로(M9). 4시간은 다른 채널 — L3 외부 heartbeat를 Phase 1a must로 승격(D16), Phase 2부터 관리자 본인 메일 |
| 17 | claim = sent라 claim 직후 실패가 영구 침묵 | **반영** | `status default 'claimed'` + `claimed_at`, 성공 시 sent, tick이 10분 넘은 claimed를 `failed(stale_claim)`로, 카드 빨강. 수용 기준 「인위적 throw → 15분 내 failed」 추가(§9 DDL, M1 ④) |
| 18 | (=#6) Vercel·Supabase check_invite owner 문제 + 초대 만료 | **반영** | #6과 통합. 만료 D-2(5일째) 재알림을 pending_accept·await_admin_first·await_admin_ack에 공통 적용. 초대 만료 7일은 인용(확인 필요 10-8). Vercel 초대 목록 API는 확인 필요 10-7 |
| 19 | 검증 락 없음 → 중복 푸시, /api/verify 무제한 | **반영** | CAS 저장(`checked_at` 비교), 전이 기반 dedupe 키, `/api/verify` 60초 쿨다운 + 의뢰인 트리거 푸시 첫 1회만, tick 어드바이저리 락(§4-3 규칙, Phase 1a 범위·수용 기준) |
| 20 | D5 GitHub 자동 수락 스코프가 admin:org/repo | **반영(결론)·부분(사실)** | D5=B 확정, 「실측 후 A」 삭제, S5 → N6, `invitation` 딥링크. 다만 스코프명은 GitHub REST OpenAPI 원본 설명에 없어(직접 파싱) 「admin:org 또는 repo」를 사실로 적지 않고 확인 필요로 남겼다 — 결론은 어느 후보든 동일 |
| 21 | credentials를 after()/tick에서 보내면 폴백·재시도 불가 | **반영·부분** | 동기 발송 + 실패 시 복사 카드 폴백은 채택(M10, §4-2). `retryable` 컬럼과 「같은 행 3회 재시도」는 채택하지 않음 — #2의 재계산 모델과 충돌하고, 재생성 가능한 종류는 다음 tick이 새 키로 다시 계산하므로 같은 행 갱신이 필요 없다. 모델을 하나만 둔다 |
| 22 | heartbeat를 첫 단계에서 찍음·슬롯 게이트·타임아웃 부재 | **반영** | started/finished 분리 + 「완주 못 함」 빨강, 모든 fetch `AbortSignal.timeout(8000)` + 작업 예산, 토큰 점검은 `last_token_check_at` 기준·요약은 `daily:{KST 날짜}` 키 부재 기준, `timingSafeEqual` 길이 선비교, curl 수용 기준 + CLI 헤더 확인 필요(M1) |
| 23 | 의뢰인이 verified/skipped에서 이탈 가능 | **반영** | 가드 트리거 `old.status in ('verified','skipped') → 예외` + RLS USING `status not in (…)` 이중 강제(§9 DDL, M7). 회귀 목록에 추가. `returned → client_done`은 유지 |
| 24 | dedupe_key 에폭 부재·90일 정리 충돌·일일 상한 | **반영·부분** | 키 규칙에 에폭 필수(M2, §11-14). 90일 정리는 휘발성 kind만, 리마인드 계열은 closed cascade로만. 일일 상한은 `(project_id, kind, to_addr, day_kst)` 부분 유니크 인덱스 — 단 `at time zone` 식은 IMMUTABLE이 아니라 인덱스에 못 쓰므로 앱이 계산한 `day_kst date` 컬럼을 둔다(지적과 구현 방식만 다름) |
| 25 | (=#3) 사전 점검 하드 차단 범위 | **반영** | #3과 통합. 수용 기준 「P5 노랑 + 할 일 칩, 발급 가능」으로 수정 |
| 27 | (3판 심사·UX) 비밀번호가 있는 [복사]와 access_sent_at 을 쓰는 [보냈음]이 분리돼 「보냈음」이 상습 누락 | **반영** | 버튼 하나 [카톡으로 보내기] = 공유/복사 성공 = sent. credentials 는 pending 없이 발급 화면에서 즉시 sent, 미발송은 칩(M10, §3 #4·#20) |
| 28 | (3판 심사·CX) credentials 카드의 「(발급 화면에 표시)」 자리표시가 재발급 함정 | **반영** | credentials 카드를 pending 으로 두지 않는다(#27). 장부 본문은 마스킹, 화면은 발급 시 1회 |
| 29 | (3판 심사·UX) 같은 사건에 푸시 2~4번(사건 푸시 + 생성 푸시 + 적체 + 요약) | **반영** | 사건 푸시가 나간 문구는 조용히 생성. tick 자발 생성(2h 재요청)만 푸시. 적체는 하루 1회(M10) |
| 30 | (3판 심사·UX·CX) 거둠 조건이 사건 열거식 · 「의뢰인 로그인」이 현행 코드에선 「페이지 열림」 | **반영** | kind 별 술어로 재정의(§4-4): next_step 은 접속·다음 단계 시작, rerequest 는 단계 상태·원인 코드, admin_replied 는 read_at |
| 31 | (3판 심사·UX) 적체 푸시·즉시 작성 kind 에 조용 시간 없음 | **반영** | 문구 생성 푸시·적체 푸시는 09~21시 KST 에만. 의뢰인 행동 푸시(완료·막힘·질문)는 즉시 유지 — 그것은 내가 원하는 알림이다 |
| 32 | (3판 심사·UX) /a 4층 적층 · P6 칩 자기참조 | **반영·부분** | P6 칩 삭제(상태 카드 노랑만). 카드는 0건이면 숨김, 최근 처리는 접힘. 4층 자체는 유지 — 「보낼 카톡」이 최상단인 것이 이 화면의 목적이다 |
| 33 | (3판 심사·UX) 폰에서 복사→앱 전환→붙여넣기 3동작 | **반영** | `navigator.share`(폰) → 공유 창에서 카톡 선택. PC 는 복사 |
| 34 | (3판 심사·CX) 카톡 마지막 줄 「이 카톡으로 답 주셔도 됩니다」가 포털 「여기에 남겨 주세요」와 충돌 · admin_replied 전문이 8줄 상한과 충돌 · §11 #8 잔재 | **반영** | 고정 마지막 줄 삭제 — 재요청은 「화면공유 20분」, 답글 알림은 「포털에서도 보실 수 있어요」로 끝난다. 길이 상한은 admin_replied(전문)·credentials 를 명시적 예외로 둔다. #8 은 #27 로 대체 |
| 35 | (3판 심사·데이터) 일일 상한 부분 유니크 인덱스 충돌은 `on conflict (dedupe_key)` 가 흡수하지 않는다 | **반영** | 23505 → duplicate 로 처리(M2). Phase 2 reminder 는 삽입 전 건수 확인 |
| 36 | (3판 심사·CX) next_step 카드가 「지금 포털에 있는 의뢰인」에게도 만들어져 tick 거둠 전에 보내질 수 있다 | **반영** | 최근 15분 내 접속한 프로젝트에는 next_step 을 만들지 않는다(포털이 이미 보여준다) |
| 37 | (Phase 2 심사·자동화) 전이 조건 「의뢰인 단계 전부 verified」는 기본 템플릿(「도메인 연결」이 「개발 진행」 뒤)에서 절대 참이 되지 않는다 | **반영** | 조건 = 첫 제작자 단계 앞 의뢰인 단계 전부 verified/skipped **+ 범위 확정**. `onboardingClientSteps()` 하나를 전이·다음 단계 문구·리마인드가 같이 읽는다. 사건 핸들러에서만 부른다(tick 에 두면 사람의 되돌림과 싸운다) |
| 38 | (Phase 2 심사·자동화) 관리자 「확인 완료로」가 다음 안내 문구를 만들지 않아 프로젝트마다 2회(범위 확인·도메인) 빠진다 · 수동 단계 확인이 단계 탭 2~3클릭 | **반영** | `adminSetStepStatus(verified)` → `onStepVerified('admin')`. 「현재 상황」에 수동 단계 완료 요청 행 [확인 완료로][대기로 되돌리기]. 범위 확정은 「작업 범위 확인」 단계도 함께 verified |
| 39 | (Phase 2 심사·관리자) 「연결 확인됨」 푸시가 존재하지 않는 카드를 가리킨다(의뢰인이 직접 완료해 즉시 확인된 흔한 경우) | **반영** | 문구를 먼저 만들고 푸시가 「카드 있음/보낼 것 없음」을 말한다. url 도 카드가 있을 때만 `/a#outbox` |
| 40 | (Phase 2 심사·의뢰인) GitHub check_invite 는 카톡이 2h 에 나가는데 포털은 48h 동안 「하실 일 없음」 | **반영** | 2h 에 강제 재확인 후 returned + 재요청 카드를 한 사건으로. 48h 규칙 삭제 |
| 41 | (Phase 2 심사·규칙) 리마인드 「3일째 그대로」의 기준 시각이 없다 · 개발 기간 내내 「도메인 연결」 재촉 · 보류 해제 뒤 같은 키로 막힘 | **반영** | `stallSince` 정의(§4-4) · 대상은 onboarding 의 첫 제작자 단계 앞 의뢰인 단계 · 에폭에 보류 해제 시각 포함 |
| 42 | (Phase 2 심사·규칙) returned 가 재검증·거둠에서 빠지고, 원인이 내 쪽으로 바뀌어도 「한 가지만 더」가 남는다 · 재완료해도 에폭이 그대로라 재요청이 중복 키로 사라진다 | **반영** | tick·화면 재확인에 returned 포함 · owner=admin 으로 바뀌면 `client_done` 역전이(일시 오류로는 안 움직임) · 의뢰인 재완료는 새 사이클(에폭 리셋) · 「대기로 되돌리기」는 verify_result 도 비움 |
| 43 | (Phase 2 심사·관리자) 같은 사실(안 왔음 → 의뢰인 재확인)이 칩·2탭 패널·배지·카드에 중복 | **반영·부분** | 2탭 패널은 「안 왔음」 처리된 행을 그리지 않는다(행동이 없다). 같은 단계의 재요청·리마인드 카드는 종류를 넘어 1장(supersede). 칩·배지·카드는 각자 화면이 달라 유지 |
| 44 | (Phase 2 심사·규칙) 선택 단계가 인수인계 뒤에 붙어 순서 기반 자동화가 어긋난다 · 의뢰인 이메일 수정이 접근 목록을 안 따라간다 | **반영** | 「개발 진행」 앞 삽입(생성·추가 모두) · 아직 접속 안 한 게스트 행만 새 이메일로 |
| 45 | (Phase 2 심사·의뢰인) 확인 카드가 원인 문장만 주고 누를 것이 없다 · 완료를 거듭 눌러도 화면공유가 승격되지 않는다 | **반영** | check_invite/wrong_role 확인 카드에 [이메일 복사]·[초대 화면 열기]·역할 이름 · `client_attempts ≥ 2` 면 화면공유 버튼 1순위 |
| 46 | (Phase 2 심사) 위저드 2화면화 · 09:00 요약과 다이제스트 겹침 · 보류 칩 없음 · assisted 첫 화면 없음 · closed 카드 거둠 충돌 · 24h 미답 재푸시 · 결제 프리셋 칩 · 배지 side | **반증·이미 반영** | 작업 트리에 이미 있거나(위저드·보류 칩·assisted 카드·배지 side·delivered 카드) 전제가 코드와 다름(다이제스트는 08시, 미답은 매일 재알림). 결제 프리셋은 「화면공유로 도움받기」가 타이핑 없는 탈출구라 보류 |
| 47 | (Phase 2 코드 검토) 「안 왔음」 되돌림이 옛 에폭을 유지해, 다음 tick 의 정체 리마인드가 방금 만든 「초대 확인 부탁」 카드를 덮어쓴다 | **반영** | `ackInvite(안 왔음)` 이 `first_failed_at` 을 그 시각으로 새로 잡는다 — 되돌림은 새 원인 사이클이다 |
| 48 | (Phase 2 코드 검토) 리마인드 카드 거둠이 「단계가 움직였는가」만 보고 정지 조건을 다시 보지 않는다 — 방금 질문한 의뢰인에게 「막힌 곳 없으신지」를 보내게 된다 | **반영** | 정지 조건 a~h 를 `reminderStopReason()` 순수 함수(`todo.ts`)로 빼서 문구 작성(`remindStalled`)과 카드 거둠(`sweepOutbox`)이 같이 읽는다. 거둠에는 (h) 「카드 생성 뒤 의뢰인 접속」을 더한다(작성 조건에는 넣지 않는다 — 들어와서 방치하는 경우가 리마인드의 대상이다) |
| 49 | (Phase 2 코드 검토) 관리자 「확인 완료로」가 제작자 단계(개발 진행·인수인계)에도 「연결이 확인됐습니다」 카톡 문구를 만든다 | **반영** | `owner_side === 'client'` 일 때만 다음 안내 문구를 만든다 |
| 50 | (Phase 2 코드 검토) 상태를 바꾸는 검증 저장이 `verify_result.checked_at` 만 CAS 해 의뢰인의 「막혔어요」·내 「확인 완료로」를 덮어쓸 수 있다 | **반영** | 상태를 바꾸는 쓰기는 읽은 시점의 `status` 도 함께 CAS |
| 51 | (Phase 2 코드 검토) 되돌림 역전이가 내 쪽 *오류*(토큰 만료)에도 일어나 포털 문구가 깜빡인다 | **반영** | 역전이는 `not_found` + owner=admin 일 때만 — 일시 오류로는 어느 방향으로도 움직이지 않는다 |
| 52 | (Phase 2 코드 검토) 주소를 저장해도 `returned` 단계는 즉시 재확인되지 않아 「주소 부탁」 문구가 최대 24시간 남는다 | **반영** | `saveOrgSlug` 의 즉시 재확인 대상에 `returned` 포함 |
| 53 | (Phase 2 코드 검토) 리마인드 기준 시각이 의뢰인의 최근 활동(다른 단계 완료 요청)·건너뛴 직전 단계를 보지 않아 활동 중인 의뢰인에게 문구가 만들어진다 | **반영** | `stallSince` 후보에 「의뢰인 단계의 마지막 완료 요청 시각」과 「직전 의뢰인 단계의 확인·건너뜀 시각」 추가. 아직 아무도 손대지 않은 `todo` 단계의 `updated_at` 은 쓰지 않는다(선택 단계 삽입처럼 내가 행을 건드리기만 해도 시계가 초기화된다) |
| 54 | (Phase 2 코드 검토) 정지 조건 (d) 가 이미 확인·건너뛴 단계의 낡은 오류까지 세어 리마인드를 영구 정지시킨다 · 범위 문서가 없는데 「작업 범위 확인」을 재촉한다 | **반영** | 정지 판정은 열린 단계만 본다 · `scope_md` 가 비어 있으면 그 단계는 건너뛴다 |
| 55 | (Phase 2 코드 검토) 같은 분에 링크 두 개를 고정하면 두 번째 안내가 조용히 사라진다 · 위저드 미리보기 순서가 실제 생성 순서와 다르다 · 의뢰인 이메일 수정 시 게스트 행 충돌을 삼킨다 · 「수락했는데 안 보임」 칩 시간이 재확인마다 초기화된다 | **반영** | 링크 카드 키에 링크 id · 생성 순서를 `plannedSteps()` 하나로 서버·미리보기가 공유 · 23505 이면 옛 게스트 행 삭제 · 수락 시각(`admin_first_ack_at`)을 기록해 그 기준으로 센다 |
| 56 | (Phase 2 코드 검토) 포털 홈 되돌림 카드가 화면에 없는 「위 이메일」을 가리킨다 | **반영** | 홈 전용 문장(`verifyCodeHome`)을 두고 단계 화면의 버튼을 가리킨다 |
| 57 | (실제 운영 사고 09-11) 「작업 범위 확인」이 확인되자 「의뢰인 쪽 작업은 여기까지입니다. 이제 제가 개발을 시작합니다」 문구가 만들어졌다 — Supabase·Claude 단계가 아직 끝나지 않았는데도 | **반영** | 다음 단계를 「방금 확인한 단계보다 뒤」에서만 찾던 것을 고쳤다. 뒤에 없으면 앞쪽에 미뤄 둔 단계로 돌아가고, 남은 것이 전부 완료 요청(내 확인 대기)이면 「남은 단계는 제가 확인하고 있습니다」로 말한다. 「여기까지입니다」는 온보딩 의뢰인 단계가 하나도 안 남았을 때만 |
| 58 | (실제 운영 사고 09-11) 원인 코드가 없는 수동 초대 단계(기능 도입 전 접수된 완료 요청)는 「왔음/안 왔음」 2탭이 뜨지 않아 단계 탭에서만 처리할 수 있었다 | **반영** | 2탭 판정에 「수동 초대 단계(`ADMIN_ACK_KEYS`)이면서 원인 코드가 비어 있음」을 더했다 |
| 26 | (사용자 결정 09-10) 의뢰인에게 전할 메시지는 개발자 대시보드에 표시하고, 발송은 관리자가 카톡으로 직접 | **반영(3판)** | Gmail SMTP·nodemailer·P6(메일)·D13·D14 삭제, D1=D·D7=A·D8=B 종결, M10을 「보낼 카톡」(`notices.channel='outbox'` + `/a` 카드 + 템플릿 9종)으로 교체, §4-4에 거둠·대체 규칙 신설, Phase 1a에 최소판 포함(템플릿 3종), D17(관리자 본인용 2차 채널) 신설. CLAUDE.md §2·§6의 「메일 발송 없음」은 완화하지 않고 유지한다 |

총평 중 별도 지적: 「공휴일 미고려」는 확인 필요 10-9로 유지(토·일 제외 시작). 「Gmail 일일 한도 수치」는 3판에서 메일 채널과 함께 사라졌다(확인 필요 10-4는 카톡 미리보기 항목으로 교체).
