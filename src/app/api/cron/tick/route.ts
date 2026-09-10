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
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  // timingSafeEqual 은 길이가 다르면 throw 한다 — 길이를 먼저 비교한다
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runTick(new Date());
  return NextResponse.json(report);
}
