# 온보딩 허브 라이트

지인·소규모 의뢰용 온보딩 관리 도구. 의뢰받은 웹서비스를 의뢰인 명의 계정
(GitHub Org / Vercel Team / Supabase Org)에 귀속시키는 절차를, 의뢰인과 함께
한 화면에서 보며 완주한다. 설계 원칙과 범위는 [CLAUDE.md](./CLAUDE.md) 참고.

- `/a` — 나(관리자): 프로젝트 목록·단계·링크·범위·설정·종료
- `/p/[code]` — 의뢰인(손님): 링크 보드 + 진행률 + 단계별 안내
- `/cost` — 월 고정비 계산기 (정적)

## 스택

Next.js App Router · TypeScript strict · Tailwind + shadcn 스타일 컴포넌트 ·
Supabase (서울 리전) · Supabase Auth 매직링크 · React Hook Form + Zod ·
react-markdown + rehype-sanitize · Vercel · pnpm

## 처음 설정

1. **Supabase 프로젝트 생성** — 리전은 반드시 `ap-northeast-2` (서울).
2. **마이그레이션 적용** — `supabase/migrations/`를 Supabase CLI 또는
   대시보드 SQL 편집기로 실행.
3. **관리자 등록** — `supabase/seed.sql`의 이메일을 본인 이메일로 바꿔 1회 실행.
4. **Auth 설정** (Supabase 대시보드)
   - 매직링크(OTP) 만료: **24시간**
   - 커스텀 SMTP에 Resend 연결 (SPF·DKIM·DMARC 필수)
   - Site URL·Redirect URL에 배포 주소와 `/auth/callback` 등록
5. **환경변수** — `.env.example`을 `.env.local`로 복사해 채운다.
   `SUPABASE_SERVICE_ROLE_KEY` 등 서버 전용 키에 `NEXT_PUBLIC_` 접두를 붙이지
   않는다.
6. **안내 스크린샷** — `public/guides/`에 커밋한다
   (`github-org.png`, `vercel-team.png`, `supabase-org.png` 등).

## 개발

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck
pnpm build
```

## 운영 흐름

1. `/a/new`에서 프로젝트 생성 → 온보딩 단계가 템플릿(`src/lib/steps.ts`)에서
   복사되고, 의뢰인 이메일이 포털 접근 목록에 등록된다.
2. 의뢰인은 `/login`에서 등록된 이메일로 매직링크 로그인 → `/p/[code]`.
3. 계정 연결 단계는 만들기 → 이름 알려주기 → 초대 → 연결 확인 순서의
   미니 스텝퍼로 진행. 검증은 `/api/verify/[type]`이 실제 멤버십을 확인해
   서버에서 기록한다 (`verified` / `not_found` / `error` 3상태).
4. 종료는 `/a/[code]` 종료 탭의 체크리스트를 위에서부터 순서대로 —
   **토큰 폐기가 멤버 탈퇴보다 먼저다.**
