import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const ackSchema = z.object({
  key: z.string().min(1).max(300),
  endpoint: z.url().max(2000),
});

// 서비스워커가 알림을 표시하거나 사용자가 눌렀을 때 부른다 — 「배달됨」의 유일한 근거.
// 인증은 구독 endpoint 로 한다: 푸시 서비스가 발급한 추측 불가 URL 이고, 등록된
// 구독만 통과한다. 세션 쿠키에 기대지 않으므로 로그아웃 상태의 폰에서도 ack 가 남는다.
export async function POST(request: NextRequest) {
  const parsed = ackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: sub } = await admin
    .from("push_subscriptions")
    .update({ last_ack_at: now })
    .eq("endpoint", parsed.data.endpoint)
    .select("id");
  if (!sub || sub.length === 0) {
    return NextResponse.json({ error: "unknown subscription" }, { status: 403 });
  }
  await admin
    .from("notices")
    .update({ acked_at: now })
    .eq("dedupe_key", parsed.data.key)
    .is("acked_at", null);
  return new NextResponse(null, { status: 204 });
}
