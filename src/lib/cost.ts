// 고정비 계산기 상수. DB 테이블로 만들지 않는다 — 요율이 바뀌면 여기를 고친다.
export interface RateItem {
  key: string;
  service: string;
  plan: string;
  monthlyUsd: number;
  yearlyKrw: number;
  note: string;
  defaultOn: boolean;
}

export const RATES: RateItem[] = [
  {
    key: "vercel-hobby",
    service: "Vercel",
    plan: "Hobby (무료)",
    monthlyUsd: 0,
    yearlyKrw: 0,
    note: "개인·비상업용. 상업 서비스는 Pro 필요",
    defaultOn: false,
  },
  {
    key: "vercel-pro",
    service: "Vercel",
    plan: "Pro",
    monthlyUsd: 20,
    yearlyKrw: 0,
    note: "팀 멤버 1명 기준. 멤버 추가 시 인원당 과금",
    defaultOn: true,
  },
  {
    key: "supabase-free",
    service: "Supabase",
    plan: "Free (무료)",
    monthlyUsd: 0,
    yearlyKrw: 0,
    note: "1주 미접속 시 일시정지됨. 운영 서비스에는 비추천",
    defaultOn: false,
  },
  {
    key: "supabase-pro",
    service: "Supabase",
    plan: "Pro",
    monthlyUsd: 25,
    yearlyKrw: 0,
    note: "조직 단위 과금. DB 8GB·백업 7일 포함",
    defaultOn: true,
  },
  {
    key: "domain",
    service: "도메인",
    plan: ".com 기준 연 1회",
    monthlyUsd: 0,
    yearlyKrw: 20000,
    note: "등록기관에 따라 연 15,000~25,000원 수준",
    defaultOn: true,
  },
  {
    key: "resend",
    service: "Resend (메일 발송)",
    plan: "Free",
    monthlyUsd: 0,
    yearlyKrw: 0,
    note: "월 3,000건까지 무료. 초과 시 Pro $20/월",
    defaultOn: false,
  },
];

export const USD_KRW_RATE = 1400;

export function calcMonthlyTotal(selectedKeys: string[]): {
  monthlyUsd: number;
  monthlyKrwApprox: number;
} {
  const selected = RATES.filter((rate) => selectedKeys.includes(rate.key));
  const monthlyUsd = selected.reduce((sum, rate) => sum + rate.monthlyUsd, 0);
  const yearlyKrw = selected.reduce((sum, rate) => sum + rate.yearlyKrw, 0);
  const monthlyKrwApprox = Math.round(
    monthlyUsd * USD_KRW_RATE + yearlyKrw / 12,
  );
  return { monthlyUsd, monthlyKrwApprox };
}
