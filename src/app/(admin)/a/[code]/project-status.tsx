import { format } from "date-fns";
import { TodoList } from "@/app/(admin)/a/todo-list";
import { AckPanel, type AckItem } from "@/app/(admin)/a/[code]/ack-panel";
import { CONNECT_META, SIMPLE_CONNECT_META } from "@/lib/steps";
import { differenceInHours } from "date-fns";
import { buildTodos, hasClientDone, nextAgencyStep, nextClientStep } from "@/lib/todo";
import { ko } from "@/content/ko";
import type {
  CommentRow,
  ProjectGuestRow,
  ProjectRow,
  StepRow,
} from "@/lib/database.types";

interface Activity {
  at: string;
  text: string;
}

// 프로젝트 상세 최상단 「현재 상황」 — 의뢰인이 어디 있고, 내가 무엇을 해야 하는지.
export function ProjectStatus({
  project,
  steps,
  comments,
  guests,
}: {
  project: ProjectRow;
  steps: StepRow[];
  comments: CommentRow[];
  guests: ProjectGuestRow[];
}) {
  const copy = ko.admin.statusCard;
  const todos = buildTodos(project, steps, comments, guests);

  // 내 메일함을 봐야 다음이 정해지는 단계 — 「왔음/안 왔음」
  const ackItems: AckItem[] = steps
    .filter(
      (step) =>
        step.status === "client_done" &&
        (step.verify_result?.code === "await_admin_first" ||
          step.verify_result?.code === "await_admin_ack" ||
          (step.verify_result?.admin_first_ack === "not_came" && step.verify_result?.code === "check_invite")),
    )
    .map((step) => ({
      stepId: step.id,
      service: CONNECT_META[step.key]?.serviceName ?? SIMPLE_CONNECT_META[step.key]?.serviceName ?? step.title,
      title: step.title,
      hoursWaiting: differenceInHours(new Date(), new Date(step.verify_result?.first_failed_at ?? step.checked_at ?? step.updated_at)),
      notCame: step.verify_result?.admin_first_ack === "not_came",
      came: step.verify_result?.admin_first_ack === "came",
    }));

  const lastSeen = guests
    .map((guest) => guest.last_seen_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const activities: Activity[] = [];
  for (const step of steps) {
    if (step.checked_at) {
      activities.push({ at: step.checked_at, text: copy.activityClientDone(step.title) });
    }
    if (step.verified_at) {
      activities.push({ at: step.verified_at, text: copy.activityVerified(step.title) });
    }
    // 막힘은 정확한 시각이 없다(updated_at은 검증 호출에도 밀린다) — 「지금 할 일」과
    // 「의뢰인 다음 할 일」에 이미 드러나므로 여기서는 시각을 지어내지 않는다
  }
  for (const comment of comments) {
    if (comment.author_side !== "client" || comment.deleted_at) continue;
    activities.push({
      at: comment.created_at,
      text: comment.kind === "question" ? copy.activityQuestion : copy.activityRequest,
    });
  }
  const latest = activities.sort((a, b) => b.at.localeCompare(a.at))[0];

  const clientNext = nextClientStep(steps);
  const agencyNext = nextAgencyStep(steps);
  const myNext =
    todos.length > 0
      ? todos[0].label
      : clientNext
        ? copy.waitingClient(clientNext.title)
        : agencyNext
          ? agencyNext.title
          : copy.allDone;

  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.lastSeen}</span>
        <span>{lastSeen ? format(new Date(lastSeen), "MM.dd HH:mm") : copy.neverSeen}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.lastActivity}</span>
        <span>
          {latest
            ? `${latest.text} · ${format(new Date(latest.at), "MM.dd HH:mm")}`
            : copy.noActivity}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.clientNext}</span>
        <span>
          {clientNext
            ? clientNext.title
            : hasClientDone(steps)
              ? copy.clientWaitingMe
              : copy.clientDone}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{copy.myNext}</span>
        <span>{myNext}</span>
      </div>
      <AckPanel items={ackItems} code={project.code} />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="text-xs font-medium text-muted-foreground">{ko.admin.todo.title}</span>
        <TodoList code={project.code} items={todos} />
      </div>
    </section>
  );
}
