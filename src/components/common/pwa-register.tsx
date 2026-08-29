"use client";

import { useEffect } from "react";

// 서비스워커 등록 (홈 화면 설치 지원). 렌더링에는 관여하지 않는다.
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 등록 실패는 치명적이지 않다 — 브라우저로 그대로 쓰면 된다
      });
    }
  }, []);
  return null;
}
