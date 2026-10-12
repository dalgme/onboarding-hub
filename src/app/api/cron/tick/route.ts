import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runTick } from "@/lib/tick";

// 유일한 크론 라우트. 판단은 전부 runTick(now) 안에 있고, 여기는 인증만 한다.
// 로컬 재현: curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/tick
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 미설정이면 닫힌다 (fail-closed)
  const header = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual 은 바이트 길이가 다르면 throw 한다 — 바이트 길이를 먼저 비교한다
  if (header.length !== expected.length) return false;
  return timingSafeEqual(header, expected);
}

// 운영 DB 주소는 절대 루프백이 아니다 — 루프백이면 qa/ 하네스의 모의 서버다
function allowNowOverride(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // 시각 주입은 로컬 검수 전용 — 리마인드 창·09:00 요약처럼 시각에 매인 판정을 재현한다.
  // 운영에서는 무시한다: 개발 모드이거나, DB 주소가 루프백(모의 Supabase = `next start` 검수)일 때만 받는다
  const override = request.nextUrl.searchParams.get("now");
  const now =
    allowNowOverride() && override && !Number.isNaN(Date.parse(override))
      ? new Date(override)
      : new Date();
  const report = await runTick(now);
  return NextResponse.json(report);
}
