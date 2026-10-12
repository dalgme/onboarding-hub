// 종료(오프보딩) — 체크리스트 순서 강제 · 접근 회수(다른 진행 중 프로젝트의 의뢰인은 남긴다) · 종료 처리 · 종료 뒤 포털 열람 전용 · 카드 거둠
import { ko } from "../../src/content/ko.ts";
import { OFFBOARD_CHECKLIST } from "../../src/lib/offboard.ts";
import {
  APP, GUEST_EMAIL, GUEST_PASSWORD, iso,
  createProject, createAuthUser, findAuthUser, rest, notices, tick,
  adminPage, newContext, login, go, bodyText, waitFor,
} from "../lib/harness.mjs";

export default async function run({ browser, t }) {
  const fx = await createProject({ code: "acme", tier: "self", includeAi: false });
  // 같은 의뢰인이 다른 진행 중 프로젝트에도 있다 — 접근 회수 때 로그인 계정은 남아야 한다
  const other = await createProject({ code: "other", name: "다른 프로젝트", clientEmail: GUEST_EMAIL, guestPassword: null });
  // 이 프로젝트에만 있는 두 번째 게스트 — 계정까지 지워져야 한다
  await createAuthUser("solo@qa.local", "solo-pass-1234");
  await rest.insert("project_guests", { project_id: fx.project.id, email: "solo@qa.local" });
  await rest.insert("notices", { project_id: fx.project.id, kind: "next_step", channel: "outbox", dedupe_key: "pending-before-close", status: "pending", title: "x", body: "y", day_kst: "2026-10-12" });

  const admin = await adminPage(browser);
  const page = admin.page;
  page.on("dialog", (dialog) => dialog.accept());
  await go(page, `${APP}/a/acme?tab=close`);
  const boxes = page.locator('ol input[type="checkbox"]');
  t.eq("F1 체크리스트 항목 수 = OFFBOARD_CHECKLIST", await boxes.count(), OFFBOARD_CHECKLIST.length);
  const text = await bodyText(page);
  t.ok("F1b 2번이 「운영 키가 서비스 계정 키인지」, 3번 토큰 폐기, 4번 탈퇴 (순서)", text.indexOf("운영 Anthropic 키") < text.indexOf("토큰·API 키 폐기") && text.indexOf("토큰·API 키 폐기") < text.indexOf("멤버 권한 탈퇴"));
  t.ok("F1c 첫 항목만 체크 가능, 나머지는 잠김", !(await boxes.nth(0).isDisabled()) && (await boxes.nth(1).isDisabled()) && (await boxes.nth(2).isDisabled()));
  const revokeButton = page.getByRole("button", { name: ko.admin.offboard.revokeButton });
  const revokeIndex = OFFBOARD_CHECKLIST.findIndex((item) => item.key === "revoke-guest");
  t.ok("F1d 앞 항목 체크 전에는 접근 회수 버튼 비활성 + 안내", (await revokeButton.isDisabled()) && text.includes(ko.admin.offboard.revokeOrder));
  const completeButton = page.getByRole("button", { name: ko.admin.offboard.completeButton });
  t.ok("F1e 종료 처리 버튼 비활성", await completeButton.isDisabled());
  for (let i = 0; i < revokeIndex; i += 1) await boxes.nth(i).check();
  t.ok("F2 앞 항목을 순서대로 체크하면 접근 회수 활성", !(await revokeButton.isDisabled()));
  t.ok("F2b 중간 항목은 해제할 수 없다 (마지막 체크만)", (await boxes.nth(0).isDisabled()) && !(await boxes.nth(revokeIndex - 1).isDisabled()));
  await revokeButton.click();
  await page.getByText(ko.admin.offboard.revokeDone(2, 1, 1)).waitFor({ timeout: 15000 });
  t.ok("F3 접근 회수: 게스트 2 삭제 · 계정 1 삭제 · 1 유지", true);
  t.eq("F3b project_guests 비움", (await rest.get("project_guests", { project_id: `eq.${fx.project.id}` })).length, 0);
  t.ok("F3c 다른 진행 중 프로젝트의 의뢰인 계정은 남는다", Boolean(await findAuthUser(GUEST_EMAIL)));
  t.ok("F3d 이 프로젝트에만 있던 계정은 지운다", !(await findAuthUser("solo@qa.local")));
  t.eq("F3e 다른 프로젝트의 접근 목록은 그대로", (await rest.get("project_guests", { project_id: `eq.${other.project.id}` })).length, 1);
  await revokeButton.click();
  await page.getByText(ko.admin.offboard.revokeNothing).waitFor({ timeout: 10000 });
  t.ok("F3f 두 번 눌러도 회수할 것이 없다고만 한다", true);
  for (let i = revokeIndex; i < OFFBOARD_CHECKLIST.length; i += 1) await boxes.nth(i).check();
  t.ok("F4 전부 체크하면 종료 처리 활성", !(await completeButton.isDisabled()));
  await completeButton.click();
  const closed = await waitFor(async () => {
    const row = await rest.one("projects", { code: "eq.acme" });
    return row.status === "closed" ? row : null;
  }, { label: "closed" });
  t.ok("F4b 종료 → status closed + closed_at", Boolean(closed.closed_at));
  await go(page, `${APP}/a/acme?tab=close`);
  t.includes("F4c 종료 탭에 종료일 표시", await bodyText(page), ko.admin.offboard.closedAt(closed.closed_at.slice(0, 4)).slice(0, 4));
  await go(page, `${APP}/a`);
  const todoSection = await page.locator("section", { hasText: ko.admin.todo.dashboardTitle }).first().innerText();
  t.ok("F4d 종료 프로젝트는 「지금 할 일」에서 빠진다 (다른 프로젝트는 남는다)", !todoSection.includes("Acme 쇼핑몰") && todoSection.includes("다른 프로젝트"), todoSection.slice(0, 200));

  // F5 종료 뒤 — 남아 있던 카드는 tick 이 거둔다, 포털은 열람 전용, 검증 API 403
  await tick(iso());
  const pendingAfter = await rest.one("notices", { dedupe_key: "eq.pending-before-close" });
  t.eq("F5 종료 프로젝트의 pending 카드 → skipped/condition_cleared", [pendingAfter.status, pendingAfter.skip_reason], ["skipped", "condition_cleared"]);
  {
    const context = await newContext(browser);
    const guest = await context.newPage();
    const landed = await login(guest, GUEST_EMAIL, GUEST_PASSWORD);
    t.eq("F5b 회수된 의뢰인은 남은 프로젝트(other)로만 들어간다", new URL(landed).pathname, "/p/other");
    await go(guest, `${APP}/p/acme`);
    t.ok("F5c 회수된 프로젝트 포털은 열리지 않는다", !guest.url().includes("/p/acme"), guest.url());
    await context.close();
  }
  await go(page, `${APP}/p/acme`);
  const closedPortal = await bodyText(page);
  t.includes("F5d (관리자가 본) 종료 포털: 열람 전용 안내", closedPortal, ko.portal.closedNotice);
  await go(page, `${APP}/p/acme/steps/connect-github`);
  t.ok("F5e 종료 포털 단계 화면에 완료·막힘 버튼 없음", !(await bodyText(page)).includes(ko.stepDetail.doneButton));
  const verify = await page.request.post(`${APP}/api/verify/github`, { data: { stepId: fx.byKey["connect-github"].id } });
  t.eq("F5f 종료 프로젝트 검증 API → 403", verify.status(), 403);
  const assist = await page.request.post(`${APP}/api/assist`, { data: { code: "acme", stepKey: "connect-github", messages: [{ role: "user", content: "안녕" }] } });
  t.ok("F5g 종료 프로젝트 도우미 → 403 + 종료 안내", assist.status() === 403 && (await assist.json()).reply === ko.assist.closed);
  const solo = await rest.get("notices", { kind: "eq.closed" });
  void solo;
  await admin.context.close();
}
