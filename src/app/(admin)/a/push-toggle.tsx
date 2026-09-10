"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ko } from "@/content/ko";

type State = "checking" | "unsupported" | "notConfigured" | "denied" | "off" | "on" | "busy";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// 이 기기의 구독이 현재 공개키로 만들어졌는가. 키를 바꾸면 옛 구독은 배달되지 않는다
function sameKey(subscription: PushSubscription): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = toKey(PUBLIC_KEY);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

async function forget(subscription: PushSubscription) {
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}

// 관리 화면 헤더의 「휴대폰 알림」 토글. 이 기기의 구독 상태만 다룬다.
// (브라우저 API 조회이지 데이터 fetch가 아니다 — §11-9 대상이 아니다)
export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const copy = ko.admin.push;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (!PUBLIC_KEY) {
      setState("notConfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription && sameKey(subscription) ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function turnOn() {
    setState("busy");
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      // 키가 바뀐 뒤 남은 옛 구독이 있으면 먼저 지운다 — 그대로 subscribe 하면 InvalidStateError
      const stale = await registration.pushManager.getSubscription();
      if (stale && !sameKey(stale)) await forget(stale);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKey(PUBLIC_KEY),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error(String(response.status));
      setState("on");
    } catch {
      setMessage(copy.failed);
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await forget(subscription);
      setState("off");
    } catch {
      setMessage(copy.failed);
      setState("on");
    }
  }

  if (state === "checking") return null;

  if (state === "unsupported" || state === "notConfigured" || state === "denied") {
    return (
      <span
        className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground"
        title={copy[state]}
      >
        <BellOff className="size-4" />
        {copy[state]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {message ? <span className="text-xs text-destructive">{message}</span> : null}
      {state === "on" ? (
        <Button type="button" variant="ghost" size="sm" onClick={turnOff} title={copy.help}>
          <BellRing className="size-4 text-success" />
          {copy.on}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state === "busy"}
          onClick={turnOn}
          title={copy.help}
        >
          <Bell className="size-4" />
          {copy.off}
        </Button>
      )}
    </span>
  );
}
