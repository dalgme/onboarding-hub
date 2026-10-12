// API 라우트·푸시 배달 — 푸시 ack(배달됨) · 구독 등록 권한 · 클라이언트 오류 보고 · 도우미 비활성 · 실제 web-push 전송과 죽은 구독 정리
import { ko } from "../../src/content/ko.ts";
import {
  APP, GUEST_EMAIL, iso,
  createProject, rest, notices, qa, seedPushSubscription, tick,
  adminPage, guestPage, waitFor, go,
} from "../lib/harness.mjs";

export default async function run({ browser, t }) {
  const fx = await createProject({ code: "acme", tier: "self", includeAi: true });
  const admin = await adminPage(browser);
  const guest = await guestPage(browser);

  // K1 /api/push/ack — 등록된 구독 endpoint 만 통과, 장부 acked_at
  await rest.insert("notices", { project_id: fx.project.id, kind: "client_event", channel: "push", dedupe_key: "ack-me", status: "sent", sent_at: iso(), day_kst: "2026-10-12" });
  const unknown = await guest.page.request.post(`${APP}/api/push/ack`, { data: { key: "ack-me", endpoint: "https://push.qa.local/unknown" } });
  t.eq("K1 모르는 endpoint 의 ack → 403", unknown.status(), 403);
  const sub = await seedPushSubscription({ endpoint: "https://push.qa.local/sub/ack" });
  const acked = await guest.page.request.post(`${APP}/api/push/ack`, { data: { key: "ack-me", endpoint: "https://push.qa.local/sub/ack" } });
  t.eq("K1b 등록된 endpoint → 204", acked.status(), 204);
  const notice = await rest.one("notices", { dedupe_key: "eq.ack-me" });
  const subRow = await rest.one("push_subscriptions", { id: `eq.${sub.id}` });
  t.ok("K1c notices.acked_at + push_subscriptions.last_ack_at", Boolean(notice.acked_at) && Boolean(subRow.last_ack_at));
  const bad = await guest.page.request.post(`${APP}/api/push/ack`, { data: { key: "" } });
  t.eq("K1d 잘못된 본문 → 400", bad.status(), 400);

  // K2 /api/push/subscribe — 관리자만
  const body = { endpoint: "https://push.qa.local/sub/admin", keys: { p256dh: "x".repeat(20), auth: "y".repeat(10) } };
  const asGuest = await guest.page.request.post(`${APP}/api/push/subscribe`, { data: body });
  t.eq("K2 의뢰인 구독 등록 → 401", asGuest.status(), 401);
  const asAdmin = await admin.page.request.post(`${APP}/api/push/subscribe`, { data: body });
  t.eq("K2b 관리자 구독 등록 → 204", asAdmin.status(), 204);
  t.eq("K2c 구독 행 저장 (upsert)", (await rest.get("push_subscriptions", { endpoint: "eq.https://push.qa.local/sub/admin" })).length, 1);
  const twice = await admin.page.request.post(`${APP}/api/push/subscribe`, { data: body });
  t.ok("K2d 같은 endpoint 재등록은 중복 없이 204", twice.status() === 204 && (await rest.get("push_subscriptions", { endpoint: "eq.https://push.qa.local/sub/admin" })).length === 1);
  const removed = await admin.page.request.delete(`${APP}/api/push/subscribe`, { data: { endpoint: body.endpoint } });
  t.ok("K2e 구독 해제 → 204 + 행 삭제", removed.status() === 204 && (await rest.get("push_subscriptions", { endpoint: "eq.https://push.qa.local/sub/admin" })).length === 0);

  // K3 /api/client-error — 로그로만, 항상 204
  const reported = await guest.page.request.post(`${APP}/api/client-error`, { data: { message: "검수용 오류", path: "/p/acme" } });
  t.eq("K3 화면 오류 보고 → 204", reported.status(), 204);
  const garbage = await guest.page.request.post(`${APP}/api/client-error`, { data: { nope: 1 } });
  t.eq("K3b 형식이 틀려도 204 (의뢰인 화면을 막지 않는다)", garbage.status(), 204);

  // K4 /api/assist — 키가 없으면 조용히 비활성, 로그인 없이는 401, 연결 단계가 아니면 400
  const anonymous = await (await browser.newContext()).request.post(`${APP}/api/assist`, { data: { code: "acme", stepKey: "connect-github", messages: [{ role: "user", content: "안녕" }] } });
  t.eq("K4 비로그인 도우미 → 401", anonymous.status(), 401);
  const unavailable = await guest.page.request.post(`${APP}/api/assist`, { data: { code: "acme", stepKey: "connect-github", messages: [{ role: "user", content: "어디를 눌러요?" }] } });
  t.ok("K4b 키 없음 → 「준비되지 않았습니다」 안내 (200)", unavailable.status() === 200 && (await unavailable.json()).reply === ko.assist.unavailable);
  const notConnect = await guest.page.request.post(`${APP}/api/assist`, { data: { code: "acme", stepKey: "scope-review", messages: [{ role: "user", content: "x" }] } });
  t.eq("K4c 연결 단계가 아니면 400", notConnect.status(), 400);
  const calls = await qa.calls();
  t.ok("K4d Anthropic 으로 나간 호출 없음", !calls.some((c) => c.host.includes("anthropic")));

  // K5 실제 푸시 전송 — 의뢰인 행동 → web-push → (모의) 푸시 서비스 201 → 장부 sent, TTL 1시간, topic
  await rest.remove("push_subscriptions", { id: `neq.${sub.id}` });
  await qa.clearCalls();
  const step = fx.byKey["scope-review"];
  await go(guest.page, `${APP}/p/acme/steps/scope-review`);
  await guest.page.getByRole("button", { name: ko.stepDetail.helpButton }).click();
  await guest.page.getByText(ko.stepDetail.helpSent).waitFor({ timeout: 10000 });
  const pushNotice = await waitFor(async () => {
    const rows = await notices({ dedupe_key: `like.client_event:${step.id}:need_help:%` });
    return rows[0]?.status === "sent" ? rows[0] : null;
  }, { label: "푸시 sent" });
  t.ok("K5 화면공유 요청 → 푸시 장부 sent + sent_at", Boolean(pushNotice.sent_at));
  const pushCalls = (await qa.calls()).filter((c) => c.host === "push.qa.local");
  t.ok("K5b 푸시 서비스로 실제 전송 1건 (TTL 3600 · topic 32자)", pushCalls.length === 1 && pushCalls[0].push.ttl === "3600" && String(pushCalls[0].push.topic ?? "").length === 32, pushCalls);
  t.ok("K5c 전송 본문은 암호화돼 있다 (길이 > 0)", (pushCalls[0]?.push.bytes ?? 0) > 100);

  // K6 죽은 구독(410) 은 목록에서 지운다 — 다음 전송부터 조용히
  await qa.scenario({ push: "gone" });
  await go(guest.page, `${APP}/p/acme/steps/domain`);
  await guest.page.getByRole("button", { name: ko.stepDetail.blockedButton }).click();
  await guest.page.fill("#blocked-reason", "도메인을 어디서 사야 할지");
  await guest.page.getByRole("button", { name: ko.stepDetail.blockedSubmit }).click();
  await guest.page.getByText(ko.stepDetail.blockedSent).waitFor({ timeout: 10000 });
  const gone = await waitFor(async () => {
    const rows = await notices({ dedupe_key: `like.client_event:${fx.byKey.domain.id}:blocked:%` });
    return rows[0] && rows[0].status !== "claimed" ? rows[0] : null;
  }, { label: "gone 처리" });
  t.eq("K6 410 → 장부 failed (보냈다고 적지 않는다)", gone.status, "failed");
  await waitFor(async () => (await rest.get("push_subscriptions", { id: `eq.${sub.id}` })).length === 0, { label: "죽은 구독 삭제" });
  t.ok("K6b 죽은 구독은 삭제된다", true);
  await qa.scenario({ push: "ok" });

  // K7 tick 의 토큰 점검도 바깥으로 나가지 않는다 — 호출 호스트 목록
  await qa.clearCalls();
  await tick(iso(2 * 60 * 60_000));
  const hosts = new Set((await qa.calls()).map((c) => c.host));
  t.ok("K7 tick 이 부르는 바깥 호스트 = GitHub·Vercel·Supabase·heartbeat 뿐 (전부 모의)", [...hosts].every((h) => ["api.github.com", "api.vercel.com", "api.supabase.com", "heartbeat.qa.local"].includes(h)), [...hosts]);
  void GUEST_EMAIL;
  await admin.context.close();
  await guest.context.close();
}
