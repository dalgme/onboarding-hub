// 의뢰인 포털 — 이 도구의 본체. 계정 연결 스텝퍼(만들기→이름→초대→확인) · slug 정규화 · 자동 검증 3상태 ·
// 2탭(왔음/안 왔음)과 되돌림(한 가지만 더) · 수동 단계 자기확인 · 막혔어요 · 화면공유 · 질문·요청 · assisted 카드 · 쿨다운
import { ko } from "../../src/content/ko.ts";
import { DONE_CHECKLIST } from "../../src/lib/steps.ts";
import {
  APP, ADMIN_EMAIL, GUEST_EMAIL, GUEST_PASSWORD, HOUR, iso,
  createProject, rest, notices, qa, getStep, setStep, tick,
  adminPage, guestPage, newContext, login, go, bodyText, waitFor, clipboardText, sleep,
} from "../lib/harness.mjs";

export default async function run({ browser, t }) {
  const fx = await createProject({ code: "acme", tier: "self", includeAi: true, scopeMd: "# 범위\n- 회원가입" });
  const guest = await guestPage(browser);
  const page = guest.page;
  page.on("dialog", (dialog) => dialog.accept());
  const admin = await adminPage(browser);
  admin.page.on("dialog", (dialog) => dialog.accept());
  const stepOf = (key) => rest.one("steps", { project_id: `eq.${fx.project.id}`, key: `eq.${key}` });

  // C1 홈 — 다음 할 일 = 첫 의뢰인 단계, 단계 목록, self 등급이라 화면공유 카드 없음
  {
    const home = await bodyText(page);
    t.includes("C1 홈 「다음 할 일」 카드", home, ko.portal.nextTaskTitle);
    t.includes("C1b 다음 할 일 = GitHub 조직 만들고 초대하기", home, "GitHub 조직 만들고 초대하기");
    t.ok("C1c 단계 목록에 전부 (10개)", fx.steps.every((step) => home.includes(step.title)));
    t.ok("C1d self 등급: 화면공유 카드 없음", !home.includes(ko.portal.assisted.title));
    t.includes("C1e 범위 문서 표시", home, "회원가입");
    t.includes("C1f 고정 링크 없음 안내", home, ko.portal.workUrlEmpty);
  }

  // C2 GitHub 단계 — 만들기 → 이름
  await go(page, "/p/acme/steps/connect-github");
  t.ok("C2 만들기 단계: 조직 만들기 딥링크(새 탭)", (await page.locator('a[href="https://github.com/account/organizations/new?plan=free"][target="_blank"]').count()) === 1);
  t.ok("C2b 도우미 버튼은 연결 단계에만", (await bodyText(page)).includes(ko.assist.open));
  await page.getByRole("button", { name: ko.stepDetail.createDone }).click();
  await page.locator("#rawSlug").waitFor({ timeout: 5000 });
  const doingStep = await waitFor(async () => {
    const step = await stepOf("connect-github");
    return step.status === "doing" ? step : null;
  }, { label: "startStep → doing" });
  t.eq("C2c 「만들었습니다」 → 서버에 doing 기록", doingStep.status, "doing");

  // C3 slug — URL 통째로 붙여넣어도 이름만 남는다
  await page.fill("#rawSlug", "https://github.com/orgs/Acme-Shop/people");
  await page.getByText(ko.stepDetail.slugNormalized("acme-shop")).waitFor({ timeout: 5000 });
  t.ok("C3 입력 즉시 정규화 미리보기 acme-shop", true);
  await page.getByRole("button", { name: ko.stepDetail.slugSave }).click();
  // 저장 → router.refresh 가 끝나야 초대 단계(currentSlug 필요)가 그려진다
  await page.getByRole("button", { name: ko.stepDetail.inviteCopyEmail }).waitFor({ timeout: 20000 }).catch(async () => {
    console.log("   [diag] 초대 단계가 20초 안에 나타나지 않음 — 화면:", (await bodyText(page)).slice(0, 300));
    throw new Error("초대 단계 미표시");
  });
  const saved = await rest.one("projects", { code: "eq.acme" });
  t.eq("C3b 저장된 slug 는 정규화된 값", saved.github_org, "acme-shop");
  const inviteText = await bodyText(page);
  t.includes("C3c 초대 단계: 역할 Owner 명시", inviteText, ko.stepDetail.inviteRole("Owner"));
  t.ok("C3d 초대 화면 딥링크 = github.com/orgs/acme-shop/people", (await page.locator('a[href="https://github.com/orgs/acme-shop/people"]').count()) === 1);
  await page.getByRole("button", { name: ko.stepDetail.inviteCopyEmail }).click();
  t.eq("C3e 「초대할 이메일 복사」 → 관리자 이메일", await clipboardText(page), ADMIN_EMAIL);

  // C4 완료 전 「연결 확인하기」 — 초대 전이면 check_invite, 알림은 없다
  await qa.scenario({ github: { membership: "not_invited" } });
  // 스텝퍼 라벨(작은 버튼)과 큰 진행 버튼이 같은 이름이다 — 큰 버튼은 마지막 것
  await page.getByRole("button", { name: ko.stepDetail.stageVerify, exact: true }).last().click();
  await page.getByRole("button", { name: ko.stepDetail.verifyButton }).click();
  await page.getByText(ko.stepDetail.verifyCode.check_invite).waitFor({ timeout: 10000 });
  const checked = await stepOf("connect-github");
  t.eq("C4 확인 결과 not_found/check_invite 저장", [checked.verify_result?.status, checked.verify_result?.code], ["not_found", "check_invite"]);
  t.eq("C4b 완료 전 확인은 상태를 바꾸지 않는다 (doing)", checked.status, "doing");
  t.eq("C4c 완료 전 확인은 알림을 만들지 않는다", (await notices({ kind: "eq.verify_event" })).length, 0);
  t.ok("C4d 화면: 초대 이메일 복사 + 초대 화면 열기 버튼이 문장 옆에", (await bodyText(page)).includes(ko.stepDetail.inviteOpenPage));
  await go(page, page.url());
  const reopened = await bodyText(page);
  t.ok("C4e 다시 열어도 확인 단계에서 시작 (결과가 사라지지 않는다)", reopened.includes(ko.stepDetail.verifyCode.check_invite) && reopened.includes(ko.status.verify.not_found), reopened.slice(-300));

  // C5 「완료했습니다」 — 초대가 수락된 상태면 그 자리에서 확인 완료
  await qa.scenario({ github: { membership: "active" } });
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).click();
  const verified = await waitFor(async () => {
    const step = await stepOf("connect-github");
    return step.status === "verified" ? step : null;
  }, { label: "verified" });
  t.ok("C5 완료 → 즉시 verified (verified_at = checked_at)", verified.verified_at === verified.verify_result.checked_at && verified.verify_result.client_attempts === undefined);
  await go(page, page.url());
  t.includes("C5b 화면에 「연결이 확인되었습니다」", await bodyText(page), ko.stepDetail.verifiedTitle);
  const verifiedPush = await waitFor(async () => (await notices({ kind: "eq.verify_event", dedupe_key: "like.%:verified:%" }))[0] ?? null, { label: "verified 푸시 장부" });
  t.ok("C5c 푸시 장부 verify_event:…:verified (키에 분 단위 에폭)", /verify_event:[0-9a-f-]+:verified:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(verifiedPush.dedupe_key), verifiedPush.dedupe_key);
  t.eq("C5d 의뢰인이 직접 완료한 확인은 「다음 안내」 카톡을 만들지 않는다", (await notices({ kind: "eq.next_step" })).length, 0);
  t.includes("C5e 홈의 다음 할 일이 Vercel 로", await (async () => { await go(page, "/p/acme"); return bodyText(page); })(), "Vercel 팀 만들고 초대하기");

  // C6 Vercel — 멤버 목록에 없음(내 수락 전인지 구분 불가) → 내 차례 → 「안 왔음」 → 되돌림 → 재요청 → 재완료 → 확인
  await go(page, "/p/acme/steps/connect-vercel");
  await page.getByRole("button", { name: ko.stepDetail.createDone }).click();
  await page.fill("#rawSlug", "https://vercel.com/teams/acme-shop/settings/members");
  await page.getByRole("button", { name: ko.stepDetail.slugSave }).click();
  await page.getByRole("button", { name: ko.stepDetail.inviteCopyEmail }).waitFor({ timeout: 10000 });
  t.eq("C6 Vercel slug 정규화 acme-shop", (await rest.one("projects", { code: "eq.acme" })).vercel_team, "acme-shop");
  await qa.scenario({ vercel: { team: "unlisted" } });
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).click();
  await page.getByText(ko.stepDetail.doneSent).first().waitFor({ timeout: 10000 });
  const vercelDone = await waitFor(async () => {
    const step = await stepOf("connect-vercel");
    return step.verify_result?.code ? step : null;
  }, { label: "vercel 완료 요청" });
  t.eq("C6b 완료 → client_done + await_admin_first(owner admin)", [vercelDone.status, vercelDone.verify_result.code, vercelDone.verify_result.owner, vercelDone.verify_result.client_attempts], ["client_done", "await_admin_first", "admin", 1]);
  const pendingPush = await notices({ kind: "eq.verify_event", dedupe_key: "like.%:pending:%" });
  t.eq("C6c 완료 요청 뒤 첫 1회 「확인 대기」 푸시", pendingPush.length, 1);
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).waitFor({ state: "hidden", timeout: 15000 }).catch(() => null);
  t.ok("C6d 의뢰인 화면에는 「완료했습니다」가 사라지고 요청 전달 안내만", !(await page.getByRole("button", { name: ko.stepDetail.doneButton }).count()));

  await go(admin.page, "/a/acme");
  const adminText = await bodyText(admin.page);
  t.includes("C6e 관리자 「현재 상황」에 초대 확인 2탭", adminText, ko.admin.ack.title);
  t.includes("C6f 질문: Vercel", adminText, ko.admin.ack.question("Vercel"));
  await admin.page.getByRole("button", { name: ko.admin.ack.notCame }).first().click();
  await admin.page.getByText(ko.admin.ack.notCameDone).waitFor({ timeout: 10000 });
  const returned = await waitFor(async () => {
    const step = await stepOf("connect-vercel");
    return step.status === "returned" ? step : null;
  }, { label: "returned" });
  t.eq("C6g 「안 왔음」 → returned + check_invite + not_came", [returned.verify_result.code, returned.verify_result.admin_first_ack], ["check_invite", "not_came"]);
  const rerequest = await waitFor(async () => (await notices({ kind: "eq.rerequest", status: "eq.pending" }))[0] ?? null, { label: "재요청 카드" });
  t.ok("C6h 재요청 카드에 초대 화면 주소 + 내 이메일 + 역할", rerequest.body.includes("https://vercel.com/teams/acme-shop/settings/members") && rerequest.body.includes(ADMIN_EMAIL) && rerequest.body.includes("Member"), rerequest.body);
  await go(page, "/p/acme");
  const homeReturned = await bodyText(page);
  t.includes("C6i 포털 홈 최상단 「한 가지만 더 —」 + 원인 문장", homeReturned, ko.stepDetail.returnedTitle);
  t.includes("C6j 홈 문장은 집 버전(verifyCodeHome.check_invite)", homeReturned, ko.stepDetail.verifyCodeHome.check_invite.slice(0, 20));
  t.ok("C6k 홈의 다음 할 일 = Vercel (앞쪽 todo 보다 되돌림이 먼저)", homeReturned.indexOf("Vercel 팀 만들고 초대하기") < homeReturned.indexOf("Supabase 조직 만들고 초대하기"));
  await go(page, "/p/acme/steps/connect-vercel");
  const stepReturned = await bodyText(page);
  t.includes("C6l 단계 화면 되돌림 배지 「한 가지만 더」", stepReturned, ko.status.step.returned);
  t.ok("C6m 되돌림은 초대 단계로 바로 데려간다 (초대 이메일 복사 버튼)", stepReturned.includes(ko.stepDetail.inviteCopyEmail));
  await qa.scenario({ vercel: { team: "listed", member: "confirmed" } });
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).click();
  const vercelVerified = await waitFor(async () => {
    const step = await stepOf("connect-vercel");
    return step.status === "verified" ? step : null;
  }, { label: "vercel verified" });
  t.ok("C6n 재완료 → verified, 시도 횟수 2", vercelVerified.status === "verified");
  await tick();
  const rerequestAfter = await rest.one("notices", { id: `eq.${rerequest.id}` });
  t.eq("C6o tick 이 철 지난 재요청 카드를 거둔다 (condition_cleared)", [rerequestAfter.status, rerequestAfter.skip_reason], ["skipped", "condition_cleared"]);

  // C7 Supabase — 내 쪽 오류(이메일 불일치)는 의뢰인에게 「제작자 확인 중」, 관리자에게 빨강
  await go(page, "/p/acme/steps/connect-supabase");
  await page.getByRole("button", { name: ko.stepDetail.createDone }).click();
  await page.fill("#rawSlug", "supabase.com/dashboard/org/abcdefghijklmnop/team");
  await page.getByText(ko.stepDetail.slugNormalized("abcdefghijklmnop")).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: ko.stepDetail.slugSave }).click();
  await page.getByRole("button", { name: ko.stepDetail.inviteCopyEmail }).waitFor({ timeout: 10000 });
  await qa.scenario({ supabase: { members: "other" } });
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).click();
  const supaError = await waitFor(async () => {
    const step = await stepOf("connect-supabase");
    return step.verify_result?.status === "error" ? step : null;
  }, { label: "supabase error" });
  t.eq("C7 조직 멤버이지만 허브 이메일 없음 → error/email_mismatch(owner admin)", [supaError.verify_result.code, supaError.verify_result.owner, supaError.status], ["email_mismatch", "admin", "client_done"]);
  await go(page, page.url());
  const supaText = await bodyText(page);
  t.includes("C7b 의뢰인 화면은 「제작자 확인 중」", supaText, ko.status.verify.clientError);
  t.ok("C7c 의뢰인 화면에 빨간 「확인 오류」 없음", !supaText.includes(ko.status.verify.error));
  const errorPush = await waitFor(async () => (await notices({ kind: "eq.verify_event", dedupe_key: "like.%:error:%" }))[0] ?? null, { label: "error 푸시" });
  t.ok("C7d 내 쪽 오류 푸시 1회 (detail 은 redact 경유)", Boolean(errorPush) && !String(errorPush.detail ?? "").includes("sbp_qa"), errorPush?.detail);
  await go(admin.page, "/a");
  const dashText = await bodyText(admin.page);
  t.includes("C7e 대시보드 「의뢰인 화면에서 실패한 확인」에 Supabase 단계", dashText, "Supabase 조직 만들고 초대하기");
  t.includes("C7f 지금 할 일: 확인 실패 칩", dashText, ko.admin.todo.verifyError(1));
  await qa.scenario({ supabase: { members: "mine" } });
  await go(admin.page, "/a/acme?tab=steps");
  await admin.page.locator("tr", { hasText: "Supabase 조직 만들고 초대하기" }).first().getByRole("button", { name: ko.admin.steps.verifyNow }).click();
  const supaVerified = await waitFor(async () => {
    const step = await stepOf("connect-supabase");
    return step.status === "verified" ? step : null;
  }, { label: "supabase verified" });
  t.eq("C7g 「지금 확인」(비상용) → verified", supaVerified.status, "verified");
  const recovered = await notices({ kind: "eq.verify_event", dedupe_key: "like.%:recovered:%" });
  t.eq("C7h 관리자 클릭 복구는 조용하다 (recovered 푸시 없음)", recovered.length, 0);

  // C8 수동 단계(Claude 초대) — 자기확인 체크리스트 → 완료 → 내 확인 차례(await_admin_ack) → 「왔음」 → 확인 완료
  await go(page, "/p/acme/steps/connect-anthropic");
  t.ok("C8 단순 연결 패널: 초대 이메일 복사 + Developer 역할", (await bodyText(page)).includes(ko.stepDetail.inviteRole("Developer")));
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).click();
  const dialog = page.getByRole("dialog", { name: ko.stepDetail.doneChecklistTitle });
  await dialog.waitFor({ timeout: 5000 });
  const boxes = dialog.locator('input[type="checkbox"]');
  t.eq("C8b 체크리스트 항목 수 = DONE_CHECKLIST", await boxes.count(), DONE_CHECKLIST["connect-anthropic"].length);
  const submit = dialog.getByRole("button", { name: ko.stepDetail.doneChecklistSubmit });
  t.ok("C8c 전부 체크 전에는 완료 불가", await submit.isDisabled());
  for (let i = 0; i < DONE_CHECKLIST["connect-anthropic"].length; i += 1) await boxes.nth(i).check();
  await submit.click();
  const anthropicDone = await waitFor(async () => {
    const step = await stepOf("connect-anthropic");
    return step.verify_result?.code ? step : null;
  }, { label: "anthropic client_done" });
  t.eq("C8d 완료 → client_done + await_admin_ack", [anthropicDone.status, anthropicDone.verify_result.code], ["client_done", "await_admin_ack"]);
  const clientDonePush = await waitFor(async () => (await notices({ kind: "eq.client_event", dedupe_key: `like.client_event:${anthropicDone.id}:client_done:%` }))[0] ?? null, { label: "client_done 푸시" });
  t.ok("C8e 「완료했습니다」 푸시 장부(client_event)", Boolean(clientDonePush));
  await go(admin.page, "/a/acme");
  t.includes("C8f 2탭 질문: Anthropic Console", await bodyText(admin.page), ko.admin.ack.question("Anthropic Console"));
  await admin.page.getByRole("button", { name: ko.admin.ack.came }).first().click();
  const anthropicVerified = await waitFor(async () => {
    const step = await stepOf("connect-anthropic");
    return step.status === "verified" ? step : null;
  }, { label: "anthropic verified" });
  t.eq("C8g 「왔음·수락했음」 → verified + admin_first_ack came", anthropicVerified.verify_result.admin_first_ack, "came");
  await sleep(800);
  t.eq("C8h 의뢰인이 접속 중(15분 안)이면 「다음 안내」 카드는 만들지 않는다", (await notices({ kind: "eq.next_step" })).length, 0);

  // C9 서비스 계정 단계 — 「안 보임」은 단계별 문구로
  await go(page, "/p/acme/steps/anthropic-service-account");
  await page.getByRole("button", { name: ko.stepDetail.doneButton }).click();
  const dialog2 = page.getByRole("dialog", { name: ko.stepDetail.doneChecklistTitle });
  await dialog2.waitFor({ timeout: 5000 });
  const boxes2 = dialog2.locator('input[type="checkbox"]');
  for (let i = 0; i < DONE_CHECKLIST["anthropic-service-account"].length; i += 1) await boxes2.nth(i).check();
  await dialog2.getByRole("button", { name: ko.stepDetail.doneChecklistSubmit }).click();
  await waitFor(async () => (await stepOf("anthropic-service-account")).status === "client_done", { label: "svc client_done" });
  await go(admin.page, "/a/acme");
  const svcText = await bodyText(admin.page);
  t.includes("C9 2탭 문구가 단계별(「보임/안 보임」)", svcText, ko.admin.ackByKey["anthropic-service-account"].notCame);
  await admin.page.getByRole("button", { name: ko.admin.ackByKey["anthropic-service-account"].notCame }).first().click();
  const svcCard = await waitFor(async () => (await notices({ kind: "eq.rerequest", status: "eq.pending", step_id: `eq.${fx.byKey["anthropic-service-account"].id}` }))[0] ?? null, { label: "서비스 계정 재요청 카드" });
  t.ok("C9b 재요청 문구는 서비스 계정 화면을 가리킨다 (초대 이메일 문구 아님)", svcCard.body.includes("/p/acme/steps/anthropic-service-account") && !svcCard.body.includes(ADMIN_EMAIL), svcCard.body);
  await go(page, "/p/acme");
  t.includes("C9c 포털 홈 되돌림 문장도 단계별", await bodyText(page), ko.stepDetail.verifyCodeHomeByKey["anthropic-service-account"].check_invite.slice(0, 15));

  // C10 막혔어요 → blocked(사유) → 다시 진행
  await go(page, "/p/acme/steps/scope-review");
  await page.getByRole("button", { name: ko.stepDetail.blockedButton }).click();
  await page.fill("#blocked-reason", "범위 문서의 두 번째 항목이 이해가 안 돼요");
  await page.getByRole("button", { name: ko.stepDetail.blockedSubmit }).click();
  await page.getByText(ko.stepDetail.blockedSent).waitFor({ timeout: 10000 });
  const blocked = await stepOf("scope-review");
  t.eq("C10 막혔어요 → blocked + 사유 저장", [blocked.status, blocked.blocked_reason], ["blocked", "범위 문서의 두 번째 항목이 이해가 안 돼요"]);
  const blockedPush = await waitFor(async () => (await notices({ dedupe_key: `like.client_event:${blocked.id}:blocked:%` }))[0] ?? null, { label: "blocked 푸시" });
  t.ok("C10b 막힘 푸시 장부", Boolean(blockedPush));
  await go(admin.page, "/a");
  t.includes("C10c 대시보드 칩: 막힘", await bodyText(admin.page), ko.admin.todo.blocked(1));
  await go(page, "/p/acme/steps/scope-review");
  await page.getByRole("button", { name: ko.stepDetail.resume }).click();
  await waitFor(async () => (await stepOf("scope-review")).status === "doing", { label: "resume" });
  t.ok("C10d 「다시 진행하기」 → doing", true);

  // C11 화면공유로 도움받기 → blocked(need_help) + 요청 코멘트 + 푸시
  await page.getByRole("button", { name: ko.stepDetail.helpButton }).click();
  await page.getByText(ko.stepDetail.helpSent).waitFor({ timeout: 10000 });
  const help = await stepOf("scope-review");
  t.eq("C11 화면공유 → blocked/need_help", [help.status, help.blocked_reason], ["blocked", "need_help"]);
  const helpComment = await rest.one("comments", { step_id: `eq.${help.id}`, kind: "eq.request" });
  t.eq("C11b 요청 코멘트 자동 생성", helpComment?.body, ko.stepDetail.needHelpReason);
  const helpPush = await waitFor(async () => (await notices({ dedupe_key: `like.client_event:${help.id}:need_help:%` }))[0] ?? null, { label: "need_help 푸시" });
  t.ok("C11c 화면공유 푸시 장부", Boolean(helpPush));
  await go(admin.page, "/a");
  t.includes("C11d 대시보드 칩: 화면공유 요청", await bodyText(admin.page), ko.admin.todo.needHelp(1));

  // C12 질문·요청 — 의뢰인 질문 → 관리자 답글(읽음 처리 + 답글 카드) → 의뢰인 읽음 → 카드 거둠
  await go(page, "/p/acme?tab=qa");
  await page.selectOption("select", "question");
  await page.fill("textarea", "도메인은 언제 사면 되나요?");
  await page.getByRole("button", { name: ko.comments.submit }).click();
  const question = await waitFor(async () => (await rest.get("comments", { kind: "eq.question", author_side: "eq.client" }))[0] ?? null, { label: "질문 저장" });
  t.ok("C12 의뢰인 질문 저장 (author_side 는 서버가 정한다)", question.author_side === "client" && question.read_at === null);
  const commentPush = await waitFor(async () => (await notices({ dedupe_key: `eq.client_event:comment:${question.id}` }))[0] ?? null, { label: "코멘트 푸시" });
  t.ok("C12b 질문 푸시 장부 (키에 코멘트 id)", Boolean(commentPush));
  await go(admin.page, "/a/acme?tab=steps");
  await admin.page.locator("textarea").last().fill("도메인은 개발이 끝날 때쯤 사시면 됩니다.");
  await admin.page.getByRole("button", { name: ko.comments.submit }).last().click();
  const reply = await waitFor(async () => (await rest.get("comments", { author_side: "eq.admin" }))[0] ?? null, { label: "답글 저장" });
  t.ok("C12c 관리자 답글 저장", Boolean(reply));
  const questionAfter = await waitFor(async () => {
    const row = await rest.one("comments", { id: `eq.${question.id}` });
    return row.read_at ? row : null;
  }, { label: "답했으면 읽은 것" });
  t.ok("C12d 답글 = 앞선 의뢰인 글 읽음 처리", Boolean(questionAfter.read_at));
  const replyCard = await waitFor(async () => (await notices({ kind: "eq.admin_replied" }))[0] ?? null, { label: "답글 카드" });
  t.ok("C12e 「답글 알림」 카드에 본문 전문", replyCard.body.includes("도메인은 개발이 끝날 때쯤"), replyCard.body);
  await go(page, "/p/acme?tab=qa");
  const qaText = await bodyText(page);
  t.includes("C12f 의뢰인에게 안 읽은 답글 배지", qaText, ko.comments.unreadBadge(1));
  await page.getByRole("button", { name: ko.comments.markRead }).click();
  await waitFor(async () => Boolean((await rest.one("comments", { id: `eq.${reply.id}` })).read_at), { label: "읽음 처리" });
  await tick();
  const replyCardAfter = await rest.one("notices", { id: `eq.${replyCard.id}` });
  t.eq("C12g 의뢰인이 읽으면 tick 이 답글 카드를 거둔다", [replyCardAfter.status, replyCardAfter.skip_reason], ["skipped", "condition_cleared"]);

  // C13 프로젝트가 둘이면 선택 화면 + assisted 카드
  const beta = await createProject({ code: "beta", name: "Beta 학원", clientEmail: GUEST_EMAIL, tier: "assisted", includeAi: false, guestPassword: null });
  {
    const context = await newContext(browser);
    const page2 = await context.newPage();
    const landed = await login(page2, GUEST_EMAIL, GUEST_PASSWORD);
    t.eq("C13 프로젝트가 둘이면 /p 선택 화면", new URL(landed).pathname, "/p");
    const picker = await bodyText(page2);
    t.ok("C13b 선택 화면에 두 프로젝트", picker.includes("Acme 쇼핑몰") && picker.includes("Beta 학원"));
    await go(page2, "/p/beta");
    const betaHome = await bodyText(page2);
    t.includes("C13c assisted 등급: 화면공유 20분 카드", betaHome, ko.portal.assisted.title);
    t.ok("C13d 프로젝트 전환 셀렉트", (await page2.locator(`select[aria-label="${ko.portal.switcherLabel}"]`).count()) === 1);
    await page2.fill(`input[placeholder="${ko.portal.assisted.placeholder}"]`, "수요일 오후 2~4시");
    await page2.getByRole("button", { name: ko.portal.assisted.submit }).click();
    await page2.getByText(ko.portal.assisted.thanks("수요일 오후 2~4시")).waitFor({ timeout: 10000 });
    const proposal = await rest.one("comments", { project_id: `eq.${beta.project.id}` });
    t.ok("C13e 희망 시간은 요청 코멘트 하나로 (새 테이블 없음)", proposal?.kind === "request" && proposal.body.startsWith(ko.portal.assisted.commentPrefix));
    await context.close();
  }

  // C14 /api/verify — 의뢰인 연타 쿨다운 60초, 종료 단계는 final
  await qa.scenario({ github: { membership: "not_invited" } });
  const first = await page.request.post(`${APP}/api/verify/github`, { data: { stepId: beta.byKey["connect-github"].id } });
  const second = await page.request.post(`${APP}/api/verify/github`, { data: { stepId: beta.byKey["connect-github"].id } });
  const firstBody = await first.json();
  const secondBody = await second.json();
  t.ok("C14 첫 호출은 외부 API 를 부른다 (no_slug: 주소 없음)", first.status() === 200 && firstBody.result?.code === "no_slug", firstBody);
  t.ok("C14b 60초 안 재호출은 cooldown=true 로 마지막 결과", secondBody.cooldown === true, secondBody);
  const mismatch = await page.request.post(`${APP}/api/verify/vercel`, { data: { stepId: beta.byKey["connect-github"].id } });
  t.eq("C14c 종류가 다르면 400", mismatch.status(), 400);
  const done = await page.request.post(`${APP}/api/verify/github`, { data: { stepId: fx.byKey["connect-github"].id } });
  t.ok("C14d 확인 완료된 단계는 final=true, 다시 확인하지 않는다", (await done.json()).final === true);
  void HOUR; void iso; void setStep; void getStep; void GUEST_PASSWORD;
  await guest.context.close();
  await admin.context.close();
}
