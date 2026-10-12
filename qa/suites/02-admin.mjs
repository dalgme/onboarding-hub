// 관리 화면 — 새 프로젝트 · 접속 정보 발급(사전 점검 게이트) · 게스트 · 링크 · 범위 · 선택 단계 · 단계 테이블 · 상태 전이 · 지금 할 일
import { ko } from "../../src/content/ko.ts";
import { OFFBOARD_CHECKLIST } from "../../src/lib/offboard.ts";
import {
  APP, ADMIN_EMAIL, GUEST_EMAIL, DAY, HOUR, iso,
  createProject, findAuthUser, updateAuthUser, seedPushSubscription, rest, notices, qa, setStep, tick,
  adminPage, guestPage, newContext, login, bodyText, waitFor, clipboardText,
  go,
} from "../lib/harness.mjs";

void OFFBOARD_CHECKLIST;

export default async function run({ browser, t }) {
  const admin = await adminPage(browser);
  const page = admin.page;
  page.on("dialog", (dialog) => dialog.accept());

  // P1 새 프로젝트 화면 — 사전 점검: 알림 기기·크론이 아직 없으면 노랑(발급은 막지 않음), 갖춰지면 초록
  await go(page, `${APP}/a/new`);
  const yellowText = await bodyText(page);
  t.ok("P1 알림 기기 없음·크론 미완주는 노랑 (빨강 아님)", yellowText.includes(ko.admin.preflight.pushNoDevice) && yellowText.includes(ko.admin.preflight.cronStale) && yellowText.includes(ko.admin.preflight.yellowHint), yellowText.slice(0, 200));
  await seedPushSubscription({ lastAckAt: iso() });
  await tick(iso());
  await go(page, `${APP}/a/new`);
  t.includes("P1b 알림 기기 + 크론 완주 뒤 「발급 조건을 모두 충족」", await bodyText(page), ko.admin.preflight.allClear);

  // P2 생성: AI 없음 + 선택 단계 supabase-pro
  await page.fill("#code", "acme");
  await page.fill("#name", "Acme 쇼핑몰");
  await page.fill("#clientName", "김의뢰");
  await page.fill("#clientEmail", GUEST_EMAIL);
  await page.selectOption("#supportTier", "self");
  await page.uncheck('input[name="includeAi"]');
  await page.check('input[name="optionalKeys"][value="supabase-pro"]');
  const previewText = await bodyText(page);
  t.includes("P2 미리보기에 AI 단계가 「건너뜀」으로", previewText, `Claude(AI) 계정 만들고 초대하기 — ${ko.status.step.skipped}`);
  await page.getByRole("button", { name: ko.admin.form.create }).click();
  await page.waitForURL(/\/a\/acme\?tab=settings/, { timeout: 15000 });
  t.ok("P2b 생성 뒤 설정 탭으로 이동", true);
  const steps = await rest.get("steps", { order: "order_index.asc" });
  const keys = steps.map((step) => step.key);
  t.eq(
    "P2c 단계 순서 — 선택 단계는 첫 제작자 단계 앞",
    keys,
    ["connect-github", "connect-vercel", "connect-supabase", "connect-anthropic", "anthropic-service-account", "scope-review", "supabase-pro", "build", "domain", "handover"],
  );
  t.eq("P2d AI 없는 의뢰: Claude 초대·서비스 계정이 함께 건너뜀", steps.filter((s) => s.status === "skipped").map((s) => s.key), ["connect-anthropic", "anthropic-service-account"]);
  const project = await rest.one("projects", { code: "eq.acme" });
  const guests = await rest.get("project_guests", { project_id: `eq.${project.id}` });
  t.eq("P2e 의뢰인 이메일이 접근 목록에 (소문자)", guests.map((g) => g.email), [GUEST_EMAIL]);

  // P3 중복 코드
  await go(page, `${APP}/a/new`);
  await page.fill("#code", "acme");
  await page.fill("#name", "x");
  await page.fill("#clientName", "y");
  await page.fill("#clientEmail", "other@qa.local");
  await page.getByRole("button", { name: ko.admin.form.create }).click();
  await page.getByText(ko.admin.form.codeDuplicate).waitFor({ timeout: 10000 });
  t.ok("P3 중복 코드 → 「이미 사용 중인 코드」", true);

  // P4 목록
  await go(page, `${APP}/a`);
  const listText = await bodyText(page);
  t.ok("P4 대시보드 목록에 프로젝트와 /코드", listText.includes("Acme 쇼핑몰") && listText.includes("/acme"));
  t.includes("P4b 지금 할 일: 접속 안내 아직 안 보냄", listText, ko.admin.todo.accessNotSent);
  t.includes("P4c 지금 할 일: 범위 미작성", listText, ko.admin.todo.scopeMissing);

  // P5 접속 정보 발급 → 카톡으로 보내기 (장부에는 비밀번호 없는 본문)
  await go(page, `${APP}/a/acme?tab=settings`);
  t.includes("P5 설정 탭 안내: 다음은 접속 정보 발급", await bodyText(page), ko.admin.form.nextIssue);
  await page.getByRole("button", { name: ko.admin.password.issue }).first().click();
  const message = await waitFor(async () => {
    const pre = await page.locator("pre").first().textContent().catch(() => null);
    return pre && pre.includes(GUEST_EMAIL) ? pre : null;
  }, { label: "안내문 생성" });
  const password = /([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})/.exec(message)?.[1] ?? null;
  t.ok("P5b 안내문에 포털 주소·이메일·임시 비밀번호(4-4-4)", message.includes(`${APP}/p/acme`) && Boolean(password), message.slice(0, 160));
  const authUser = await findAuthUser(GUEST_EMAIL);
  t.eq("P5c 인증 사용자 생성 + 임시 비밀번호 표시", authUser?.user_metadata?.must_change_password, true);
  await page.getByRole("button", { name: ko.admin.password.sendKakao }).click();
  await page.getByText(ko.admin.password.sentJustNow).waitFor({ timeout: 10000 });
  t.ok("P5d 「카톡으로 보내기」 → 보냈음 기록 안내", true);
  const copied = await clipboardText(page);
  t.ok("P5e 클립보드에 안내문(비밀번호 포함)", copied.includes(password));
  const credentials = await waitFor(async () => (await notices({ kind: "eq.credentials" }))[0] ?? null, { label: "credentials 장부" });
  t.ok("P5f 장부 credentials 는 sent 이고 본문에 비밀번호가 없다", credentials.status === "sent" && !credentials.body.includes(password) && credentials.body.includes(ko.outbox.credentialsBodyMasked), credentials.body);
  const projectAfter = await rest.one("projects", { code: "eq.acme" });
  t.ok("P5g projects.access_sent_at 기록", Boolean(projectAfter.access_sent_at));
  await go(page, page.url());
  t.ok("P5h 설정 탭에 「보냈음」 시각 표시 (다음 안내는 사라짐)", !(await bodyText(page)).includes(ko.admin.form.nextIssue));

  // P6 의뢰인이 임시 비밀번호로 로그인 → 새 비밀번호 화면
  {
    const context = await newContext(browser);
    const guest = await context.newPage();
    await login(guest, GUEST_EMAIL, password);
    await guest.waitForURL(/\/account\/password/, { timeout: 10000 }).catch(() => null);
    t.eq("P6 발급한 임시 비밀번호로 로그인 → 새 비밀번호 화면", new URL(guest.url()).pathname, "/account/password");
    await context.close();
  }

  // P7 사전 점검 빨강 = 발급 차단 (우회 없음) — 의뢰인 이메일이 관리자 이메일과 같은 경우(캐시 없는 즉시 판정)
  await rest.update("projects", { code: "eq.acme" }, { client_email: ADMIN_EMAIL });
  await go(page, `${APP}/a/acme?tab=settings`);
  const blockedText = await bodyText(page);
  t.includes("P7 의뢰인 이메일 = 관리자 이메일 → 「접속 정보를 만들 수 없다」", blockedText, ko.admin.password.blockedTitle);
  t.includes("P7b 사유 문장", blockedText, ko.admin.preflight.clientEmailIsAdmin);
  t.ok("P7c 발급·링크 버튼 비활성 (우회 버튼 없음)", await page.getByRole("button", { name: ko.admin.password.issue }).first().isDisabled() && await page.getByRole("button", { name: ko.admin.magicLink.title }).first().isDisabled());
  await rest.update("projects", { code: "eq.acme" }, { client_email: GUEST_EMAIL });
  await go(page, `${APP}/a/acme?tab=settings`);
  t.ok("P7d 이메일을 고치면 다시 발급 가능", !(await page.getByRole("button", { name: ko.admin.password.issue }).first().isDisabled()));

  // P8 게스트 추가·삭제
  await go(page, `${APP}/a/acme?tab=settings`);
  await page.fill(`input[placeholder="${ko.login.emailPlaceholder}"]`, "second@qa.local");
  await page.getByRole("button", { name: ko.admin.form.addGuest }).click();
  await waitFor(async () => (await rest.get("project_guests", { email: "eq.second@qa.local" })).length === 1, { label: "게스트 추가" });
  t.ok("P8 접근 이메일 추가", true);
  await go(page, page.url());
  const row = page.locator("li", { hasText: "second@qa.local" }).first();
  await row.getByRole("button", { name: ko.common.delete }).click();
  await waitFor(async () => (await rest.get("project_guests", { email: "eq.second@qa.local" })).length === 0, { label: "게스트 삭제" });
  t.ok("P8b 접근 이메일 삭제", true);

  // P9 링크 — 고정하면 포털 상단 큰 버튼 + 「링크 안내」 카톡
  await go(page, `${APP}/a/acme?tab=links`);
  await page.fill("#link-label", "미리보기");
  await page.fill("#link-url", "https://preview.example.com/");
  await page.check('input[name="isPinned"]');
  await page.getByRole("button", { name: ko.common.add }).click();
  await waitFor(async () => (await rest.get("links")).length === 1, { label: "링크 추가" });
  const linkCard = await waitFor(async () => (await notices({ kind: "eq.link_pinned" }))[0] ?? null, { label: "link_pinned 카드" });
  t.ok("P9 고정 링크 추가 → 「링크 안내」 카드(pending)에 주소", linkCard.status === "pending" && linkCard.body.includes("https://preview.example.com/"), linkCard.body);
  await updateAuthUser(GUEST_EMAIL, { user_metadata: { must_change_password: false } });
  {
    const context = await newContext(browser);
    const guest = await context.newPage();
    await login(guest, GUEST_EMAIL, password);
    const portal = await bodyText(guest);
    t.ok("P9b 포털 상단에 고정 링크 큰 버튼", portal.includes(`${ko.portal.workUrlButton} — 미리보기`), portal.slice(0, 200));
    await context.close();
  }
  await go(page, page.url());
  await page.getByRole("button", { name: ko.admin.links.unpin }).first().click();
  await waitFor(async () => (await rest.one("links", {}))?.is_pinned === false, { label: "고정 해제" });
  t.ok("P9c 고정 해제", true);

  // P10 범위 — 저장 → 확정 → scope-review 확인 완료 + 「범위 안내」 카드
  await go(page, `${APP}/a/acme?tab=scope`);
  await page.fill("textarea", "# 범위\n\n- 회원가입\n- 시험 응시");
  await page.getByRole("button", { name: ko.common.save, exact: true }).click();
  await page.getByText(ko.common.saved).waitFor({ timeout: 10000 });
  t.ok("P10 범위 저장", (await rest.one("projects", { code: "eq.acme" })).scope_md.includes("시험 응시"));
  await page.getByRole("button", { name: ko.admin.scope.agree }).click();
  await waitFor(async () => Boolean((await rest.one("projects", { code: "eq.acme" })).scope_agreed_at), { label: "범위 확정" });
  const scopeStep = await rest.one("steps", { project_id: `eq.${project.id}`, key: "eq.scope-review" });
  t.eq("P10b 범위 확정 = 「작업 범위 확인」 단계 확인 완료", scopeStep.status, "verified");
  const scopeCard = await waitFor(async () => (await notices({ kind: "eq.scope_ready" }))[0] ?? null, { label: "scope_ready 카드" });
  t.ok("P10c 「범위 안내」 카드 생성 (포털 주소 포함)", scopeCard.body.includes(`${APP}/p/acme`), scopeCard.body);

  // P11 선택 단계 추가 → 첫 제작자 단계 앞 + 「새 단계 안내」 카드
  await go(page, `${APP}/a/acme?tab=steps`);
  await page.getByRole("button", { name: "Resend(메일 발송) 계정 만들고 초대하기" }).click();
  const added = await waitFor(async () => (await rest.get("steps", { project_id: `eq.${project.id}`, key: "eq.connect-resend" }))[0] ?? null, { label: "선택 단계 추가" });
  const after = await rest.get("steps", { project_id: `eq.${project.id}`, order: "order_index.asc" });
  const buildIndex = after.find((s) => s.key === "build").order_index;
  t.ok("P11 Resend 단계가 「개발 진행」 바로 앞에, 뒤 단계는 한 칸씩 밀림", added.order_index === buildIndex - 1 && new Set(after.map((s) => s.order_index)).size === after.length);
  const stepAddedCard = await waitFor(async () => (await notices({ kind: "eq.step_added" }))[0] ?? null, { label: "step_added 카드" });
  t.ok("P11b 「새 단계 안내」 카드에 단계 주소", stepAddedCard.body.includes(`${APP}/p/acme/steps/connect-resend`), stepAddedCard.body);
  await page.locator("button", { hasText: "Resend(메일 발송) 계정 만들고 초대하기" }).waitFor({ state: "hidden", timeout: 10000 }).catch(() => null);
  t.ok("P11c 추가된 단계 버튼은 목록에서 사라진다", !(await page.locator("button", { hasText: "Resend(메일 발송) 계정 만들고 초대하기" }).count()));

  // P12 단계 테이블 — 확인 완료로 / 대기로 되돌리기 (의뢰인이 접속 중이 아니면 「확인됐습니다·다음」 카드)
  await rest.update("project_guests", { project_id: `eq.${project.id}` }, { last_seen_at: iso(-2 * HOUR) });
  const githubRow = page.locator("tr", { hasText: "GitHub 조직 만들고 초대하기" }).first();
  await githubRow.getByRole("button", { name: ko.admin.steps.markVerified }).click();
  await waitFor(async () => (await rest.one("steps", { project_id: `eq.${project.id}`, key: "eq.connect-github" })).status === "verified", { label: "확인 완료로" });
  const nextCard = await waitFor(async () => (await notices({ kind: "eq.next_step", status: "eq.pending" }))[0] ?? null, { label: "next_step 카드" });
  t.ok("P12 「확인 완료로」 → 「연결 확인 · 다음 안내」 카드에 다음 단계 제목", nextCard.body.includes("Vercel 팀 만들고 초대하기"), nextCard.body);
  await go(page, page.url());
  await page.locator("tr", { hasText: "GitHub 조직 만들고 초대하기" }).first().getByRole("button", { name: ko.admin.steps.reset }).click();
  const resetStep = await waitFor(async () => {
    const step = await rest.one("steps", { project_id: `eq.${project.id}`, key: "eq.connect-github" });
    return step.status === "todo" ? step : null;
  }, { label: "대기로 되돌리기" });
  t.ok("P12b 「대기로 되돌리기」 → todo, 확인 결과·시각 비움", resetStep.verify_result === null && resetStep.checked_at === null && resetStep.verified_at === null);

  // P13 건너뜀 연동 + 상태 전이 (두 번째 프로젝트)
  const beta = await createProject({ code: "beta", name: "Beta", clientEmail: "beta@qa.local", tier: "self", includeAi: true, scopeMd: "범위", scopeAgreedAt: iso(-DAY) });
  await go(page, `${APP}/a/beta?tab=steps`);
  await page.locator("tr", { hasText: "Claude(AI) 계정 만들고 초대하기" }).first().getByRole("button", { name: ko.admin.steps.markSkipped }).click();
  await waitFor(async () => (await rest.one("steps", { project_id: `eq.${beta.project.id}`, key: "eq.anthropic-service-account" })).status === "skipped", { label: "같이 건너뜀" });
  t.ok("P13 Claude 초대를 건너뛰면 서비스 계정 단계도 함께 건너뜀", true);
  for (const key of ["connect-github", "connect-vercel", "connect-supabase"]) {
    await setStep(beta.byKey[key].id, { status: "verified", verified_at: iso() });
  }
  await go(page, page.url());
  await page.locator("tr", { hasText: "작업 범위 확인" }).first().getByRole("button", { name: ko.admin.steps.markVerified }).click();
  const betaAfter = await waitFor(async () => {
    const row = await rest.one("projects", { code: "eq.beta" });
    return row.status === "building" ? row : null;
  }, { label: "building 전이" });
  t.eq("P13b 온보딩 의뢰인 단계 전부 끝 + 범위 확정 → building", betaAfter.status, "building");
  const statusPush = await notices({ kind: "eq.verify_event", dedupe_key: "like.project_status:%" });
  t.ok("P13c 상태 전이 푸시 장부 1건", statusPush.length === 1 && statusPush[0].dedupe_key.includes(":building:"));
  await setStep(beta.byKey.handover.id, { status: "verified", verified_at: iso() });
  await go(page, page.url());
  await page.locator("tr", { hasText: "개발 진행" }).first().getByRole("button", { name: ko.admin.steps.markVerified }).click();
  const delivered = await waitFor(async () => {
    const row = await rest.one("projects", { code: "eq.beta" });
    return row.status === "delivered" ? row : null;
  }, { label: "delivered 전이" });
  t.eq("P13d 인수인계 확인 → delivered", delivered.status, "delivered");
  const deliveredCard = await waitFor(async () => (await notices({ kind: "eq.closed", project_id: `eq.${beta.project.id}` }))[0] ?? null, { label: "전달 완료 카드" });
  t.ok("P13e 「전달 완료 안내」 카드 생성", deliveredCard.status === "pending");

  // P14 지금 할 일 칩 — 막힘·도움 요청·안 읽은 질문
  await setStep(beta.byKey.domain.id, { status: "blocked", blocked_reason: "need_help" });
  await rest.insert("comments", { project_id: beta.project.id, step_id: null, author_side: "client", kind: "question", body: "질문입니다" });
  await go(page, `${APP}/a`);
  const dash = await bodyText(page);
  t.includes("P14 칩: 화면공유 요청", dash, ko.admin.todo.needHelp(1));
  t.includes("P14b 칩: 안 읽은 질문", dash, ko.admin.todo.unread(1));
  t.includes("P14c 목록의 «안 읽음» 배지", dash, ko.comments.unreadBadge(1));
  await go(page, `${APP}/a/beta?tab=steps`);
  t.includes("P14d 단계 탭에 막힌 사유 「화면공유 도움 요청」", await bodyText(page), ko.stepDetail.needHelpReason);
  // P15 토큰 오류 — 설정 탭 경고(즉시) + 대시보드 빨강(즉시) + 발급 차단(사전 점검 캐시 60초 뒤)
  await qa.scenario({ github: { token: "invalid" } });
  await go(page, `${APP}/a/acme?tab=settings`);
  t.includes("P15 설정 탭에 토큰 경고(「검증 토큰이 아직 준비되지 않았다」)", await bodyText(page), ko.admin.health.issueWarning.slice(0, 20));
  await go(page, `${APP}/a`);
  const healthText = await bodyText(page);
  t.includes("P15b 대시보드 GitHub 토큰 「토큰 오류」", healthText, `GitHub ${ko.admin.health.statuses.invalid}`);
  await new Promise((resolve) => setTimeout(resolve, 61_000)); // 사전 점검 토큰 캐시(60초) 만료 대기
  await go(page, `${APP}/a/acme?tab=settings`);
  const tokenBlocked = await bodyText(page);
  t.includes("P15c 토큰 오류는 접속 정보 발급을 막는다", tokenBlocked, ko.admin.password.blockedTitle);
  t.includes("P15d 사유에 변수 이름 GITHUB_TOKEN", tokenBlocked, "GITHUB_TOKEN");
  t.ok("P15e 발급 버튼 비활성", await page.getByRole("button", { name: ko.admin.password.issue }).first().isDisabled());
  await qa.scenario({ github: { token: "ok" } });
  await go(page, `${APP}/a`);
  t.includes("P15f 복구하면 대시보드는 바로 초록", await bodyText(page), `GitHub ${ko.admin.health.statuses.ok}`);
  void guestPage;
  await admin.context.close();
}
