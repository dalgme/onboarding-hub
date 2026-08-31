"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/common/markdown";
import { ASSIST_MAX_CHARS, ASSIST_SEND_WINDOW } from "@/lib/assist";
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
          // 홀수 창으로 잘라야 첫 메시지가 user로 남는다 (assist.ts 주석 참고)
          messages: next.slice(-ASSIST_SEND_WINDOW),
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
      <div className="pointer-events-none flex justify-end">
        <Button
          type="button"
          variant="secondary"
          className="pointer-events-auto shadow-lg"
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
                <Markdown variant="chat">{message.content}</Markdown>
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
            maxLength={ASSIST_MAX_CHARS}
            value={input}
            placeholder={ko.assist.placeholder}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // 한글 입력 중의 Enter는 「조합 확정」이지 전송이 아니다.
              // 막지 않으면 마지막 글자가 입력창에 남거나 미완성으로 전송된다
              if (
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              ) {
                return;
              }
              if (event.key !== "Enter" || event.shiftKey) return;
              // 휴대폰 자판에는 Shift가 없다. Enter를 전송으로 쓰면
              // 줄을 바꾸려다 질문이 반만 날아간다 — 전송 버튼만 쓴다
              if (window.matchMedia("(pointer: coarse)").matches) return;
              event.preventDefault();
              ask(input);
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
