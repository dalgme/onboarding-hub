// 모의 Supabase + 외부 API 시뮬레이터 + 검수 제어 엔드포인트. 포트 54321.
//   /auth/v1/*          GoTrue 흉내 (auth.mjs)
//   /rest/v1/*          PostgREST 흉내 (db.mjs)
//   /__ext/<host>/*     외부 API 시뮬레이터 (external.mjs) — 앱의 intercept.cjs 가 보낸다
//   /__qa/*             reset · scenario · calls · dump · health
import http from "node:http";
import { createDb, resetDb, select, insert, update, remove, rpc, parseQuery, DbError, TABLES } from "./db.mjs";
import * as auth from "./auth.mjs";
import { createExternal, handleExternal, setScenario, resetScenario } from "./external.mjs";

const PORT = Number(process.env.QA_MOCK_PORT ?? 54321);
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "qa-anon-key";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "qa-service-role-key";
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL ?? "admin@qa.local";
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD ?? "admin-pass-1234";
const VERBOSE = process.env.MOCK_LOG === "1";

const db = createDb();
const authState = auth.createAuth();
const ext = createExternal();

function seedBaseline() {
  resetDb(db);
  db.data.admins.push({
    id: "00000000-0000-4000-8000-00000000adm1",
    email: ADMIN_EMAIL,
    last_tick_started_at: null,
    last_tick_finished_at: null,
    last_token_check_at: null,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 86_400_000).toISOString(),
  });
  if (!auth.findUserByEmail(authState, ADMIN_EMAIL)) {
    auth.createUser(authState, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  }
}
seedBaseline();

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function send(res, status, body, headers = {}) {
  const base = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "content-range, x-total-count",
    ...headers,
  };
  if (body === null || body === undefined || body === "") {
    res.writeHead(status, base);
    res.end();
    return;
  }
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...base });
  res.end(text);
}

function bearer(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// 역할 판정 — service_role 키 / 사용자 토큰 / anon
function contextOf(req) {
  const token = bearer(req);
  if (token === SERVICE_KEY) return { role: "service_role", email: null };
  if (!token || token === ANON_KEY) return { role: "anon", email: null };
  const user = auth.userFromToken(authState, token);
  if (!user) return { role: "invalid", email: null };
  return { role: "authenticated", email: user.email, userId: user.id };
}

function parsePrefer(req) {
  const prefer = {};
  for (const piece of (req.headers.prefer ?? "").split(",")) {
    const [key, value] = piece.trim().split("=");
    if (key) prefer[key] = value;
  }
  return prefer;
}

async function handleRest(req, res, url) {
  const ctx = contextOf(req);
  if (ctx.role === "invalid") return send(res, 401, { code: "PGRST301", message: "JWT expired or invalid" });
  const segments = url.pathname.replace(/^\/rest\/v1\/?/, "").split("/");
  const prefer = parsePrefer(req);
  const wantsObject = (req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
  const raw = await readBody(req);
  const body = raw.length ? JSON.parse(raw.toString("utf8")) : null;

  try {
    if (segments[0] === "rpc") {
      const result = rpc(db, segments[1], ctx);
      return send(res, 200, result);
    }
    const table = segments[0];
    const query = parseQuery(url.searchParams);
    let rows;
    let total = null;
    let status = 200;
    if (req.method === "GET" || req.method === "HEAD") {
      ({ rows, total } = select(db, table, query, ctx));
    } else if (req.method === "POST") {
      rows = insert(db, table, body, query, ctx, prefer);
      status = 201;
    } else if (req.method === "PATCH") {
      rows = update(db, table, body ?? {}, query, ctx);
    } else if (req.method === "DELETE") {
      rows = remove(db, table, query, ctx);
    } else return send(res, 405, { message: "method not allowed" });

    const headers = {};
    if (prefer.count === "exact") headers["content-range"] = `${rows.length ? `0-${rows.length - 1}` : "*"}/${total ?? rows.length}`;
    else if (req.method === "GET") headers["content-range"] = rows.length ? `0-${rows.length - 1}/*` : "*/*";
    if (req.method === "HEAD") {
      res.writeHead(200, { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range", ...headers });
      return res.end();
    }
    const representation = req.method === "GET" || prefer.return === "representation";
    if (!representation) return send(res, req.method === "POST" ? 201 : 204, null, headers);
    if (wantsObject) {
      if (rows.length !== 1) {
        return send(res, 406, {
          code: "PGRST116",
          details: rows.length === 0 ? "The result contains 0 rows" : `Results contain ${rows.length} rows, application/vnd.pgrst.object+json requires 1 row`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }, headers);
      }
      return send(res, status, rows[0], headers);
    }
    return send(res, status, rows, headers);
  } catch (cause) {
    if (cause instanceof DbError) return send(res, cause.status, cause.toJSON());
    console.error("[mock] rest error", cause);
    return send(res, 500, { code: "XX000", message: String(cause?.message ?? cause) });
  }
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const raw = await readBody(req);
  const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  const token = bearer(req);
  const isService = token === SERVICE_KEY;
  try {
    if (req.method === "POST" && path === "/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") return send(res, 200, auth.signInWithPassword(authState, body.email, body.password));
      if (grant === "refresh_token") return send(res, 200, auth.refresh(authState, body.refresh_token));
      return send(res, 400, { code: 400, error_code: "unsupported_grant_type", msg: "unsupported grant" });
    }
    if (path === "/user" && req.method === "GET") {
      const user = auth.userFromToken(authState, token);
      if (!user) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return send(res, 200, user);
    }
    if (path === "/user" && req.method === "PUT") {
      const user = auth.userFromToken(authState, token);
      if (!user) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return send(res, 200, auth.updateUser(authState, user.id, body));
    }
    if (path === "/logout" && req.method === "POST") {
      auth.logout(authState, token);
      return send(res, 204, null);
    }
    if (path === "/verify" && req.method === "POST") {
      return send(res, 200, auth.verifyOtp(authState, body.token_hash, body.type));
    }
    if (path.startsWith("/admin/")) {
      if (!isService) return send(res, 401, { code: 401, error_code: "no_authorization", msg: "service role required" });
      if (path === "/admin/users" && req.method === "POST") return send(res, 200, auth.createUser(authState, body));
      if (path === "/admin/users" && req.method === "GET") {
        return send(res, 200, { users: auth.listUsers(authState), aud: "authenticated" });
      }
      const match = /^\/admin\/users\/([^/]+)$/.exec(path);
      if (match && req.method === "PUT") return send(res, 200, auth.updateUser(authState, match[1], body));
      if (match && req.method === "DELETE") {
        auth.deleteUser(authState, match[1]);
        return send(res, 200, {});
      }
      if (path === "/admin/generate_link" && req.method === "POST") return send(res, 200, auth.generateLink(authState, body.email));
    }
    return send(res, 404, { code: 404, error_code: "not_found", msg: `no route ${req.method} ${path}` });
  } catch (cause) {
    if (cause instanceof auth.AuthError) return send(res, cause.status, cause.toJSON());
    console.error("[mock] auth error", cause);
    return send(res, 500, { code: 500, error_code: "unexpected_failure", msg: String(cause?.message ?? cause) });
  }
}

async function handleControl(req, res, url) {
  const path = url.pathname.replace(/^\/__qa/, "");
  const raw = await readBody(req);
  const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  if (path === "/health") return send(res, 200, { ok: true, tables: Object.keys(TABLES) });
  if (path === "/reset" && req.method === "POST") {
    seedBaseline();
    resetScenario(ext);
    if (body.auth) {
      authState.users.clear();
      authState.sessions.clear();
      authState.refreshTokens.clear();
      authState.links.clear();
      auth.createUser(authState, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    }
    return send(res, 200, { ok: true });
  }
  if (path === "/scenario" && req.method === "GET") return send(res, 200, ext.scenario);
  if (path === "/scenario" && req.method === "POST") return send(res, 200, setScenario(ext, body));
  if (path === "/calls" && req.method === "GET") return send(res, 200, ext.calls);
  if (path === "/calls" && req.method === "DELETE") {
    ext.calls = [];
    return send(res, 200, { ok: true });
  }
  if (path === "/dump") {
    const table = url.searchParams.get("table");
    return send(res, 200, table ? db.data[table] ?? [] : db.data);
  }
  if (path === "/users") return send(res, 200, auth.listUsers(authState));
  if (path === "/links") return send(res, 200, [...authState.links.keys()]);
  return send(res, 404, { error: `no control route ${path}` });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (VERBOSE) console.log(`[mock] ${req.method} ${url.pathname}${url.search}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-max-age": "600",
    });
    return res.end();
  }
  try {
    if (url.pathname.startsWith("/rest/v1")) return await handleRest(req, res, url);
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url);
    if (url.pathname.startsWith("/__qa")) return await handleControl(req, res, url);
    if (url.pathname.startsWith("/__ext/")) {
      const rest = url.pathname.slice("/__ext/".length);
      const slash = rest.indexOf("/");
      const host = slash >= 0 ? rest.slice(0, slash) : rest;
      const path = (slash >= 0 ? rest.slice(slash) : "/") + url.search;
      const raw = await readBody(req);
      const out = await handleExternal(ext, host, req.method, path, req.headers, raw);
      res.writeHead(out.status, { "access-control-allow-origin": "*", ...out.headers });
      return res.end(typeof out.body === "string" ? out.body : JSON.stringify(out.body));
    }
    return send(res, 404, { error: `no route ${url.pathname}` });
  } catch (cause) {
    console.error("[mock] unhandled", cause);
    return send(res, 500, { error: String(cause?.message ?? cause) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock] supabase mock listening on http://127.0.0.1:${PORT} (admin ${ADMIN_EMAIL})`);
});
