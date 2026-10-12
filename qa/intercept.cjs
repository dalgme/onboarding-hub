// 앱 프로세스 프리로드 (NODE_OPTIONS=--require ./qa/intercept.cjs).
// 바깥으로 나가는 호출을 전부 모의 서버로 돌린다 — 실제 GitHub·Vercel·Supabase 관리 API·푸시 서비스·
// heartbeat 는 검수 중 한 번도 호출되지 않는다. 라우팅은 호스트 이름으로만 한다(토큰은 보지 않는다).
"use strict";
const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns");
const { syncBuiltinESMExports } = require("node:module");

const MOCK = process.env.QA_MOCK_URL || "http://127.0.0.1:54321";
const mockUrl = new URL(MOCK);
const HOSTS = new Set(["api.github.com", "api.vercel.com", "api.supabase.com", "heartbeat.qa.local", "push.qa.local"]);

function rewrite(urlText) {
  const url = new URL(urlText);
  if (!HOSTS.has(url.hostname)) return null;
  return `${MOCK}/__ext/${url.hostname}${url.pathname}${url.search}`;
}

// 1) fetch — 검증 API·health·heartbeat
const originalFetch = globalThis.fetch;
globalThis.fetch = function qaFetch(input, init) {
  try {
    const target = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    const replaced = target ? rewrite(target) : null;
    if (replaced) {
      if (typeof input === "string" || input instanceof URL) return originalFetch(replaced, init);
      return originalFetch(new Request(replaced, input), init);
    }
  } catch {
    // 상대 URL 등 — 원래 fetch 에 맡긴다
  }
  return originalFetch(input, init);
};

// 2) https.request — web-push 는 fetch 가 아니라 https.request 로 푸시 서비스에 보낸다
const originalRequest = https.request;
https.request = function qaHttpsRequest(...args) {
  let options = args[0];
  let rest = args.slice(1);
  if (typeof options === "string" || options instanceof URL) {
    const url = new URL(String(options));
    options = { hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, ...(typeof rest[0] === "object" ? rest.shift() : {}) };
  }
  const hostname = options?.hostname || options?.host;
  if (hostname && HOSTS.has(hostname)) {
    const next = { ...options, protocol: "http:", hostname: mockUrl.hostname, host: mockUrl.hostname, port: mockUrl.port, path: `/__ext/${hostname}${options.path || "/"}` };
    delete next.agent;
    return http.request(next, ...rest);
  }
  return originalRequest.apply(https, args);
};

// 3) DNS MX — 사전 점검이 의뢰인 이메일 도메인의 MX 를 본다. 검수 도메인(*.qa.local)은 있다고 답한다
const originalResolveMx = dns.promises.resolveMx;
dns.promises.resolveMx = function qaResolveMx(domain, ...rest) {
  if (String(domain).endsWith("qa.local")) return Promise.resolve([{ exchange: `mx.${domain}`, priority: 10 }]);
  if (String(domain).endsWith("qa.invalid")) return Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
  return originalResolveMx.call(dns.promises, domain, ...rest);
};
syncBuiltinESMExports();
