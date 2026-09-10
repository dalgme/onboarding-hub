// 서비스워커 — 설치 가능성(PWA) + 관리자 휴대폰 알림(웹 푸시).
// 인증 기반 앱이라 페이지를 캐시하지 않고 전부 네트워크로 통과시킨다.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 네트워크 통과 (기본 동작)
});

// 「배달됨」을 서버에 남긴다 — 표시된 순간과 누른 순간 모두. 실패해도 조용히 넘어간다.
// 인증은 이 기기의 구독 endpoint 로 한다(세션 쿠키 불필요).
async function ack(key) {
  if (!key) return;
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/push/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, endpoint: subscription.endpoint }),
      keepalive: true,
    });
  } catch {
    // ack 는 진단용이다. 알림 표시를 막지 않는다
  }
}

// 서버가 보낸 알림을 표시한다. 본문은 {title, body, url, tag, key}
self.addEventListener("push", (event) => {
  let payload = { title: "온보딩 허브", body: "", url: "/a", tag: undefined, key: undefined };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // 본문이 비어 있어도 알림은 띄운다
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.tag,
        renotify: Boolean(payload.tag),
        data: { url: payload.url, key: payload.key },
      }),
      ack(payload.key),
    ]),
  );
});

// 알림을 누르면 해당 화면을 연다 (이미 열린 창이 있으면 그 창으로)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/a";
  const key = event.notification.data && event.notification.data.key;
  event.waitUntil(ack(key));
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => "focus" in c && "navigate" in c);
      if (!client) return self.clients.openWindow(url);
      // 이 서비스워커가 제어하지 않는 창(하드 리로드 직후 등)에서는 navigate()가
      // 거부된다. 그러면 새 창으로 연다
      return client
        .focus()
        .then((focused) => (focused || client).navigate(url))
        .catch(() => self.clients.openWindow(url));
    }),
  );
});

// 브라우저/푸시 서비스가 구독을 교체하면 새 구독을 서버에 다시 등록한다.
// 같은 출처 fetch라 관리자 세션 쿠키가 실린다. 로그아웃 상태면 401 —
// 다음 「휴대폰 알림 켜기」가 복구한다. 어떤 경우에도 throw 하지 않는다.
function vapidKeyFromUrl() {
  const key = new URL(self.location.href).searchParams.get("vapid");
  if (!key) return undefined;
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("pushsubscriptionchange", (event) => {
  const resubscribe = async () => {
    try {
      let subscription = event.newSubscription || null;
      if (!subscription) {
        const applicationServerKey =
          (event.oldSubscription && event.oldSubscription.options.applicationServerKey) ||
          vapidKeyFromUrl();
        if (!applicationServerKey) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    } catch {
      // 재등록 실패는 다음 「휴대폰 알림 켜기」가 복구한다
    }
  };
  event.waitUntil(resubscribe());
});
