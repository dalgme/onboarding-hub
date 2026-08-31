"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/common/markdown";
import { cn } from "@/lib/utils";
import { ko } from "@/content/ko";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// 계정 연결 단계 전용 도우미. 대화는 이 컴포넌트의 메모리에만 있고
// 저장하지 않는다 (localStorage 금지 · 서버 기록 없음).
export function AssistChat({
  projectCode,
  stepKey,
}: {
  projectCode: string;
  stepKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const response = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: projectCode,
          stepKey,
          messages: next.slice(-12),
        }),
      });
      const data = (await response.json()) as { reply?: string };
      setMessages([
        ...next,
        { role: "assistant", content: data.reply ?? ko.assist.failed },
      ]);
    } catch {
      setMessages([...next, { role: "assistant", content: ko.assist.failed }]);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="sticky bottom-24 z-30 flex justify-end">
        <Button
          type="button"
          variant="secondary"
          className="shadow-lg"
          onClick={() => setOpen(true)}
        >
          <MessageCircleQuestion className="size-4" />
          {ko.assist.open}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[80dvh] w-full max-w-xl flex-col rounded-t-2xl border border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircleQuestion className="size-4 text-primary" />
          {ko.assist.title}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={ko.assist.close}
        >
          <X className="size-5" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        <div className="rounded-lg bg-accent px-3 py-2.5 text-sm leading-relaxed">
          {ko.assist.greeting}
        </div>

        {messages.length === 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            {ko.assist.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="min-h-11 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <ul className="mt-3 flex flex-col gap-3">
          {messages.map((message, index) => (
            <li
              key={index}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                message.role === "user"
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start border border-border bg-card",
              )}
            >
              {message.role === "assistant" ? (
                <Markdown>{message.content}</Markdown>
              ) : (
                <span className="whitespace-pre-wrap">{message.content}</span>
              )}
            </li>
          ))}
          {pending ? (
            <li className="self-start rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {ko.assist.thinking}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <Textarea
            className="min-h-11 flex-1"
            rows={1}
            value={input}
            placeholder={ko.assist.placeholder}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask(input);
              }
            }}
          />
          <Button
            type="button"
            disabled={pending || input.trim().length === 0}
            onClick={() => ask(input)}
            aria-label={ko.assist.send}
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {ko.assist.privacy}
        </p>
      </div>
    </div>
  );
}
