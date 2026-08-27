"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { MailOpen, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { CommentForm } from "@/components/comment/comment-form";
import {
  deleteGuestComment,
  markAdminCommentsRead,
} from "@/app/(guest)/p/[code]/actions";
import {
  deleteAdminComment,
  markClientCommentsRead,
} from "@/app/(admin)/a/actions";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";
import type { AuthorSide, CommentRow } from "@/lib/database.types";

// 질문·요청 스레드. viewerSide 기준으로 내 글/상대 글, 안 읽음, 삭제를 처리한다.
export function CommentThread({
  side,
  comments,
  stepTitles,
  projectId,
  projectCode,
  stepId,
  showStepLabels = false,
}: {
  side: AuthorSide;
  comments: CommentRow[];
  stepTitles?: Record<string, string>;
  projectId: string;
  projectCode: string;
  stepId: string | null;
  showStepLabels?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const visible = comments.filter((comment) => !comment.deleted_at);
  const unreadFromOther = visible.filter(
    (comment) => comment.author_side !== side && !comment.read_at,
  ).length;

  function markRead() {
    startTransition(async () => {
      const action =
        side === "admin" ? markClientCommentsRead : markAdminCommentsRead;
      await action({ projectId, code: projectCode });
      router.refresh();
    });
  }

  function remove(commentId: string) {
    if (!window.confirm(ko.comments.deleteConfirm)) return;
    startTransition(async () => {
      const action = side === "admin" ? deleteAdminComment : deleteGuestComment;
      await action({ commentId, code: projectCode });
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{ko.comments.title}</h2>
        {unreadFromOther > 0 ? (
          <>
            <Badge variant="destructive">
              {ko.comments.unreadBadge(unreadFromOther)}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={markRead}
            >
              <MailOpen className="size-4" />
              {ko.comments.markRead}
            </Button>
          </>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState message={ko.comments.empty} />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((comment) => {
            const mine = comment.author_side === side;
            return (
              <li
                key={comment.id}
                className={cn(
                  "rounded-lg border border-border bg-card px-4 py-3",
                  !mine && !comment.read_at && "border-primary/50 bg-accent",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {mine
                      ? ko.comments.mine
                      : ko.status.ownerSide[
                          comment.author_side === "admin" ? "agency" : "client"
                        ]}
                  </span>
                  <Badge
                    variant={comment.kind === "request" ? "warning" : "secondary"}
                  >
                    {comment.kind === "request"
                      ? ko.comments.kindRequest
                      : ko.comments.kindQuestion}
                  </Badge>
                  {showStepLabels && comment.step_id && stepTitles?.[comment.step_id] ? (
                    <Badge variant="outline">
                      {ko.comments.stepPrefix}: {stepTitles[comment.step_id]}
                    </Badge>
                  ) : null}
                  <span>
                    {format(new Date(comment.created_at), "yyyy.MM.dd HH:mm")}
                  </span>
                  {mine ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(comment.id)}
                      className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive"
                      aria-label={ko.common.delete}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                  {comment.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <CommentForm
        side={side}
        projectId={projectId}
        projectCode={projectCode}
        stepId={stepId}
      />
    </section>
  );
}
