import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runVerification } from "@/lib/verify/run";
import type { VerifyResult } from "@/lib/database.types";

const COOLDOWN_MS = 60_000;

const bodySchema = z.object({ stepId: z.uuid() });
const typeSchema = z.enum(["github", "vercel", "supabase"]);

// 「지금 확인」(비상용) 과 의뢰인 화면의 「연결 확인하기」.
// 자격은 사용자 세션의 RLS(단계 조회 가능 여부)로 확인하고, 판정·저장은 runVerification 이 한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type: rawType } = await params;
  const typeParsed = typeSchema.safeParse(rawType);
  if (!typeParsed.success) {
    return NextResponse.json({ error: "unknown verify type" }, { status: 400 });
  }

  const bodyParsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: step } = await supabase
    .from("steps")
    .select("id, verify_type, verify_result, projects!inner(status)")
    .eq("id", bodyParsed.data.stepId)
    .maybeSingle();
  if (!step) {
    return NextResponse.json({ error: "step not found" }, { status: 404 });
  }
  if (step.verify_type !== typeParsed.data) {
    return NextResponse.json({ error: "verify type mismatch" }, { status: 400 });
  }
  const project = step.projects as unknown as { status: string } | null;
  if (project?.status === "closed") {
    return NextResponse.json({ error: "project closed" }, { status: 403 });
  }

  // 관리자 클릭인지 의뢰인 클릭인지는 알림 정책에만 쓴다
  const { data: adminRow } = await supabase.from("admins").select("id").limit(1).maybeSingle();

  // 의뢰인 연타 방어: 60초 안의 재클릭은 외부 API 를 다시 부르지 않고 마지막 결과를 돌려준다
  const last = step.verify_result as VerifyResult | null;
  if (!adminRow && last && Date.now() - new Date(last.checked_at).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ result: last, cooldown: true });
  }

  const result = await runVerification(step.id, adminRow ? "admin" : "client");
  if (!result) {
    return NextResponse.json({ error: "failed to verify" }, { status: 500 });
  }
  return NextResponse.json({ result });
}
