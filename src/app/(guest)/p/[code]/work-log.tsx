import { format } from "date-fns";
import {
  CheckCircle2,
  FileCheck,
  Flag,
  MessageCircleQuestion,
  MessageSquarePlus,
  ThumbsUp,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ko } from "@/content/ko";
import type { CommentRow, ProjectRow, StepRow } from "@/lib/database.types";

interface LogEvent {
  at: string;
  icon: "start" | "scope" | "clientDone" | "verified" | "question" | "request";
  text: string;
  detail?: string;
}

const ICONS = {
  start: Flag,
  scope: FileCheck,
  clientDone: ThumbsUp,
  verified: CheckCircle2,
  question: MessageCircleQuestion,
  request: MessageSquarePlus,
} as const;

// 작업기록 탭: 프로젝트에서 일어난 일들의 시간순 목록 (최근이 위).
export function WorkLog({
  project,
  steps,
  comments,
}: {
  project: Pick<ProjectRow, "created_at" | "scope_agreed_at">;
  steps: StepRow[];
  comments: CommentRow[];
}) {
  const events: LogEvent[] = [
    {
      at: project.created_at,
      icon: "start",
      text: ko.portal.logProjectStart,
    },
  ];

  if (project.scope_agreed_at) {
    events.push({
      at: project.scope_agreed_at,
      icon: "scope",
      text: ko.portal.logScopeAgreed,
    });
  }

  for (const step of steps) {
    if (step.checked_at) {
      events.push({
        at: step.checked_at,
        icon: "clientDone",
        text: ko.portal.logStepClientDone(step.title),
      });
    }
    if (step.verified_at) {
      events.push({
        at: step.verified_at,
        icon: "verified",
        text: ko.portal.logStepVerified(step.title),
      });
    }
  }

  for (const comment of comments) {
    if (comment.deleted_at) continue;
    const side =
      ko.status.ownerSide[comment.author_side === "admin" ? "agency" : "client"];
    events.push({
      at: comment.created_at,
      icon: comment.kind === "question" ? "question" : "request",
      text:
        comment.kind === "question"
          ? ko.portal.logCommentQuestion(side)
          : ko.portal.logCommentRequest(side),
      detail:
        comment.body.length > 80
          ? `${comment.body.slice(0, 80)}…`
          : comment.body,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {ko.portal.logGuide}
      </p>
      {events.length === 0 ? (
        <EmptyState message={ko.portal.logEmpty} />
      ) : (
        <ol className="flex flex-col">
          {events.map((event, index) => {
            const Icon = ICONS[event.icon];
            return (
              <li
                key={`${event.at}-${index}`}
                className="relative flex gap-3 pb-5 last:pb-0"
              >
                {index < events.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute left-[13px] top-7 h-full w-px bg-border"
                  />
                ) : null}
                <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  <Icon className="size-3.5 text-primary" />
                </span>
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <span className="text-sm leading-snug">{event.text}</span>
                  {event.detail ? (
                    <span className="text-xs text-muted-foreground">
                      “{event.detail}”
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(event.at), "yyyy.MM.dd HH:mm")}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
