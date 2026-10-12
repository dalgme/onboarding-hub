// 인증·역할 분기 — 로그인 실패 · 관리자/의뢰인 착지 · 로그아웃 · 임시 비밀번호 강제 변경 · 접근 없는 계정 · 1회용 로그인 링크
import { ko } from "../../src/content/ko.ts";
import {
  APP, ADMIN_EMAIL, ADMIN_PASSWORD, GUEST_EMAIL, GUEST_PASSWORD,
  createProject, createAuthUser, findAuthUser, rest,
  newContext, login, adminPage, guestPage, bodyText, waitFor,
  go,
} from "../lib/harness.mjs";

export default async function run({ browser, t }) {
  const fx = await createProject({ code: "acme", tier: "self" });

  // A1 잘못된 비밀번호
  {
    const context = await newContext(browser);
    const page = await context.newPage();
    await go(page, `${APP}/login`);
    await page.fill("#email", GUEST_EMAIL);
    await page.fill("#password", "wrong-password");
    await page.click('button[type="submit"]');
    await page.getByText(ko.login.invalidCredentials).waitFor({ timeout: 10000 });
    t.ok("A1 잘못된 비밀번호 → 안내 문구, 로그인 화면 유지", page.url().includes("/login"));

    // A2 관리자 로그인 → /a
    const landed = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    t.eq("A2 관리자 로그인 → /a", new URL(landed).pathname, "/a");
    t.includes("A2b 대시보드 최상단 「검증 설정 점검」", await bodyText(page), ko.admin.health.title);

    // A3 관리자도 포털을 열어 볼 수 있다 (my_project_ids 가 전체)
    await go(page, `${APP}/p/acme`);
    t.includes("A3 관리자의 포털 열람", await bodyText(page), ko.portal.nextTaskTitle);

    // A4 로그아웃 → /login, 이후 /a 는 로그인으로
    await go(page, `${APP}/a`);
    await page.getByRole("button", { name: ko.common.logout }).click();
    await page.waitForURL(/\/login/, { timeout: 10000 });
    t.eq("A4 로그아웃 → /login", new URL(page.url()).pathname, "/login");
    await go(page, `${APP}/a`);
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => null);
    t.eq("A4b 로그아웃 뒤 /a → /login", new URL(page.url()).pathname, "/login");
    await context.close();
  }

  // A5 의뢰인 로그인 → 자기 포털 · A6 의뢰인의 /a 접근은 관리 화면이 아니다
  {
    const { context, page } = await guestPage(browser);
    t.eq("A5 의뢰인 로그인 → /p/acme", new URL(page.url()).pathname, "/p/acme");
    const guestRow = await rest.one("project_guests", { project_id: `eq.${fx.project.id}` });
    t.ok("A5b 포털 열람이 last_seen_at 을 남긴다", Boolean(guestRow?.last_seen_at));
    await go(page, `${APP}/a`);
    await page.waitForLoadState("domcontentloaded");
    const path = new URL(page.url()).pathname;
    t.ok("A6 의뢰인이 /a 를 열면 관리 화면이 아닌 곳으로 보내진다", path !== "/a", path);
    await go(page, `${APP}/a/acme`);
    await page.waitForLoadState("domcontentloaded");
    t.ok("A6b 의뢰인이 /a/acme 를 열어도 상세가 아니다", new URL(page.url()).pathname !== "/a/acme", page.url());
    await context.close();
  }

  // A7 임시 비밀번호 → 새 비밀번호 강제 → 포털
  {
    const tempEmail = "temp@qa.local";
    await createAuthUser(tempEmail, "temp-pass-1234", { must_change_password: true });
    await rest.insert("project_guests", { project_id: fx.project.id, email: tempEmail });
    const context = await newContext(browser);
    const page = await context.newPage();
    await login(page, tempEmail, "temp-pass-1234");
    await page.waitForURL(/\/account\/password/, { timeout: 10000 }).catch(() => null);
    t.eq("A7 임시 비밀번호 로그인 → 새 비밀번호 화면", new URL(page.url()).pathname, "/account/password");
    await page.fill("#newPassword", "new-pass-5678");
    await page.fill("#confirm", "new-pass-0000");
    await page.click('button[type="submit"]');
    await page.getByText(ko.passwordChange.mismatch).waitFor({ timeout: 5000 });
    t.ok("A7b 두 비밀번호가 다르면 막힌다", true);
    await page.fill("#confirm", "new-pass-5678");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/p\/acme/, { timeout: 15000 }).catch(() => null);
    t.eq("A7c 새 비밀번호 저장 → 포털", new URL(page.url()).pathname, "/p/acme");
    const user = await findAuthUser(tempEmail);
    t.eq("A7d 임시 표시 해제 (must_change_password=false)", user?.user_metadata?.must_change_password, false);
    await context.close();
    const again = await newContext(browser);
    const page2 = await again.newPage();
    await login(page2, tempEmail, "new-pass-5678");
    t.eq("A7e 새 비밀번호로 다시 로그인 → 포털 (변경 화면 아님)", new URL(page2.url()).pathname, "/p/acme");
    await again.close();
  }

  // A8 어느 프로젝트에도 없는 계정
  {
    await createAuthUser("nobody@qa.local", "nobody-pass-1234");
    const context = await newContext(browser);
    const page = await context.newPage();
    await login(page, "nobody@qa.local", "nobody-pass-1234");
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => null);
    t.eq("A8 접근 없는 계정은 /login 으로 돌아온다", new URL(page.url()).pathname, "/login");
    await go(page, `${APP}/p/acme`);
    await page.waitForLoadState("domcontentloaded");
    t.ok("A8b 접근 없는 계정은 포털을 열 수 없다", !page.url().includes("/p/acme"), page.url());
    await context.close();
  }

  // A9 1회용 로그인 링크 — 프래그먼트 형태, 버튼을 눌러야 소비, 두 번째는 실패
  {
    const admin = await adminPage(browser);
    await go(admin.page, `${APP}/a/acme?tab=settings`);
    await admin.page.getByRole("button", { name: ko.admin.magicLink.title }).first().click();
    const linkText = await waitFor(async () => {
      const text = await admin.page.locator("p.break-all").first().textContent().catch(() => null);
      return text && text.includes("/auth/link#") ? text.trim() : null;
    }, { label: "로그인 링크 생성" });
    t.ok("A9 링크는 /auth/link#token_hash=… 프래그먼트 형태", /\/auth\/link#token_hash=[^&]+&type=magiclink$/.test(linkText), linkText);
    t.ok("A9b 링크 주소가 SITE_URL 로 시작", linkText.startsWith(APP), linkText);
    await admin.context.close();

    const first = await newContext(browser);
    const page = await first.newPage();
    await go(page, linkText);
    await page.getByRole("button", { name: ko.authLink.button }).waitFor({ timeout: 10000 });
    t.ok("A9c 착지 화면에 로그인 버튼 (아직 소비 전)", true);
    await page.getByRole("button", { name: ko.authLink.button }).click();
    await page.waitForURL(/\/p\/acme/, { timeout: 15000 }).catch(() => null);
    t.eq("A9d 버튼 클릭 → 포털 로그인", new URL(page.url()).pathname, "/p/acme");
    await first.close();

    const second = await newContext(browser);
    const page2 = await second.newPage();
    await go(page2, linkText);
    await page2.getByRole("button", { name: ko.authLink.button }).click();
    await page2.waitForURL(/\/login/, { timeout: 15000 }).catch(() => null);
    t.ok("A9e 같은 링크 재사용 → 로그인 화면 + 만료 안내", page2.url().includes("error=auth") && (await bodyText(page2)).includes(ko.login.errorAuth.slice(0, 20)), page2.url());
    await second.close();
  }
}
