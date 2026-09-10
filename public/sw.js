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

// 서버가 보낸 알림을 표시한다. 본문은 {title, body, url, tag}
self.addEventListener("push", (event) => {
  let payload = { title: "온보딩 허브", body: "", url: "/a", tag: undefined };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // 본문이 비어 있어도 알림은 띄운다
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url },
    }),
  );
});

// 알림을 누르면 해당 화면을 연다 (이미 열린 창이 있으면 그 창으로)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/a";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && new URL(client.url).origin === self.location.origin) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
