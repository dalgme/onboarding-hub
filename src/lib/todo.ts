import { differenceInCalendarDays } from "date-fns";
import { CONNECT_META } from "@/lib/steps";
import { ko } from "@/content/ko";
import type {
  CommentRow,
  ProjectGuestRow,
  ProjectRow,
  StepRow,
} from "@/lib/database.types";

// 「지금 할 일」 — 의뢰인이 한 일 중 내가 대처해야 할 것을 한 줄로 뽑는다.
// 데이터를 새로 만들지 않는다. 이미 있는 상태에서 계산만 한다.
// (실제 사고: 의뢰인이 5단계를 끝내고 질문 3개를 남긴 지 3시간 동안
//  나는 몰랐다 — 열어도 탭을 뒤져야 보였다)

export type TodoTab = "steps" | "scope" | "settings";

export interface TodoItem {
  key: string;
  label: string;
  tab: TodoTab;
  urgent: boolean;
}

export type StepLite = Pick<
  StepRow,
  "key" | "status" | "owner_side" | "verify_result" | "blocked_reason" | "title" | "order_index"
>;
export type CommentLite = Pick<CommentRow, "author_side" | "read_at" | "deleted_at">;
export type GuestLite = Pick<ProjectGuestRow, "last_seen_at">;
export type ProjectLite = Pick<
  ProjectRow,
  "status" | "scope_md" | "scope_agreed_at" | "created_at" | "access_sent_at"
>;

const NOT_SEEN_AFTER_DAYS = 3;

export function buildTodos(
  project: ProjectLite,
  steps: StepLite[],
  comments: CommentLite[],
  guests: GuestLite[],
  now: Date = new Date(),
): TodoItem[] {
  if (project.status === "closed") return [];
  const copy = ko.admin.todo;
  const items: TodoItem[] = [];

  const needHelp = steps.filter(
    (step) => step.status === "blocked" && step.blocked_reason === "need_help",
  ).length;
  const blocked = steps.filter(
    (step) => step.status === "blocked" && step.blocked_reason !== "need_help",
  ).length;
  const clientDone = steps.filter((step) => step.status === "client_done").length;
  const verifyError = steps.filter(
    (step) =>
      step.verify_result?.status === "error" &&
      step.status !== "verified" &&
      step.status !== "skipped",
  ).length;
  const unread = comments.filter(
    (comment) =>
      comment.author_side === "client" && !comment.read_at && !comment.deleted_at,
  ).length;

  if (needHelp > 0) {
    items.push({ key: "needHelp", label: copy.needHelp(needHelp), tab: "steps", urgent: true });
  }
  if (blocked > 0) {
    items.push({ key: "blocked", label: copy.blocked(blocked), tab: "steps", urgent: true });
  }
  if (verifyError > 0) {
    items.push({ key: "verifyError", label: copy.verifyError(verifyError), tab: "steps", urgent: true });
  }
  if (unread > 0) {
    items.push({ key: "unread", label: copy.unread(unread), tab: "steps", urgent: true });
  }
  // 자동 확인이 "초대 수락 전"으로 끝난 단계 — 다음 행동은 의뢰인이 아니라 나다
  for (const step of steps) {
    if (step.status !== "client_done") continue;
    const code = step.verify_result?.code;
    if (code !== "pending_accept" && code !== "check_invite") continue;
    const service = CONNECT_META[step.key]?.serviceName ?? step.title;
    items.push({
      key: `invite-${step.key}`,
      label: code === "pending_accept" ? copy.pendingAccept(service) : copy.checkInvite(service),
      tab: "steps",
      urgent: true,
    });
  }
  if (clientDone > 0) {
    items.push({ key: "verify", label: copy.verify(clientDone), tab: "steps", urgent: false });
  }
  if (!project.scope_md?.trim()) {
    items.push({ key: "scopeMissing", label: copy.scopeMissing, tab: "scope", urgent: false });
  } else if (!project.scope_agreed_at) {
    items.push({ key: "scopeUnconfirmed", label: copy.scopeUnconfirmed, tab: "scope", urgent: false });
  }
  if (guests.length === 0) {
    items.push({ key: "noGuest", label: copy.noGuest, tab: "settings", urgent: true });
  } else if (!project.access_sent_at && guests.every((guest) => !guest.last_seen_at)) {
    // 접속 안내를 보낸 기록이 없고 아무도 들어온 적 없다 — 의뢰인은 아직 이 포털을 모른다
    items.push({ key: "accessNotSent", label: copy.accessNotSent, tab: "settings", urgent: true });
  } else if (guests.every((guest) => !guest.last_seen_at)) {
    // 미접속 일수는 「보낸 날」부터 센다 (만든 날부터 세면 보내기 전부터 재촉한다)
    const days = differenceInCalendarDays(now, new Date(project.access_sent_at ?? project.created_at));
    if (days >= NOT_SEEN_AFTER_DAYS) {
      items.push({ key: "notSeen", label: copy.notSeen(days), tab: "settings", urgent: false });
    }
  }
  return items;
}

// 아직 끝나지 않은 상태(내 확인 대기 포함) — 제작자 단계 판정용
const OPEN: ReadonlySet<StepRow["status"]> = new Set(["todo", "doing", "blocked", "client_done"]);
// 의뢰인 손에 있는 상태 — client_done은 의뢰인이 끝내고 「내」 확인을 기다리는 것이다 (§5)
const CLIENT_OPEN: ReadonlySet<StepRow["status"]> = new Set(["todo", "doing", "blocked"]);

// 의뢰인이 다음에 할 단계 — 순서상 첫 번째로 아직 의뢰인 손에 있는 단계
export function nextClientStep(steps: StepLite[]): StepLite | null {
  return (
    [...steps]
      .sort((a, b) => a.order_index - b.order_index)
      .find((step) => step.owner_side === "client" && CLIENT_OPEN.has(step.status)) ?? null
  );
}

// 의뢰인이 완료 요청을 보내고 내 확인을 기다리는 단계가 있는가
export function hasClientDone(steps: StepLite[]): boolean {
  return steps.some((step) => step.owner_side === "client" && step.status === "client_done");
}

// 내가 다음에 할 단계 — 의뢰인 단계가 모두 끝났을 때 순서상 첫 제작자 단계
export function nextAgencyStep(steps: StepLite[]): StepLite | null {
  return (
    [...steps]
      .sort((a, b) => a.order_index - b.order_index)
      .find((step) => step.owner_side === "agency" && OPEN.has(step.status)) ?? null
  );
}
