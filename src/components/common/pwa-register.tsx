"use client";

import { useEffect } from "react";

// 서비스워커 등록 (홈 화면 설치 지원). 렌더링에는 관여하지 않는다.
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // 공개키를 쿼리로 넘긴다 — 브라우저가 구독을 교체(pushsubscriptionchange)할 때
      // 서비스워커가 같은 키로 다시 구독해 서버에 등록한다
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const url = key ? `/sw.js?vapid=${encodeURIComponent(key)}` : "/sw.js";
      navigator.serviceWorker.register(url).catch(() => {
        // 등록 실패는 치명적이지 않다 — 브라우저로 그대로 쓰면 된다
      });
    }
  }, []);
  return null;
}
