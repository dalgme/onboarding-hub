// 허브 자신의 공개 주소 — 카톡 문구·푸시 링크·접속 안내·포털 주소에 들어간다.
// 우선순위: SITE_URL(서버 전용) → NEXT_PUBLIC_SITE_URL(예전 이름) → Vercel 이 배포마다 넣어 주는
// 운영 도메인(VERCEL_PROJECT_PRODUCTION_URL, 「가장 짧은 운영 도메인 또는 vercel.app 주소」).
// 손으로 적은 값이 실제 도메인과 다르면 사전 점검이 노랑으로 잡는다.
// (실제 사고 10-01: 환경변수에 존재하지 않는 호스트가 들어가 모든 카톡 문구가 404 를 가리켰다 —
//  의뢰인이 「페이지가 없다」고 연락할 때까지 아무도 몰랐다)

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

// 사람이 적어 둔 주소. 없으면 null
export function configuredSiteUrl(): string | null {
  const value = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  return value ? trimSlash(value.trim()) : null;
}

// Vercel 이 알려주는 운영 도메인. 로컬·다른 호스팅에서는 null
export function deployedSiteUrl(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : null;
}

export function siteUrl(): string {
  return configuredSiteUrl() ?? deployedSiteUrl() ?? "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// 적어 둔 주소와 실제 배포 도메인이 다르면 둘을 돌려준다. 같거나 비교할 수 없으면 null
export function siteUrlMismatch(): { configured: string; deployed: string } | null {
  const configured = configuredSiteUrl();
  const deployed = deployedSiteUrl();
  if (!configured || !deployed) return null;
  return hostOf(configured) === hostOf(deployed) ? null : { configured, deployed };
}
