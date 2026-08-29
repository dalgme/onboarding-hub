// 최소 서비스워커 — 설치 가능성(PWA) 확보용.
// 인증 기반 앱이라 페이지를 캐시하지 않고 전부 네트워크로 통과시킨다.
// (오프라인 캐시가 필요해지면 그때 확장한다)
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // 네트워크 통과 (기본 동작)
});
