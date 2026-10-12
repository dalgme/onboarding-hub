// 스위트 공용 헬퍼 — 모의 서버 제어·REST·고정 데이터·브라우저 로그인·tick 호출·대기.
import { plannedSteps, skippedWith } from "../../src/lib/steps.ts";
import { ko } from "../../src/content/ko.ts";

export const APP = process.env.QA_APP_URL ?? "http://127.0.0.1:3100";
export const MOCK = process.env.QA_MOCK_URL ?? "http://127.0.0.1:54321";
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "qa-service-role-key";
export const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? "admin@qa.local";
export const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD ?? "admin-pass-1234";
export const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron-secret";
export const GUEST_EMAIL = "client@qa.local";
export const GUEST_PASSWORD = "client-pass-1234";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
export const HOUR = 60 * 60_000;
export const DAY = 24 * HOUR;

// ── 결과 기록 ────────────────────────────────────────────────────────
export function createReporter(suite) {
  const results = [];
  const report = {
    suite,
    results,
    ok(label, condition, extra) {
      const pass = Boolean(condition);
      results.push({ label, pass, extra });
      console.log(`${pass ? "✅" : "❌"} ${label}${!pass && extra !== undefined ? ` — ${format(extra)}` : ""}`);
      return pass;
    },
    eq(label, actual, expected) {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      return report.ok(label, pass, pass ? undefined : { actual, expected });
    },
    includes(label, haystack, needle) {
      const pass = typeof haystack === "string" && haystack.includes(needle);
      return report.ok(label, pass, pass ? undefined : { haystack: String(haystack).slice(0, 300), needle });
    },
    async step(label, fn) {
      try {
        const detail = await fn();
        report.ok(label, true);
        return detail;
      } catch (cause) {
        report.ok(label, false, cause instanceof Error ? cause.message : cause);
        return undefined;
      }
    },
    summary() {
      const passed = results.filter((r) => r.pass).length;
      return { suite, passed, failed: results.length - passed, total: results.length };
    },
  };
  return report;
}

function format(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value).slice(0, 400);
  } catch {
    return String(value);
  }
}

// ── 모의 서버 제어 ───────────────────────────────────────────────────
async function controlJson(path, init) {
  const response = await fetch(`${MOCK}/__qa${path}`, init);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const qa = {
  reset: (options = {}) => controlJson("/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(options) }),
  scenario: (patch) => controlJson("/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }),
  getScenario: () => controlJson("/scenario"),
  calls: () => controlJson("/calls"),
  clearCalls: () => controlJson("/calls", { method: "DELETE" }),
  dump: (table) => controlJson(`/dump?table=${table}`),
  users: () => controlJson("/users"),
};

// ── service_role REST (앱이 쓰는 것과 같은 PostgREST 층을 지난다) ──────
const serviceHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

function params(filters = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) search.set(key, value);
  return search.toString();
}

export const rest = {
  async get(table, filters = {}) {
    const response = await fetch(`${MOCK}/rest/v1/${table}?${params({ select: "*", ...filters })}`, { headers: serviceHeaders });
    if (!response.ok) throw new Error(`rest.get ${table} ${response.status} ${await response.text()}`);
    return response.json();
  },
  async one(table, filters = {}) {
    const rows = await rest.get(table, filters);
    return rows[0] ?? null;
  },
  async insert(table, rows) {
    const response = await fetch(`${MOCK}/rest/v1/${table}?select=*`, {
      method: "POST",
      headers: { ...serviceHeaders, Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (!response.ok) throw new Error(`rest.insert ${table} ${response.status} ${await response.text()}`);
    return response.json();
  },
  async update(table, filters, patch) {
    const response = await fetch(`${MOCK}/rest/v1/${table}?${params({ select: "*", ...filters })}`, {
      method: "PATCH",
      headers: { ...serviceHeaders, Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(`rest.update ${table} ${response.status} ${await response.text()}`);
    return response.json();
  },
  async remove(table, filters) {
    const response = await fetch(`${MOCK}/rest/v1/${table}?${params(filters)}`, { method: "DELETE", headers: serviceHeaders });
    if (!response.ok) throw new Error(`rest.remove ${table} ${response.status} ${await response.text()}`);
  },
};

// ── 인증 사용자 ─────────────────────────────────────────────────────
export async function createAuthUser(email, password, userMetadata = {}) {
  const response = await fetch(`${MOCK}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: userMetadata }),
  });
  if (!response.ok) throw new Error(`createAuthUser ${response.status} ${await response.text()}`);
  return response.json();
}

export async function updateAuthUser(email, patch) {
  const user = await findAuthUser(email);
  if (!user) throw new Error(`updateAuthUser: ${email} 없음`);
  const response = await fetch(`${MOCK}/auth/v1/admin/users/${user.id}`, { method: "PUT", headers: serviceHeaders, body: JSON.stringify(patch) });
  if (!response.ok) throw new Error(`updateAuthUser ${response.status} ${await response.text()}`);
  return response.json();
}

// 검수용 푸시 구독 — 실제 P-256 키라 web-push 가 암호화까지 한다. 끝점은 intercept 가 모의 서버로 돌린다
export async function seedPushSubscription({ endpoint = "https://push.qa.local/sub/1", lastAckAt = null } = {}) {
  const { generateKeyPairSync, randomBytes } = await import("node:crypto");
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  const [row] = await rest.insert("push_subscriptions", {
    endpoint,
    p256dh: raw.toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    user_agent: "qa",
  });
  if (lastAckAt) await rest.update("push_subscriptions", { id: `eq.${row.id}` }, { last_ack_at: lastAckAt });
  return row;
}

export async function findAuthUser(email) {
  const users = await qa.users();
  return users.find((user) => user.email === email.toLowerCase()) ?? null;
}

// ── 고정 데이터: 프로젝트 + 템플릿 단계 + 게스트 ───────────────────────
export async function createProject(options = {}) {
  const {
    code = "acme",
    name = "Acme 쇼핑몰",
    clientName = "김의뢰",
    clientEmail = GUEST_EMAIL,
    tier = "self",
    includeAi = true,
    optionalKeys = [],
    guest = true,
    guestPassword = GUEST_PASSWORD,
    accessSentAt = null,
    lastSeenAt = null,
    status = "onboarding",
    scopeMd = null,
    scopeAgreedAt = null,
  } = options;
  const [project] = await rest.insert("projects", {
    code,
    name,
    client_name: clientName,
    client_email: clientEmail,
    support_tier: tier,
    status,
    access_sent_at: accessSentAt,
    scope_md: scopeMd,
    scope_agreed_at: scopeAgreedAt,
  });
  const templates = plannedSteps(optionalKeys);
  const steps = await rest.insert(
    "steps",
    templates.map((template, index) => ({
      project_id: project.id,
      order_index: index,
      key: template.key,
      title: template.title,
      description_md: template.description_md,
      owner_side: template.owner_side,
      verify_type: template.verify_type,
      status:
        !includeAi && (template.key === "connect-anthropic" || skippedWith("connect-anthropic").includes(template.key))
          ? "skipped"
          : "todo",
    })),
  );
  let guestRow = null;
  if (guest) {
    [guestRow] = await rest.insert("project_guests", { project_id: project.id, email: clientEmail.toLowerCase() });
    if (lastSeenAt) {
      await rest.update("project_guests", { id: `eq.${guestRow.id}` }, { last_seen_at: lastSeenAt });
      guestRow.last_seen_at = lastSeenAt;
    }
    if (guestPassword && !(await findAuthUser(clientEmail))) await createAuthUser(clientEmail, guestPassword);
  }
  const byKey = Object.fromEntries(steps.map((step) => [step.key, step]));
  return { project, steps, byKey, guest: guestRow };
}

export async function setStep(stepId, patch) {
  const [row] = await rest.update("steps", { id: `eq.${stepId}` }, patch);
  return row;
}

export async function getStep(stepId) {
  return rest.one("steps", { id: `eq.${stepId}` });
}

export async function notices(filters = {}) {
  return rest.get("notices", { order: "created_at.asc", ...filters });
}

// ── tick ────────────────────────────────────────────────────────────
export async function tick(nowIso = null, secret = CRON_SECRET) {
  const url = new URL(`${APP}/api/cron/tick`);
  if (nowIso) url.searchParams.set("now", nowIso);
  const response = await fetch(url, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// KST 벽시계로 시각을 만든다 — 리마인드 창(평일 10~18시)·요약(09~21시) 재현용
export function kst(dateText, hour, minute = 0) {
  return new Date(`${dateText}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`).toISOString();
}

// ── 대기 ────────────────────────────────────────────────────────────
export async function waitFor(check, { timeout = 8000, interval = 150, label = "조건" } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await check();
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`${label}: ${timeout}ms 안에 충족되지 않음`);
}

// ── 브라우저 ────────────────────────────────────────────────────────
export async function newContext(browser, { mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 375, height: 740 } : { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
    locale: "ko-KR",
    baseURL: APP,
    serviceWorkers: "block",
  });
  // 화면 쪽 오류는 바로 보이게 — 폰트 CDN(외부망) 차단 같은 잡음은 뺀다
  context.on("page", (page) => {
    page.on("pageerror", (error) => console.log(`   [page error] ${String(error.message).slice(0, 200)}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(text)) return;
      console.log(`   [console] ${text.slice(0, 200)}`);
    });
  });
  return context;
}

export async function login(page, email, password) {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    // 로그인 폼은 "/" 로 보내고, 루트가 역할별 화면으로 다시 보낸다 — 최종 착지까지 기다린다
    page.waitForURL((url) => !url.pathname.startsWith("/login") && url.pathname !== "/", { timeout: 15000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await settle(page);
  return page.url();
}

export async function adminPage(browser, options) {
  const context = await newContext(browser, options);
  const page = await context.newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  return { context, page };
}

export async function guestPage(browser, options, email = GUEST_EMAIL, password = GUEST_PASSWORD) {
  const context = await newContext(browser, options);
  const page = await context.newPage();
  await login(page, email, password);
  return { context, page };
}

// 이동 — Next 는 loading.tsx 껍데기를 200 으로 먼저 보내고 서버의 redirect() 를 스트리밍 뒤에 실행한다.
// 그래서 goto 가 끝나도 주소가 바뀔 수 있다 — 네트워크가 잠잠해지고 「불러오는 중…」이 사라질 때까지 기다린다
export async function go(page, path, { timeout = 15000 } = {}) {
  await page.goto(path.startsWith("http") ? path : `${APP}${path}`, { waitUntil: "domcontentloaded", timeout });
  await settle(page, timeout);
  return page.url();
}

export async function settle(page, timeout = 15000) {
  await page.waitForLoadState("networkidle", { timeout }).catch(() => null);
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (!text.includes(ko.common.loading)) break;
    await sleep(100);
  }
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => null);
}

export async function textOf(page, selector) {
  return (await page.locator(selector).first().textContent())?.trim() ?? "";
}

export async function bodyText(page) {
  await settle(page, 5000);
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

export async function clipboardText(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}
