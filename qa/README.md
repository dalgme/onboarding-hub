# qa/ — 브라우저 검수 하네스

실제 Supabase·GitHub·Vercel·Anthropic·푸시 서비스에 **한 번도 닿지 않고** 허브 전체 흐름을 브라우저로 검수한다.
기능을 바꾸면 `qa/run.sh` 를 돌리고, 새 흐름에는 스위트를 보탠다. (이전 하네스가 임시 디렉터리에만 있다가
컨테이너 재시작으로 사라진 뒤 저장소 안으로 옮겼다 — 여기 있는 것만 살아남는다.)

## 실행

```bash
qa/run.sh                    # 빌드 → 모의 서버 → 앱 → 전 스위트
qa/run.sh portal tick        # 이름이 맞는 스위트만
qa/run.sh --no-build auth    # 직전 검수 빌드 재사용 (앱 코드가 그대로일 때)
qa/dev.sh up && qa/dev.sh suites 03   # 서버를 띄워 둔 채 스위트만 반복 (디버깅)
qa/dev.sh down
```

전제: Node ≥ 22.18 (스위트가 `src/content/ko.ts`·`src/lib/steps.ts` 를 그대로 import 한다 — 문구가 바뀌면 검수도 따라간다),
pnpm, Chromium(`qa/` 의 playwright 가 설치한다. 안 되면 `cd qa && npx playwright install chromium`).
전부 돌리면 5분 안팎. 결과는 `✅/❌` 한 줄씩, 끝에 스위트별 합계. 실패가 있으면 종료 코드 1.

## 어떻게 생겼나

```
qa/
  run.sh            전체 실행기 (빌드·서버·스위트·정리)      dev.sh  서버만 띄워 두기
  env.qa            검수용 환경변수 — 전부 가짜 값. NEXT_PUBLIC_* 는 빌드에 박히므로 빌드도 이 env 로 한다
  intercept.cjs     앱 프로세스 프리로드 — 바깥으로 나가는 fetch/https.request/DNS MX 를 모의 서버로 돌린다
  mock/
    server.mjs      :54321 — /auth/v1 (GoTrue 흉내) · /rest/v1 (PostgREST 흉내) · /__ext/<host> (외부 API) · /__qa (제어)
    db.mjs          메모리 테이블 + PostgREST 의미론(select·임베드·필터·order·count·upsert·single) + RLS·가드 트리거 흉내
    auth.mjs        비밀번호 로그인·토큰 갱신·관리자 API·매직링크(1회성)
    external.mjs    GitHub·Vercel·Supabase 관리 API·heartbeat·푸시 서비스 — 시나리오 JSON 하나가 응답을 정한다
  lib/
    harness.mjs     스위트 공용: 결과 기록 · 모의 서버 제어 · service_role REST · 고정 데이터 · 로그인 · tick · 대기
    run.mjs         스위트 실행기
  suites/
    01-auth         로그인 실패/관리자/의뢰인/로그아웃/임시 비밀번호 강제 변경/접근 없는 계정/1회용 링크(프래그먼트·1회성)
    02-admin        새 프로젝트(스택 선택·선택 단계 순서) · 사전 점검(노랑/초록/빨강=발급 차단) · 접속 정보 발급(장부에 비밀번호 없음)
                    · 게스트 · 링크 고정 · 범위 확정 · 선택 단계 추가 · 단계 테이블 · building/delivered 전이 · 지금 할 일 칩
    03-portal       계정 연결 스텝퍼 · slug 정규화 · 검증 3상태(의뢰인에게 error 는 「제작자 확인 중」) · 2탭(왔음/안 왔음)
                    · 되돌림(한 가지만 더) · 재요청 카드 · 수동 단계 자기확인 · 막혔어요 · 화면공유 · 질문·요청 · assisted · 쿨다운
    04-tick         tick 인증/완주/heartbeat · 토큰 전환 푸시 · 백오프 재확인 · 카드 거둠 · GitHub 2시간 재요청 · claimed 청소
                    · 리마인드(창·일일 상한·2회·정지 조건) · 09:00 요약 · 다이제스트 · 내 차례 재알림 · 보낼 카톡 버튼 3개
    05-offboard     종료 체크리스트 순서 강제 · 접근 회수(다른 프로젝트 의뢰인은 남김) · 종료 뒤 열람 전용·API 403·카드 거둠
    06-mobile       375px — 가로 넘침 없음 · 하단 고정 버튼 44px · 도우미 버튼 겹침 없음
    07-api          푸시 ack/구독 권한 · 클라이언트 오류 보고 · 도우미 비활성 · 실제 web-push 전송(TTL·topic) · 죽은 구독 정리
```

## 원리

- **앱은 운영 빌드(`next start`) 그대로** 돈다. 다른 점은 환경변수(`env.qa`)와 프리로드(`intercept.cjs`) 뿐이다.
  `NEXT_PUBLIC_SUPABASE_URL` 이 루프백이면 `/api/cron/tick?now=` 시각 주입을 받는다 — 리마인드 창·09:00 요약처럼
  시각에 매인 판정을 벽시계와 무관하게 재현하기 위해서다(운영 DB 주소는 절대 루프백이 아니다).
- **모의 Supabase 는 RLS 까지 흉내 낸다.** 의뢰인 세션으로 `verified` 를 쓰면 가드 트리거가 막고, 관리자만 보는 테이블은
  의뢰인에게 0행이다. 그래서 「서버 액션이 의뢰인 클라이언트로 금지 컬럼을 쓰는」 회귀를 잡는다. 다만 흉내일 뿐이다 —
  정책 SQL 자체의 검수는 Supabase 에서 한다.
- **외부 API 는 시나리오로 조종한다.** `qa.scenario({ github: { membership: "not_invited" } })` 처럼 스위트 안에서 바꾼다.
  기본값은 전부 초록(`mock/external.mjs` 의 `DEFAULT_SCENARIO`).
- **푸시는 실제로 보낸다.** `seedPushSubscription()` 이 진짜 P-256 키로 구독을 만들고, web-push 가 암호화해 보낸 요청을
  모의 푸시 서비스가 받는다(201/410/400 시나리오). 장부(`notices`)의 sent/failed 와 죽은 구독 삭제까지 검수된다.
- **스위트마다 모의 서버를 초기화한다**(`/__qa/reset`). 스위트 사이에 상태가 새지 않는다.

## 스위트 쓰는 법

```js
export default async function run({ browser, t }) {
  const fx = await createProject({ code: "acme", tier: "self" });   // 템플릿 단계까지 채운 프로젝트
  const { page } = await guestPage(browser);                          // 의뢰인으로 로그인된 페이지
  await go(page, "/p/acme/steps/connect-github");                     // 이동 (스트리밍 redirect 까지 기다린다)
  await qa.scenario({ github: { membership: "active" } });
  t.ok("라벨", 조건, 실패 시 보여줄 값);  t.eq("라벨", 실제, 기대);  t.includes("라벨", 본문, 문구);
}
```

- 화면 문구는 `ko` 에서 가져온다 (`ko.stepDetail.doneButton`). 하드코딩하지 않는다.
- 데이터는 `rest.*`(service_role) 로 심고 읽는다. `notices()` 는 장부 조회.
- 비동기 후처리(`after()`·푸시)는 `waitFor()` 로 기다린다.
- 사전 점검의 토큰 상태는 60초 캐시된다 — 토큰 시나리오를 바꾼 뒤 발급 차단을 보려면 61초 기다려야 한다(02-admin P15).

## 하지 않는 것

실제 외부 서비스 호출 · 실제 Supabase(정책 SQL·마이그레이션 적용은 여기서 검수하지 않는다) · 도우미(Anthropic) 응답 품질 ·
서비스워커 실제 알림 표시(브라우저 UI) · 메일.
