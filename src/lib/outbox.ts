import { createAdminClient } from "@/lib/supabase/admin";
import { onboardingClientSteps, reminderStopReason } from "@/lib/todo";
import { pushAdmin, dayKst, minuteOf } from "@/lib/notify";
import { CONNECT_META, SIMPLE_CONNECT_META } from "@/lib/steps";
import { ko } from "@/content/ko";
import { redact } from "@/lib/redact";
import { returnStep, runVerification } from "@/lib/verify/run";
import type { NoticeKind, NoticeRow, StepStatus, VerifyResult } from "@/lib/database.types";

// 「보낼 카톡」 — 의뢰인에게 전할 말을 시스템이 완성 문구로 써서 장부(notices,
// channel='outbox')에 둔다. 허브는 의뢰인에게 직접 보내지 않는다. 관리자가
// 대시보드에서 「카톡으로 보내기」를 누르면 그 순간 sent 로 기록된다.
//
// 규칙:
//  - dedupe_key 는 에폭을 포함한다. 같은 키는 두 번 만들지 않는다
//  - 같은 주제(project, kind, step)의 pending 은 새 문구가 대체한다(superseded)
//  - 근거 조건이 사라진 pending 은 tick 이 거둔다(skipped/condition_cleared) —
//    관리자가 철 지난 문구를 보내는 일을 코드로 막는다
//  - body 에 비밀번호·토큰·로그인 링크를 넣지 않는다

export interface StepInfo {
  id: string;
  key: string;
  title: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientName: string;
}

interface OutboxCreate {
  kind: NoticeKind;
  projectId: string;
  stepId?: string | null;
  dedupeKey: string;
  title: string;
  body: string;
  detail?: string;
  // 같은 사건의 푸시가 이미 나갔으면 null — 한 사건에 알림은 하나다
  push?: { title: string; body: string } | null;
}

export type OutboxItem = NoticeRow & {
  projects: { code: string; name: string; client_name: string } | null;
};

const RERQUEST_AFTER_MS = 2 * 60 * 60_000; // GitHub check_invite 가 2시간 지속되면 「한 가지만 더」 + 재요청 문구
const STALE_AFTER_MS = 4 * 60 * 60_000;
const RECENT_WINDOW_MS = 24 * 60 * 60_000;
const ONLINE_WINDOW_MS = 15 * 60_000; // 이 안에 포털을 봤으면 「지금 보고 있다」로 친다
const QUIET_START_KST = 21; // 적체 알림은 09~21시 KST 에만
const QUIET_END_KST = 9;

export function portalUrl(code: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return `${site}/p/${code}`;
}

function inWakingHours(now: Date): boolean {
  const hour = new Date(now.getTime() + 9 * 60 * 60_000).getUTCHours();
  return hour >= QUIET_END_KST && hour < QUIET_START_KST;
}

export async function createOutbox(input: OutboxCreate): Promise<"created" | "duplicate" | "failed"> {
  try {
    const admin = createAdminClient();
    const now = new Date();
    // 같은 주제의 pending 은 대체한다 (일일 상한 인덱스와 충돌하지 않게 삽입 전에).
    // 답글 알림은 답글마다 별개다 — 앞선 답글 본문을 지우지 않는다
    if (input.kind !== "admin_replied") {
      // 재요청과 리마인드는 「같은 단계에 카드 1장」 — 종류가 달라도 서로 대체한다
      const kinds: NoticeKind[] = input.kind === "rerequest" || input.kind === "reminder" ? ["rerequest", "reminder"] : [input.kind];
      let supersede = admin
        .from("notices")
        .update({ status: "superseded" })
        .eq("project_id", input.projectId)
        .in("kind", kinds)
        .eq("channel", "outbox")
        .eq("status", "pending")
        .neq("dedupe_key", input.dedupeKey);
      supersede = input.stepId ? supersede.eq("step_id", input.stepId) : supersede.is("step_id", null);
      await supersede;
    }

    const { data, error } = await admin
      .from("notices")
      .upsert(
        {
          project_id: input.projectId,
          step_id: input.stepId ?? null,
          kind: input.kind,
          channel: "outbox",
          dedupe_key: input.dedupeKey,
          status: "pending",
          title: input.title,
          body: input.body,
          day_kst: dayKst(now),
          detail: input.detail?.slice(0, 300) ?? null,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      // 23505 = 일일 상한 부분 유니크 인덱스(reminder·escalation) 충돌 — 오늘 몫은 이미 만들었다
      if (error.code === "23505") return "duplicate";
      console.error("[outbox] 문구 기록 실패", { key: input.dedupeKey, message: redact(error.message) });
      return "failed";
    }
    if (!data || data.length === 0) return "duplicate";
    if (input.push) {
      await pushAdmin({
        dedupeKey: `outbox_push:${input.dedupeKey}`,
        kind: input.kind,
        projectId: input.projectId,
        stepId: input.stepId ?? null,
        ...input.push,
        url: "/a#outbox",
      });
    }
    return "created";
  } catch (cause) {
    console.error("[outbox] 처리 실패", { key: input.dedupeKey, message: redact(cause) });
    return "failed";
  }
}

type ProjectLite = {
  id: string;
  status: string;
  support_tier: string;
  remind_paused_until: string | null;
};

type StepLite = {
  id: string;
  key: string;
  title: string;
  status: StepStatus;
  owner_side: string;
  order_index: number;
  verify_result?: VerifyResult | null;
  updated_at?: string;
};

const CLIENT_OPEN = new Set<StepStatus>(["todo", "doing", "blocked", "returned"]);

// 온보딩 국면(첫 제작자 단계 앞)에서 「지금 의뢰인이 할 다음 일」을 고른다.
// 방금 확인한 단계보다 뒤를 먼저 보되, 없으면 앞쪽에 미뤄 둔 단계로 돌아간다 —
// 단계를 순서대로 하지 않는 의뢰인이 흔하고, 4번이 끝났다고 2번이 사라지지 않는다.
// 「여기까지입니다」는 남은 의뢰인 단계가 정말 하나도 없을 때만 말할 수 있다(§4-2).
function nextClientWork(
  steps: StepLite[],
  current: StepLite | undefined,
): { next: StepLite | null; pendingMine: boolean } {
  const unfinished = onboardingClientSteps(steps).filter(
    (step) => step.status !== "verified" && step.status !== "skipped",
  );
  const clientTurn = unfinished.filter((step) => CLIENT_OPEN.has(step.status));
  const next =
    (current ? clientTurn.find((step) => step.order_index > current.order_index) : null) ?? clientTurn[0] ?? null;
  // 남은 것이 전부 client_done 이면 공은 내 쪽에 있다 — 「개발을 시작합니다」가 아니라 「제가 확인 중」이다
  return { next, pendingMine: next === null && unfinished.length > 0 };
}

// 연결이 확인됐다 → 「확인됐습니다 + 다음은 …」 문구. 푸시는 검증 쪽에서 이미 나갔다
export async function onStepVerified(
  step: StepInfo,
  verifiedAt: string,
  trigger: "client" | "admin" | "auto",
): Promise<"created" | "skipped"> {
  // 의뢰인이 방금 「완료했습니다」를 눌러 그 자리에서 확인된 것이다 — 포털이 이미
  // 「확인됐습니다·다음」을 보여주고 있다. 카톡 문구를 만들 이유가 없다
  if (trigger === "client") return "skipped";
  const admin = createAdminClient();
  const [{ data: project }, { data: steps }, { data: guests }] = await Promise.all([
    admin.from("projects").select("status").eq("id", step.projectId).maybeSingle(),
    admin
      .from("steps")
      .select("id, key, title, status, owner_side, order_index")
      .eq("project_id", step.projectId),
    admin.from("project_guests").select("last_seen_at").eq("project_id", step.projectId),
  ]);
  if (!project || project.status === "closed") return "skipped";
  // 의뢰인이 지금 포털에 있다(방금 「완료했습니다」를 눌렀다) — 포털이 이미 「확인됐습니다·다음」을
  // 보여준다. 카드를 만들었다가 다음 tick 에 거두는 사이 내가 보내는 일을 만들지 않는다
  const recentlySeen = (guests ?? []).some(
    (guest) => guest.last_seen_at && Date.now() - new Date(guest.last_seen_at).getTime() < ONLINE_WINDOW_MS,
  );
  if (recentlySeen) return "skipped";
  const all = (steps ?? []) as StepLite[];
  const { next, pendingMine } = nextClientWork(all, all.find((row) => row.id === step.id));
  const outcome = await createOutbox({
    kind: "next_step",
    projectId: step.projectId,
    stepId: step.id,
    dedupeKey: `next_step:${step.id}:${minuteOf(verifiedAt)}`,
    // 거둠 판정용: 이 카드가 가리킨 다음 단계. 없으면 「의뢰인 작업 끝」 안내다
    detail: next ? `next:${next.id}` : "next:none",
    title: ko.outbox.titles.nextStep(step.title),
    body: ko.outbox.nextStep({
      client: step.clientName,
      stepTitle: step.title,
      nextTitle: next?.title ?? null,
      pendingMine,
      portalUrl: portalUrl(step.projectCode),
    }),
    push: null,
  });
  return outcome === "created" ? "created" : "skipped";
}

// 의뢰인 원인이 확정된 결과 → 재요청 문구. 지금은 GitHub no_slug 만 즉시,
// GitHub check_invite 는 2시간 지속 후 tick 이 만든다(반영 지연을 재촉으로 오해하지 않게).
// Vercel·Supabase 의 「멤버 목록에 없음」은 내 수락 전일 수 있어 여기서 만들지 않는다.
export async function onVerifyClientCause(
  step: StepInfo,
  result: VerifyResult,
  project: { github_org: string | null },
): Promise<void> {
  const meta = CONNECT_META[step.key];
  if (!meta || meta.provider !== "github") return;
  if (result.code !== "no_slug") return;
  void project;
  await createOutbox({
    kind: "rerequest",
    projectId: step.projectId,
    stepId: step.id,
    dedupeKey: `rerequest:${step.id}:no_slug:${minuteOf(result.first_failed_at ?? result.checked_at)}`,
    title: ko.outbox.titles.rerequestNoSlug(meta.serviceName),
    body: ko.outbox.rerequestNoSlug({
      client: step.clientName,
      serviceName: meta.serviceName,
      orgNoun: meta.orgNoun,
      stepTitle: step.title,
      portalUrl: portalUrl(step.projectCode),
    }),
    detail: "no_slug",
    push: null,
  });
}

// 관리자가 답글을 남겼다 → 「답글 달았습니다 + 본문 전문」 문구 (본문 전문은 길이 상한의 예외)
export async function onAdminReplied(input: {
  commentId: string;
  projectId: string;
  stepId: string | null;
  body: string;
  projectCode: string;
  clientName: string;
}): Promise<void> {
  await createOutbox({
    kind: "admin_replied",
    projectId: input.projectId,
    stepId: input.stepId,
    dedupeKey: `admin_replied:${input.commentId}`,
    title: ko.outbox.titles.adminReplied,
    body: ko.outbox.adminReplied({
      client: input.clientName,
      body: input.body,
      portalUrl: portalUrl(input.projectCode),
    }),
    push: null,
  });
}

// 접속 안내를 보냈다 — 장부에는 비밀번호 없는 본문만 남긴다. 상태는 곧바로 sent
export async function recordCredentialsSent(input: {
  projectId: string;
  email: string;
  body: string;
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date();
  await admin.from("notices").upsert(
    {
      project_id: input.projectId,
      kind: "credentials",
      channel: "outbox",
      dedupe_key: `credentials:${input.projectId}:${minuteOf(now)}`,
      status: "sent",
      title: ko.outbox.titles.credentials,
      body: input.body,
      sent_at: now.toISOString(),
      day_kst: dayKst(now),
      detail: input.email.replace(/^(.).*(@.*)$/, "$1***$2"),
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
}

// 대시보드용 목록 — 관리자 세션(RLS)으로 읽는다
export async function listOutbox(
  client: { from: ReturnType<typeof createAdminClient>["from"] },
  projectId?: string,
): Promise<{ pending: OutboxItem[]; recent: OutboxItem[] }> {
  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
  let pendingQuery = client
    .from("notices")
    .select("*, projects(code, name, client_name)")
    .eq("channel", "outbox")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(30);
  let recentQuery = client
    .from("notices")
    .select("*, projects(code, name, client_name)")
    .eq("channel", "outbox")
    .in("status", ["sent", "skipped", "superseded"])
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (projectId) {
    pendingQuery = pendingQuery.eq("project_id", projectId);
    recentQuery = recentQuery.eq("project_id", projectId);
  }
  const [{ data: pending }, { data: recent }] = await Promise.all([pendingQuery, recentQuery]);
  return {
    pending: (pending ?? []) as unknown as OutboxItem[],
    recent: (recent ?? []) as unknown as OutboxItem[],
  };
}

// tick 이 부른다: 거둠 · 2시간 재요청 · 적체 알림
export async function sweepOutbox(
  now: Date,
): Promise<{ cleared: number; superseded: number; stalePush: boolean }> {
  const admin = createAdminClient();
  const report = { cleared: 0, superseded: 0, stalePush: false };

  const { data: pendingRows } = await admin
    .from("notices")
    .select("id, kind, project_id, step_id, dedupe_key, detail, created_at")
    .eq("channel", "outbox")
    .eq("status", "pending")
    .limit(100);
  const pending = pendingRows ?? [];

  const projectIds = [...new Set(pending.map((row) => row.project_id).filter((v): v is string => Boolean(v)))];
  const commentIds = pending
    .filter((row) => row.kind === "admin_replied")
    .map((row) => row.dedupe_key.replace(/^admin_replied:/, ""));

  const reminderProjectIds = [
    ...new Set(pending.filter((row) => row.kind === "reminder").map((row) => row.project_id).filter((v): v is string => Boolean(v))),
  ];

  const [{ data: projects }, { data: steps }, { data: guests }, { data: comments }, { data: clientComments }] = await Promise.all([
    projectIds.length
      ? admin
          .from("projects")
          .select("id, status, support_tier, remind_paused_until")
          .in("id", projectIds)
      : Promise.resolve({ data: [] as ProjectLite[] }),
    projectIds.length
      ? admin
          .from("steps")
          .select("id, project_id, key, title, status, owner_side, order_index, verify_result, updated_at")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as { id: string; project_id: string; key: string; title: string; status: StepStatus; owner_side: string; order_index: number; verify_result: VerifyResult | null }[] }),
    projectIds.length
      ? admin.from("project_guests").select("project_id, last_seen_at").in("project_id", projectIds)
      : Promise.resolve({ data: [] as { project_id: string; last_seen_at: string | null }[] }),
    commentIds.length
      ? admin.from("comments").select("id, read_at").in("id", commentIds)
      : Promise.resolve({ data: [] as { id: string; read_at: string | null }[] }),
    // 리마인드 카드는 「지금도 필요한가」를 만들 때와 같은 규칙으로 다시 본다 — 의뢰인 코멘트가 필요하다
    reminderProjectIds.length
      ? admin
          .from("comments")
          .select("project_id, read_at, created_at")
          .in("project_id", reminderProjectIds)
          .eq("author_side", "client")
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { project_id: string; read_at: string | null; created_at: string }[] }),
  ]);
  const projectById = new Map((projects ?? []).map((row) => [row.id, row as ProjectLite]));
  const projectStatus = new Map((projects ?? []).map((row) => [row.id, row.status]));
  const clientCommentsByProject = new Map<string, { read_at: string | null; created_at: string }[]>();
  for (const comment of clientComments ?? []) {
    const list = clientCommentsByProject.get(comment.project_id) ?? [];
    list.push(comment);
    clientCommentsByProject.set(comment.project_id, list);
  }
  const stepsByProject = new Map<string, StepLite[]>();
  for (const step of (steps ?? []) as StepLite[] & { project_id: string }[]) {
    const list = stepsByProject.get(step.project_id) ?? [];
    list.push(step);
    stepsByProject.set(step.project_id, list);
  }
  const lastSeenByProject = new Map<string, string>();
  for (const guest of guests ?? []) {
    if (!guest.last_seen_at) continue;
    const current = lastSeenByProject.get(guest.project_id);
    if (!current || guest.last_seen_at > current) lastSeenByProject.set(guest.project_id, guest.last_seen_at);
  }
  const readByComment = new Map((comments ?? []).map((row) => [row.id, row.read_at]));

  // 거둠 — kind 별 「아직 필요한가」 판정
  const clearedIds: string[] = [];
  for (const row of pending) {
    if (!row.project_id) continue;
    const status = projectStatus.get(row.project_id);
    if (!status || (status === "closed" && row.kind !== "closed")) {
      // 종료 프로젝트는 전 종류 거둠 — 단, 「전달 완료 안내」는 종료 순서 6번(접근 회수 뒤)에 보내는 문구라 남긴다
      clearedIds.push(row.id);
      continue;
    }
    const projectSteps = (stepsByProject.get(row.project_id) ?? []) as StepLite[];
    const step = row.step_id ? projectSteps.find((item) => item.id === row.step_id) : undefined;
    let needed = true;
    if (row.kind === "next_step") {
      // 의뢰인이 그 뒤 포털에 들어왔거나, 카드가 가리킨 그 단계를 시작했으면 안내는 필요 없다
      const seen = lastSeenByProject.get(row.project_id);
      const pointedId = row.detail?.startsWith("next:") ? row.detail.slice(5) : null;
      const pointed = pointedId && pointedId !== "none" ? projectSteps.find((item) => item.id === pointedId) : null;
      const stillTodo = pointedId === "none" ? true : Boolean(pointed && pointed.status === "todo");
      needed = !(seen && seen > row.created_at) && stillTodo;
    } else if (row.kind === "rerequest") {
      // 일시 오류(system)가 코드를 잠깐 덮어써도 카드는 거두지 않는다 — 원인이 사라진 것이 아니다
      const current = step?.verify_result;
      const transient = current?.owner === "system" || (current?.status === "error" && !current.owner);
      needed = Boolean(
        step && (step.status === "client_done" || step.status === "returned") && (current?.code === row.detail || transient),
      );
    } else if (row.kind === "admin_replied") {
      const commentId = row.dedupe_key.replace(/^admin_replied:/, "");
      needed = readByComment.get(commentId) === null;
    } else if (row.kind === "reminder") {
      // 단계가 그 뒤로 조금이라도 움직였으면(상태 변화·완료 요청) 리마인드는 철 지났다.
      // returned 는 tick 이 다시 확인하며 updated_at 을 밀므로 「원인 사이클 시작」(first_failed_at)으로 본다
      const movedAt = step?.status === "returned" ? (step.verify_result?.first_failed_at ?? "") : (step?.updated_at ?? "");
      const moved = !step || !CLIENT_OPEN.has(step.status) || movedAt > row.created_at;
      // 카드를 만든 뒤 정지 조건이 생겼을 수도 있다(질문·막힘·보류·내 차례) — 만들 때와 같은 함수로 다시 본다.
      // 접속(last_seen_at)은 작성 조건이 아니라 거둠 전용이다: 들어와서 봤으면 재촉 문구를 보낼 이유가 없다
      const projectRow = projectById.get(row.project_id);
      const stopped = projectRow
        ? reminderStopReason(projectRow, projectSteps, clientCommentsByProject.get(row.project_id) ?? [], now)
        : "gone";
      const seen = lastSeenByProject.get(row.project_id);
      needed = !moved && !stopped && !(seen && seen > row.created_at);
    }
    if (!needed) clearedIds.push(row.id);
  }
  if (clearedIds.length > 0) {
    await admin
      .from("notices")
      .update({ status: "skipped", skip_reason: "condition_cleared" })
      .in("id", clearedIds)
      .eq("status", "pending");
    report.cleared = clearedIds.length;
  }

  // GitHub check_invite 2시간 지속 → 한 사건으로 「한 가지만 더」(returned) + 재요청 문구.
  // 카톡이 나가는 순간 포털 「다음 할 일」 최상단에 같은 내용이 뜬다(둘이 어긋나면 의뢰인은 카톡을 믿고 포털을 의심한다).
  // 백오프로 낡은 결과를 믿지 않도록 직전에 한 번 강제로 다시 확인하고, 그래도 check_invite 일 때만 움직인다
  const { data: stuck } = await admin
    .from("steps")
    .select("id, key, title, project_id, status, verify_result, projects!inner(id, code, name, client_name, status, github_org)")
    .eq("status", "client_done")
    .eq("verify_type", "github")
    .neq("projects.status", "closed")
    .limit(30);
  for (const row of stuck ?? []) {
    const stale = row.verify_result as VerifyResult | null;
    const project = row.projects as unknown as { id: string; code: string; name: string; client_name: string; github_org: string | null } | null;
    const meta = CONNECT_META[row.key];
    if (!stale || !project || !meta || stale.code !== "check_invite" || !project.github_org) continue;
    const since = new Date(stale.first_failed_at ?? stale.checked_at).getTime();
    if (now.getTime() - since < RERQUEST_AFTER_MS) continue;
    const result = (await runVerification(row.id, "auto")) ?? stale;
    if (result.code !== "check_invite") continue; // 그 사이 초대가 보이기 시작했거나(pending_accept) 확인됐다
    if (!(await returnStep(row.id))) continue; // 이미 되돌렸거나 상태가 바뀌었다 — 카드도 그쪽 몫
    const { data: adminRow } = await admin.from("admins").select("email").limit(1).maybeSingle();
    if (!adminRow) continue;
    const outcome = await createOutbox({
      kind: "rerequest",
      projectId: project.id,
      stepId: row.id,
      dedupeKey: `rerequest:${row.id}:check_invite:${minuteOf(result.first_failed_at ?? result.checked_at)}`,
      title: ko.outbox.titles.rerequestCheckInvite(meta.serviceName),
      body: ko.outbox.rerequestCheckInvite({
        client: project.client_name,
        serviceName: meta.serviceName,
        stepTitle: row.title,
        inviteUrl: meta.inviteUrl(project.github_org),
        email: adminRow.email,
        roleName: meta.roleName,
      }),
      detail: "check_invite",
      // 밤에는 문구만 만들고 알리지 않는다 — 아침의 적체 알림이 대신 부른다
      push: inWakingHours(now)
        ? ko.push.outboxNew(project.client_name, ko.outbox.titles.rerequestCheckInvite(meta.serviceName))
        : null,
    });
    void outcome;
  }

  // 적체 알림 — 4시간 넘게 남은 pending 이 있으면 하루 1회, 09~21시 KST 에만
  if (inWakingHours(now)) {
    const cutoff = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
    const { count } = await admin
      .from("notices")
      .select("id", { count: "exact", head: true })
      .eq("channel", "outbox")
      .eq("status", "pending")
      .lt("created_at", cutoff);
    if ((count ?? 0) > 0) {
      const outcome = await pushAdmin({
        dedupeKey: `outbox_stale:${dayKst(now)}`,
        kind: "escalation",
        ...ko.push.outboxStale(count ?? 0),
        url: "/a#outbox",
      });
      report.stalePush = outcome === "sent";
    }
  }
  return report;
}

// 내가 「초대 안 왔음」을 눌렀다 → 의뢰인에게 초대 확인을 부탁하는 문구. Vercel·Supabase·수동 단계 공통
export async function onAdminNotCame(step: StepInfo, slug: string | null, adminEmail: string, now: Date): Promise<void> {
  const meta = CONNECT_META[step.key];
  const simple = SIMPLE_CONNECT_META[step.key];
  const serviceName = meta?.serviceName ?? simple?.serviceName ?? step.title;
  const roleName = meta?.roleName ?? simple?.roleName ?? "";
  const inviteUrl = meta ? (slug ? meta.inviteUrl(slug) : meta.createUrl) : (simple?.inviteUrl ?? "");
  await createOutbox({
    kind: "rerequest",
    projectId: step.projectId,
    stepId: step.id,
    dedupeKey: `rerequest:${step.id}:not_came:${minuteOf(now)}`,
    title: ko.outbox.titles.rerequestCheckInvite(serviceName),
    body: ko.outbox.rerequestCheckInvite({
      client: step.clientName,
      serviceName,
      stepTitle: step.title,
      inviteUrl,
      email: adminEmail,
      roleName,
    }),
    detail: "check_invite",
    push: null,
  });
}
