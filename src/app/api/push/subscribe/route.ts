import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/auth";

const subscribeSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

// 이 기기를 알림 대상으로 등록/해제한다. 관리자 세션만. RLS도 관리자만 통과시킨다.
export async function POST(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("[push] 구독 저장 실패", { message: error.message });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}

const unsubscribeSchema = z.object({ endpoint: z.url().max(2000) });

export async function DELETE(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = unsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  return new NextResponse(null, { status: 204 });
}
