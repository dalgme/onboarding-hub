// 375px 모바일 — 포털 화면이 가로로 넘치지 않고, 하단 고정 버튼이 44px 이상이며 보인다
import { ko } from "../../src/content/ko.ts";
import { APP, createProject, newContext, login, GUEST_EMAIL, GUEST_PASSWORD, go, bodyText } from "../lib/harness.mjs";

async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

export default async function run({ browser, t }) {
  await createProject({ code: "acme", tier: "assisted", includeAi: true, scopeMd: "# 범위\n\n긴 문장 ".repeat(40) });
  const context = await newContext(browser, { mobile: true });
  const page = await context.newPage();
  await go(page, `${APP}/login`);
  const loginSize = await overflow(page);
  t.ok("M1 로그인 화면 가로 넘침 없음", loginSize.scrollWidth <= loginSize.clientWidth, loginSize);
  await login(page, GUEST_EMAIL, GUEST_PASSWORD);
  const homeSize = await overflow(page);
  t.ok("M2 포털 홈 가로 넘침 없음 (긴 범위 문서 포함)", homeSize.scrollWidth <= homeSize.clientWidth, homeSize);
  const tabs = page.locator("nav a");
  const tabBox = await tabs.first().boundingBox();
  t.ok("M2b 탭 터치 타깃 44px 이상", (tabBox?.height ?? 0) >= 44, tabBox);
  const nextGo = page.getByRole("link", { name: ko.portal.nextTaskGo });
  const nextBox = await nextGo.boundingBox();
  t.ok("M2c 「이어서 진행하기」 버튼이 화면 폭 안에, 44px 이상", nextBox && nextBox.width <= 375 && nextBox.height >= 44, nextBox);

  for (const key of ["connect-github", "connect-anthropic", "scope-review"]) {
    await go(page, `${APP}/p/acme/steps/${key}`);
    const size = await overflow(page);
    t.ok(`M3 단계 화면 ${key} 가로 넘침 없음`, size.scrollWidth <= size.clientWidth, size);
    const done = page.getByRole("button", { name: ko.stepDetail.doneButton });
    const help = page.getByRole("button", { name: ko.stepDetail.helpButton });
    const doneBox = await done.boundingBox();
    const helpBox = await help.boundingBox();
    const viewport = page.viewportSize();
    t.ok(`M3b ${key} 하단 고정 버튼이 스크롤 없이 보인다 (sticky)`, doneBox && helpBox && doneBox.y + doneBox.height <= viewport.height && helpBox.y + helpBox.height <= viewport.height, { doneBox, helpBox });
    t.ok(`M3c ${key} 버튼 높이 44px 이상`, (doneBox?.height ?? 0) >= 44 && (helpBox?.height ?? 0) >= 44);
    if (key === "connect-github") {
      await page.getByRole("button", { name: ko.stepDetail.createDone }).click();
      await page.locator("#rawSlug").waitFor();
      await page.fill("#rawSlug", "https://github.com/orgs/some-very-long-organization-name-for-mobile/people");
      const slugSize = await overflow(page);
      t.ok("M3d 긴 주소를 붙여넣어도 가로 넘침 없음", slugSize.scrollWidth <= slugSize.clientWidth, slugSize);
      const assistButton = page.getByRole("button", { name: ko.assist.open });
      const assistBox = await assistButton.boundingBox();
      t.ok("M3e 도우미 버튼이 완료 버튼을 가리지 않는다", assistBox && doneBox && assistBox.y + assistBox.height <= (await done.boundingBox()).y + 1, { assistBox });
    }
  }
  await go(page, `${APP}/p/acme?tab=qa`);
  const qaSize = await overflow(page);
  t.ok("M4 질문·요청 탭 가로 넘침 없음", qaSize.scrollWidth <= qaSize.clientWidth, qaSize);
  t.ok("M4b 코멘트 입력 폼 보임", (await bodyText(page)).includes(ko.comments.submit));
  await context.close();
}
