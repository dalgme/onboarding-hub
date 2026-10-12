// 시계(tick)·장부 — 인증 · 완주 기록 · heartbeat · 토큰 전환 푸시 · 백오프 재확인 · 카드 거둠 · GitHub 2시간 재요청 ·
// claimed 청소 · 미진행 리마인드(창·정지 조건·일일 상한·2회) · 09:00 요약 · 미확인 다이제스트 · 내 차례 재알림 · 보낼 카톡 버튼 3개
import { ko } from "../../src/content/ko.ts";
import {
  APP, GUEST_EMAIL, HOUR, DAY, iso, kst,
  createProject, rest, notices, qa, setStep, getStep, tick,
  adminPage, go, bodyText, waitFor, clipboardText,
} from "../lib/harness.mjs";

export default async function run({ browser, t }) {
  // 평일 수요일 — 리마인드 창(10~18시 KST)·요약(09~21시)을 벽시계와 무관하게 재현한다
  const WED = "2026-10-14";
  const fx = await createProject({ code: "gamma", tier: "self", includeAi: true, accessSentAt: iso(-5 * DAY), lastSeenAt: iso(-DAY) });
  const stepOf = (key) => rest.one("steps", { project_id: `eq.${fx.project.id}`, key: `eq.${key}` });

  // T1 인증 — 비밀 없음·틀림 → 401
  t.eq("T1 비밀 없이 → 401", (await tick(null, null)).status, 401);
  t.eq("T1b 틀린 비밀 → 401", (await tick(null, "nope")).status, 401);

  // T2 완주 — finishedAt · admins.last_tick_finished_at · heartbeat
  await qa.clearCalls();
  const first = await tick(iso());
  t.ok("T2 tick 완주 보고서", first.status === 200 && Boolean(first.body.finishedAt) && first.body.errors.length === 0, first.body);
  const adminRow = (await rest.get("admins"))[0];
  t.ok("T2b admins.last_tick_finished_at 기록", Boolean(adminRow.last_tick_finished_at));
  t.eq("T2c 첫 tick 은 토큰을 점검한다", first.body.tokens, "checked");
  t.eq("T2d heartbeat 전송", first.body.heartbeat, "sent");
  const calls = await qa.calls();
  t.ok("T2e 바깥 호출은 전부 모의 서버로 (heartbeat.qa.local)", calls.some((c) => c.host === "heartbeat.qa.local"));
  t.eq("T2f 토큰 전부 정상이면 전환 푸시 없음", (await notices({ kind: "eq.token_event" })).length, 0);
  const again = await tick(iso());
  t.eq("T2g 55분 안 재실행은 토큰 점검을 건너뛴다", again.body.tokens, "skipped");
  {
    const admin = await adminPage(browser);
    await go(admin.page, "/a");
    t.includes("T2h 대시보드 크론 배지 「정상」", await bodyText(admin.page), `${ko.admin.tick.title} 정상`);
    await admin.context.close();
  }

  // T3 토큰 전환 — 빨강으로 바뀔 때 1회, 복구 1회. 지속 중에는 조용
  await qa.scenario({ github: { token: "invalid" } });
  const red = await tick(iso(2 * HOUR));
  t.eq("T3 토큰 오류 전환 → 푸시 1건", red.body.tokenEvents, 1);
  const redNotice = (await notices({ kind: "eq.token_event" }))[0];
  t.ok("T3b 장부 detail = GITHUB_TOKEN:red (토큰 값 없음)", redNotice?.detail === "GITHUB_TOKEN:red" && redNotice.dedupe_key.startsWith("token_red:GITHUB_TOKEN:"));
  const stillRed = await tick(iso(4 * HOUR));
  t.eq("T3c 빨강 지속 중에는 조용", stillRed.body.tokenEvents, 0);
  await qa.scenario({ github: { token: "ok" } });
  const ok = await tick(iso(6 * HOUR));
  t.eq("T3d 복구 전환 → 푸시 1건", ok.body.tokenEvents, 1);
  t.ok("T3e 복구 장부 token_ok", (await notices({ kind: "eq.token_event" })).some((n) => n.detail === "GITHUB_TOKEN:ok"));

  // T4 백오프 재확인 — next_check_at 이 지난 완료 요청만, 확인되면 「다음 안내」 카드(의뢰인이 접속 중 아님)
  await rest.update("projects", { id: `eq.${fx.project.id}` }, { github_org: "acme-shop" });
  const gh = fx.byKey["connect-github"];
  const base = iso(-10 * 60_000);
  await setStep(gh.id, {
    status: "client_done",
    checked_at: base,
    verify_result: { status: "not_found", code: "check_invite", owner: "client", checked_at: base, client_attempts: 1, auto_checks: 0, next_check_at: iso(-60_000), first_failed_at: base },
  });
  await qa.scenario({ github: { membership: "not_invited" } });
  const futureOnly = await tick(iso(-5 * 60_000));
  t.eq("T4 아직 next_check_at 전이면 재확인하지 않는다", futureOnly.body.reverified, 0);
  const re1 = await tick(iso());
  const afterRe1 = await getStep(gh.id);
  t.ok("T4b 백오프 시각이 지나면 재확인: auto_checks 1, 같은 원인이라 first_failed_at 유지", re1.body.reverified === 1 && afterRe1.verify_result.auto_checks === 1 && afterRe1.verify_result.first_failed_at === base, afterRe1.verify_result);
  t.ok("T4c 다음 확인은 30분 뒤 (5m→30m 백오프)", new Date(afterRe1.verify_result.next_check_at).getTime() - new Date(afterRe1.verify_result.checked_at).getTime() === 30 * 60_000);
  await qa.scenario({ github: { membership: "active" } });
  await setStep(gh.id, { verify_result: { ...afterRe1.verify_result, next_check_at: iso(-1000) } });
  const re2 = await tick(iso());
  const verified = await getStep(gh.id);
  t.ok("T4d 수락이 반영되면 verified", re2.body.reverified === 1 && verified.status === "verified");
  const nextCard = await waitFor(async () => (await notices({ kind: "eq.next_step", status: "eq.pending" }))[0] ?? null, { label: "next_step 카드" });
  t.ok("T4e 자동 확인 → 「연결 확인 · 다음 안내」 카드 (다음 = Vercel)", nextCard.body.includes("Vercel 팀 만들고 초대하기") && nextCard.body.includes(`${APP}/p/gamma`), nextCard.body);
  const autoPush = await notices({ kind: "eq.verify_event", dedupe_key: `like.verify_event:${gh.id}:verified:%` });
  t.eq("T4f 확인 푸시 1건 (카드가 있다고 말한다)", autoPush.length, 1);

  // T5 거둠 — 카드가 만들어진 뒤 의뢰인이 포털에 들어오면 필요 없다
  await rest.update("project_guests", { project_id: `eq.${fx.project.id}` }, { last_seen_at: iso(60_000) });
  const sweep = await tick(iso(2 * 60_000));
  const swept = await rest.one("notices", { id: `eq.${nextCard.id}` });
  t.ok("T5 의뢰인 접속 뒤 tick 이 카드를 거둔다 (condition_cleared)", sweep.body.outbox.cleared >= 1 && swept.status === "skipped" && swept.skip_reason === "condition_cleared");
  await rest.update("project_guests", { project_id: `eq.${fx.project.id}` }, { last_seen_at: iso(-DAY) });

  // T6 GitHub check_invite 2시간 지속 → 되돌림 + 재요청 카드 (+낮이면 푸시)
  const vc = fx.byKey["connect-vercel"];
  await setStep(gh.id, { status: "client_done", verified_at: null, checked_at: iso(-3 * HOUR), verify_result: { status: "not_found", code: "check_invite", owner: "client", checked_at: iso(-3 * HOUR), client_attempts: 1, auto_checks: 2, next_check_at: iso(HOUR), first_failed_at: iso(-3 * HOUR) } });
  await qa.scenario({ github: { membership: "not_invited" } });
  const night = await tick(kst(WED, 2));
  const returnedAtNight = await getStep(gh.id);
  t.eq("T6 2시간 지속 → 「한 가지만 더」(returned)", returnedAtNight.status, "returned");
  const rerequest = (await notices({ kind: "eq.rerequest", status: "eq.pending" }))[0];
  t.ok("T6b 재요청 카드: 초대 화면 주소 + 역할 Owner", rerequest && rerequest.body.includes("https://github.com/orgs/acme-shop/people") && rerequest.body.includes("Owner"), rerequest?.body);
  t.eq("T6c 밤에는 카드만 만들고 푸시는 없다", (await notices({ dedupe_key: `like.outbox_push:rerequest:${gh.id}:%` })).length, 0);
  void night;
  // 같은 원인 사이클(first_failed_at 같은 에폭)이면 다시 만들지 않는다 — 멱등 키. 새 사이클이어야 새 카드 + 푸시
  await setStep(gh.id, { status: "client_done", verify_result: { ...returnedAtNight.verify_result } });
  const sameEpoch = await tick(kst(WED, 10));
  const sameEpochCards = await notices({ kind: "eq.rerequest", channel: "eq.outbox" });
  t.ok("T6c2 같은 에폭의 재요청은 다시 만들지 않는다 (멱등 키·푸시 없음)", sameEpochCards.length === 1 && sameEpoch.body.errors.length === 0 && (await notices({ dedupe_key: `like.outbox_push:rerequest:${gh.id}:%` })).length === 0, { cards: sameEpochCards.length, errors: sameEpoch.body.errors });
  await setStep(gh.id, { status: "client_done", verify_result: { ...returnedAtNight.verify_result, first_failed_at: iso(-5 * HOUR), checked_at: iso(-5 * HOUR) } });
  const day = await tick(kst(WED, 11));
  const dayCards = await notices({ kind: "eq.rerequest", channel: "eq.outbox" }); // 푸시 장부(channel=push)는 kind 가 같아도 카드가 아니다
  t.ok("T6d 새 사이클은 새 카드(옛 카드는 대체) + 낮이라 푸시 1건", dayCards.length === 2 && dayCards[0].status === "superseded" && dayCards[1].status === "pending" && (await notices({ dedupe_key: `like.outbox_push:rerequest:${gh.id}:%` })).length === 1, { cards: dayCards.map((c) => c.status), report: day.body.outbox });

  // T7 claimed 청소 — 10분 넘게 claimed 는 failed
  await rest.insert("notices", { project_id: fx.project.id, kind: "client_event", channel: "push", dedupe_key: "stale-claim-1", status: "claimed", claimed_at: iso(-20 * 60_000), day_kst: WED });
  const claims = await tick(kst(WED, 11, 30));
  t.ok("T7 10분 넘은 claimed → failed", claims.body.staleClaims >= 1 && (await rest.one("notices", { dedupe_key: "eq.stale-claim-1" })).status === "failed");

  // T8 미진행 리마인드 — 평일 낮 · 3일/7일 · 프로젝트당 하루 1건 · 정지 조건 · 결제 단계 제외
  // 기준 시각들은 주입할 now(수요일 11시) 기준으로 5일 전 — 벽시계가 아니라 tick 의 시계로 잰다
  const NOW_WED = kst(WED, 11);
  const old = new Date(new Date(NOW_WED).getTime() - 5 * DAY).toISOString();
  await setStep(gh.id, { status: "verified", verified_at: old, checked_at: old, verify_result: null });
  await setStep(vc.id, { status: "todo" });
  await rest.update("projects", { id: `eq.${fx.project.id}` }, { created_at: old, access_sent_at: old });
  await rest.update("steps", { project_id: `eq.${fx.project.id}` }, { created_at: old });
  for (const key of Object.keys(fx.byKey)) await rest.update("steps", { id: `eq.${fx.byKey[key].id}` }, { updated_at: old });
  await rest.update("steps", { id: `eq.${gh.id}` }, { updated_at: old, verified_at: old });
  await rest.remove("notices", { kind: "eq.rerequest" });
  const payment = await tick(kst(WED, 10, 30));
  t.ok("T8 다음 단계가 결제 단계(Vercel Pro)면 문구 대신 칩으로만 (payment_step)", payment.body.reminders.created === 0 && (payment.body.reminders.skipped.payment_step ?? 0) === 1, payment.body.reminders);
  await setStep(vc.id, { status: "verified", verified_at: old, checked_at: null, updated_at: old });
  const weekend = await tick(kst("2026-10-17", 11)); // 토요일
  t.eq("T8a 주말에는 리마인드 문구를 만들지 않는다", weekend.body.reminders.created, 0);
  const evening = await tick(kst(WED, 19));
  t.eq("T8b 평일 18시 이후도 만들지 않는다", evening.body.reminders.created, 0);
  const r1 = await tick(kst(WED, 11, 5));
  const reminder1 = (await notices({ kind: "eq.reminder", status: "eq.pending" }))[0] ?? null;
  t.ok("T8c 평일 11시, 5일째 그대로 → 1차 리마인드 (다음 단계 Supabase 주소)", r1.body.reminders.created === 1 && reminder1?.detail === "round:1" && reminder1?.body.includes(`${APP}/p/gamma/steps/connect-supabase`), r1.body);
  t.ok("T8d dedupe 키에 에폭(기준 시각)과 회차", /^reminder:[0-9a-f-]+:connect-supabase:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:1$/.test(reminder1?.dedupe_key ?? ""), reminder1?.dedupe_key);
  const r1Again = await tick(kst(WED, 14));
  t.ok("T8e 같은 날 두 번째는 같은 키라 만들지 않는다 (duplicate)", r1Again.body.reminders.created === 0 && (r1Again.body.reminders.skipped.duplicate ?? 0) === 1, r1Again.body.reminders);
  const r2 = await tick(kst("2026-10-16", 11)); // 금요일, 7일째
  const reminder2 = (await notices({ kind: "eq.reminder", status: "eq.pending" }))[0] ?? null;
  t.ok("T8f 7일째 → 2차(화면공유 제안)가 1차를 대체", r2.body.reminders.created === 1 && reminder2?.detail === "round:2" && (await rest.one("notices", { id: `eq.${reminder1.id}` })).status === "superseded", r2.body);
  await rest.update("projects", { id: `eq.${fx.project.id}` }, { remind_paused_until: kst("2026-10-20", 0) });
  const paused = await tick(kst("2026-10-16", 12));
  t.ok("T8g 보류 중이면 paused 로 건너뛴다", (paused.body.reminders.skipped.paused ?? 0) === 1 && paused.body.reminders.created === 0, paused.body.reminders);
  const pausedSweep = await rest.one("notices", { id: `eq.${reminder2.id}` });
  t.eq("T8h 보류하면 남아 있던 리마인드 카드도 거둔다", pausedSweep.status, "skipped");
  await rest.update("projects", { id: `eq.${fx.project.id}` }, { remind_paused_until: null, support_tier: "assisted" });
  const assisted = await tick(kst("2026-10-16", 12, 30));
  t.ok("T8i assisted 등급은 리마인드 대상이 아니다", (assisted.body.reminders.skipped.assisted ?? 0) === 1, assisted.body.reminders);
  await rest.update("projects", { id: `eq.${fx.project.id}` }, { support_tier: "self" });
  await setStep(fx.byKey["connect-supabase"].id, { status: "blocked", blocked_reason: "조직 화면을 못 찾겠어요" });
  const blocked = await tick(kst("2026-10-16", 13));
  t.ok("T8j 막힌 단계가 있으면 재촉하지 않는다", (blocked.body.reminders.skipped.blocked ?? 0) === 1, blocked.body.reminders);
  await setStep(fx.byKey["connect-supabase"].id, { status: "todo", blocked_reason: null });

  // T9 09:00 요약 — 보낼 카톡·내 차례·미답·막힘이 하나라도 있으면 하루 1건
  // (주입한 시각 기준으로는 백오프가 다 지나 있어 tick 이 다시 확인한다 — 시나리오를 「수락 전」으로 두어 원인이 유지되게)
  await qa.scenario({ vercel: { team: "listed", member: "pending" } });
  await rest.update("projects", { id: `eq.${fx.project.id}` }, { vercel_team: "acme-shop" });
  await setStep(vc.id, { status: "client_done", checked_at: iso(-DAY), verify_result: { status: "not_found", code: "pending_accept", owner: "admin", checked_at: iso(-DAY), client_attempts: 1, auto_checks: 3, next_check_at: iso(DAY), first_failed_at: iso(-2 * DAY) } });
  const daily = await tick(kst("2026-10-16", 9, 30));
  t.ok("T9 09:30 첫 tick → 하루 요약 푸시", daily.body.daily === true || (await notices({ dedupe_key: "eq.daily:2026-10-16" })).length === 1, daily.body);
  const dailyAgain = await tick(kst("2026-10-16", 10, 30));
  t.ok("T9b 같은 날 두 번째 요약 없음", (await notices({ dedupe_key: "eq.daily:2026-10-16" })).length === 1 && dailyAgain.body.daily === false);
  t.eq("T9c 내 차례(초대 수락 대기) 하루 넘김 → await_admin 재알림 1건", (await notices({ dedupe_key: `eq.await_admin:${vc.id}:2026-10-16` })).length, 1);
  const earlyDaily = await tick(kst("2026-10-17", 7));
  t.eq("T9d 07시에는 요약·재알림이 없다 (깨어 있는 시간 밖)", earlyDaily.body.daily, false);

  // T10 미확인 다이제스트 — 급한 푸시가 30분 넘게 열리지 않았으면 4시간에 한 번 묶어 알린다
  await rest.insert("notices", { project_id: fx.project.id, step_id: vc.id, kind: "client_event", channel: "push", dedupe_key: `client_event:${vc.id}:need_help:2026-10-16T05:00`, status: "sent", sent_at: new Date(new Date(kst("2026-10-16", 15)).getTime() - 40 * 60_000).toISOString(), day_kst: "2026-10-16" });
  const digest = await tick(kst("2026-10-16", 15));
  t.ok("T10 미확인 급한 알림 → 다이제스트 장부 1건 (받을 기기가 없어 발송은 failed)", (await notices({ dedupe_key: "like.todo_digest:%" })).length === 1, digest.body);
  const digestAgain = await tick(kst("2026-10-16", 16));
  t.eq("T10b 4시간 안에는 다시 묶지 않는다", digestAgain.body.digest, false);

  // T11 「보낼 카톡」 버튼 — 보내기(복사) · 보내지 않음 · 되돌리기
  await rest.update("notices", { kind: "eq.reminder" }, { status: "superseded" });
  const [card] = await rest.insert("notices", { project_id: fx.project.id, kind: "next_step", channel: "outbox", dedupe_key: "ui-card-1", status: "pending", title: "검수 카드", body: `안녕하세요 김의뢰님, 확인됐습니다. ${APP}/p/gamma`, day_kst: WED });
  const [card2] = await rest.insert("notices", { project_id: fx.project.id, kind: "scope_ready", channel: "outbox", dedupe_key: "ui-card-2", status: "pending", title: "검수 카드 2", body: "두 번째 문구", day_kst: WED });
  const admin = await adminPage(browser);
  await go(admin.page, "/a");
  const outboxText = await bodyText(admin.page);
  t.includes("T11 대시보드 최상단 「보낼 카톡 N건」", outboxText, ko.admin.outbox.countTitle(2));
  const firstCard = admin.page.locator("li", { hasText: "검수 카드" }).filter({ hasText: "확인됐습니다" }).first();
  await firstCard.getByRole("button", { name: ko.admin.outbox.send }).click();
  await admin.page.getByText(ko.admin.outbox.copied).waitFor({ timeout: 10000 });
  t.ok("T11b 「카톡으로 보내기」(PC) → 클립보드에 문구 전문", (await clipboardText(admin.page)).includes(`${APP}/p/gamma`));
  const sent = await waitFor(async () => {
    const row = await rest.one("notices", { id: `eq.${card.id}` });
    return row.status === "sent" ? row : null;
  }, { label: "sent 기록" });
  t.ok("T11c 장부 sent + sent_at", Boolean(sent.sent_at));
  await admin.page.locator("li", { hasText: "두 번째 문구" }).first().getByRole("button", { name: ko.admin.outbox.skip }).click();
  const skipped = await waitFor(async () => {
    const row = await rest.one("notices", { id: `eq.${card2.id}` });
    return row.status === "skipped" ? row : null;
  }, { label: "skipped 기록" });
  t.eq("T11d 「보내지 않음」 → skipped/admin", skipped.skip_reason, "admin");
  await admin.page.locator("details", { hasText: ko.admin.outbox.recent }).locator("summary").click();
  await admin.page.getByRole("button", { name: ko.admin.outbox.restore }).first().click();
  const restored = await waitFor(async () => {
    const rows = await rest.get("notices", { id: `in.(${card.id},${card2.id})`, status: "eq.pending" });
    return rows.length === 1 ? rows[0] : null;
  }, { label: "되돌리기" });
  t.ok("T11e 「되돌리기」 → 다시 pending (sent_at·skip_reason 비움)", restored.sent_at === null && restored.skip_reason === null);
  void GUEST_EMAIL;
  await admin.context.close();
}
