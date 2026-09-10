"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { MessageSquareShare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { handleOutbox } from "@/app/(admin)/a/actions";
import { ko } from "@/content/ko";
import type { OutboxItem } from "@/lib/outbox";

// 폰이면 공유 창(카톡 선택), PC 면 클립보드. 성공했을 때만 true
export async function shareOrCopy(text: string): Promise<"shared" | "copied" | false> {
  if (typeof navigator !== "undefined" && "share" in navigator && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (cause) {
      // 사용자가 공유 창을 닫은 것은 실패다 — 기록하지 않는다
      if (cause instanceof Error && cause.name === "AbortError") return false;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return false;
  }
}

function Card({
  item,
  showProject,
  onDone,
}: {
  item: OutboxItem;
  showProject: boolean;
  onDone: (id: string, action: "sent" | "skipped") => void;
}) {
  const copy = ko.admin.outbox;
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  async function send() {
    if (!item.body) return;
    const outcome = await shareOrCopy(item.body);
    if (!outcome) {
      setNote(copy.copyFailed);
      return;
    }
    setNote(outcome === "shared" ? copy.shared : copy.copied);
    startTransition(async () => {
      const result = await handleOutbox({ id: item.id, action: "sent" });
      if (result.ok) onDone(item.id, "sent");
      else setNote(result.message ?? ko.common.error);
    });
  }

  function skip() {
    startTransition(async () => {
      const result = await handleOutbox({ id: item.id, action: "skipped" });
      if (result.ok) onDone(item.id, "skipped");
      else setNote(result.message ?? ko.common.error);
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {showProject && item.projects ? (
          <Link href={`/a/${item.projects.code}`} className="font-medium text-primary hover:underline">
            {item.projects.name}
          </Link>
        ) : null}
        <span className="font-medium text-foreground">{item.projects?.client_name ?? ""}</span>
        <span>·</span>
        <span>{item.title ?? copy.kinds[item.kind] ?? item.kind}</span>
        <span>·</span>
        <span>{copy.createdAt(format(new Date(item.created_at), "MM.dd HH:mm"))}</span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{item.body}</pre>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={send} disabled={pending}>
          <MessageSquareShare className="size-4" />
          {pending ? copy.busy : copy.send}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={skip} disabled={pending}>
          {copy.skip}
        </Button>
        {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
      </div>
    </li>
  );
}

export function OutboxList({
  pending,
  recent,
  showProject,
}: {
  pending: OutboxItem[];
  recent: OutboxItem[];
  showProject: boolean;
}) {
  const copy = ko.admin.outbox;
  const [items, setItems] = useState(pending);
  const [handled, setHandled] = useState(recent);
  const [restoring, startRestore] = useTransition();

  function onDone(id: string, action: "sent" | "skipped") {
    const item = items.find((row) => row.id === id);
    setItems((current) => current.filter((row) => row.id !== id));
    if (item) {
      setHandled((current) => [
        { ...item, status: action, skip_reason: action === "skipped" ? "admin" : null, updated_at: new Date().toISOString() },
        ...current,
      ]);
    }
  }

  function restore(item: OutboxItem) {
    startRestore(async () => {
      const result = await handleOutbox({ id: item.id, action: "restore" });
      if (!result.ok) return;
      setHandled((current) => current.filter((row) => row.id !== item.id));
      setItems((current) => [{ ...item, status: "pending", skip_reason: null, sent_at: null }, ...current]);
    });
  }

  function statusLabel(item: OutboxItem): string {
    if (item.status === "sent") return copy.status.sent;
    if (item.status === "superseded") return copy.status.superseded;
    return item.skip_reason === "condition_cleared" ? copy.status.cleared : copy.status.skipped;
  }

  return (
    <section
      id="outbox"
      className={
        items.length > 0
          ? "rounded-lg border border-primary/40 bg-primary/5 px-4 py-3"
          : "rounded-lg border border-border bg-card px-4 py-3"
      }
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquareShare className="size-4" />
        {items.length > 0 ? copy.countTitle(items.length) : copy.title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <Card key={item.id} item={item} showProject={showProject} onDone={onDone} />
          ))}
        </ul>
      )}
      {handled.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{copy.recent}</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {handled.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {showProject && item.projects ? (
                  <span className="font-medium">{item.projects.name}</span>
                ) : null}
                <span>{item.title ?? copy.kinds[item.kind] ?? item.kind}</span>
                <span className="text-muted-foreground">
                  · {statusLabel(item)} · {format(new Date(item.updated_at), "MM.dd HH:mm")}
                </span>
                {item.kind !== "credentials" &&
                (item.status === "sent" || (item.status === "skipped" && item.skip_reason === "admin")) ? (
                  <button
                    type="button"
                    className="text-primary underline disabled:opacity-50"
                    disabled={restoring}
                    onClick={() => restore(item)}
                  >
                    {copy.restore}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
