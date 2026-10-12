// 외부 API 시뮬레이터 — 앱의 fetch 가 intercept.cjs 를 거쳐 /__ext/<host>/<path> 로 들어온다.
// 시나리오 하나(JSON)가 GitHub·Vercel·Supabase 관리 API·heartbeat·푸시 서비스의 응답을 정한다.
export const DEFAULT_SCENARIO = {
  adminEmail: "admin@qa.local",
  // health: token ok|invalid|noscope  ·  verify: membership active|member_role|pending|not_invited|org_missing|personal|rate_limited|down
  github: { token: "ok", membership: "active" },
  // token ok|invalid|mismatch(email 다름) · team listed|unlisted · member confirmed|pending|absent|wrong_role|forbidden · teamSlug
  vercel: { token: "ok", team: "listed", member: "confirmed", teamSlug: "acme-shop" },
  // token ok|invalid · members mine|other|noemail|forbidden|wrong_role|notfound
  supabase: { token: "ok", members: "mine" },
  heartbeat: "ok", // ok|fail
  push: "ok", // ok|gone|mismatch|fail
  otpExp: 86400,
};

export function createExternal() {
  return { scenario: structuredClone(DEFAULT_SCENARIO), calls: [] };
}

export function setScenario(ext, patch) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && typeof ext.scenario[key] === "object") {
      ext.scenario[key] = { ...ext.scenario[key], ...value };
    } else ext.scenario[key] = value;
  }
  return ext.scenario;
}

export function resetScenario(ext) {
  ext.scenario = structuredClone(DEFAULT_SCENARIO);
  ext.calls = [];
}

const json = (status, body, headers = {}) => ({ status, body, headers: { "content-type": "application/json", ...headers } });

export async function handleExternal(ext, host, method, path, headers, rawBody) {
  const s = ext.scenario;
  const record = { at: new Date().toISOString(), host, method, path, status: 0 };
  ext.calls.push(record);
  const url = new URL(`https://${host}${path}`);
  const p = url.pathname;
  let out;

  if (host === "api.github.com") {
    if (s.github.token === "invalid") out = json(401, { message: "Bad credentials" });
    else if (p === "/user") {
      out = json(200, { login: "dalgme", id: 1 }, { "x-oauth-scopes": s.github.token === "noscope" ? "repo" : "read:org, repo" });
    } else if (/^\/user\/memberships\/orgs\//.test(p)) {
      const m = s.github.membership;
      if (m === "active") out = json(200, { state: "active", role: "admin" });
      else if (m === "member_role") out = json(200, { state: "active", role: "member" });
      else if (m === "pending") out = json(200, { state: "pending", role: "admin" });
      else if (m === "rate_limited") out = json(429, { message: "rate limited" });
      else if (m === "down") out = json(502, { message: "bad gateway" });
      else out = json(404, { message: "Not Found" });
    } else if (/^\/orgs\//.test(p)) {
      out = s.github.membership === "not_invited" ? json(200, { login: decodeURIComponent(p.split("/")[2]) }) : json(404, { message: "Not Found" });
    } else if (/^\/users\//.test(p)) {
      out = s.github.membership === "personal" ? json(200, { type: "User" }) : json(404, { message: "Not Found" });
    } else out = json(404, { message: "Not Found" });
  } else if (host === "api.vercel.com") {
    if (s.vercel.token === "invalid") out = json(403, { error: { code: "forbidden" } });
    else if (p === "/v2/user") {
      const email = s.vercel.token === "mismatch" ? "other-account@example.com" : s.adminEmail;
      out = json(200, { user: { id: "vercel-user-1", uid: "vercel-user-1", email } });
    } else if (p === "/v2/teams") {
      out = json(200, { teams: s.vercel.team === "listed" ? [{ id: "team_qa_1", slug: s.vercel.teamSlug }] : [] });
    } else if (/^\/v3\/teams\/[^/]+\/members$/.test(p)) {
      const m = s.vercel.member;
      if (m === "forbidden") out = json(403, { error: { code: "forbidden" } });
      else if (m === "absent") out = json(200, { members: [] });
      else if (m === "pending") out = json(200, { members: [{ uid: "vercel-user-1", confirmed: false, role: "MEMBER" }] });
      else if (m === "wrong_role") out = json(200, { members: [{ uid: "vercel-user-1", confirmed: true, role: "VIEWER" }] });
      else out = json(200, { members: [{ uid: "vercel-user-1", confirmed: true, role: "MEMBER" }] });
    } else out = json(404, { error: { code: "not_found" } });
  } else if (host === "api.supabase.com") {
    if (s.supabase.token === "invalid") out = json(401, { message: "Unauthorized" });
    else if (p === "/v1/organizations") out = json(200, [{ id: "org_qa", slug: "qa-org", name: "QA" }]);
    else if (/^\/v1\/organizations\/[^/]+\/members$/.test(p)) {
      const m = s.supabase.members;
      if (m === "forbidden") out = json(403, { message: "Forbidden" });
      else if (m === "notfound") out = json(404, { message: "Not found" });
      else if (m === "other") out = json(200, [{ email: "someone@else.example", role_name: "Owner" }]);
      else if (m === "noemail") out = json(200, [{ role_name: "Owner" }]);
      else if (m === "wrong_role") out = json(200, [{ email: s.adminEmail, role_name: "Developer" }]);
      else out = json(200, [{ email: s.adminEmail, role_name: "Administrator" }]);
    } else if (/^\/v1\/projects\/[^/]+\/config\/auth$/.test(p)) out = json(200, { mailer_otp_exp: s.otpExp });
    else out = json(404, { message: "Not found" });
  } else if (host === "heartbeat.qa.local") {
    out = s.heartbeat === "ok" ? json(200, { ok: true }) : json(500, { ok: false });
  } else if (host === "push.qa.local") {
    record.push = {
      ttl: headers["ttl"] ?? null,
      topic: headers["topic"] ?? null,
      urgency: headers["urgency"] ?? null,
      bytes: rawBody?.length ?? 0,
    };
    if (s.push === "gone") out = { status: 410, body: "subscription expired", headers: { "content-type": "text/plain" } };
    else if (s.push === "mismatch") out = { status: 400, body: "VapidPkHashMismatch", headers: { "content-type": "text/plain" } };
    else if (s.push === "fail") out = { status: 500, body: "push service down", headers: { "content-type": "text/plain" } };
    else out = { status: 201, body: "", headers: {} };
  } else {
    out = json(502, { error: `unknown external host ${host}` });
  }
  record.status = out.status;
  return out;
}
