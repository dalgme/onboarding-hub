import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGithubMembership } from "@/lib/verify/github";
import { verifyVercelMembership } from "@/lib/verify/vercel";
import { verifySupabaseMembership } from "@/lib/verify/supabase";
import { makeResult } from "@/lib/verify/types";
import type { VerifyResult } from "@/lib/database.types";

const bodySchema = z.object({ stepId: z.uuid() });
const typeSchema = z.enum(["github", "vercel", "supabase"]);

const SLUG_COLUMN = {
  github: "github_org",
  vercel: "vercel_team",
  supabase: "supabase_org",
} as const;

// 검증 결과는 서버가 결정해 service_role로 기록한다.
// 호출 자격은 사용자 세션의 RLS(단계 조회 가능 여부)로 확인한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type: rawType } = await params;
  const typeParsed = typeSchema.safeParse(rawType);
  if (!typeParsed.success) {
    return NextResponse.json({ error: "unknown verify type" }, { status: 400 });
  }
  const type = typeParsed.data;

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
    .select("id, verify_type, project_id, projects(github_org, vercel_team, supabase_org)")
    .eq("id", bodyParsed.data.stepId)
    .maybeSingle();

  if (!step) {
    return NextResponse.json({ error: "step not found" }, { status: 404 });
  }
  if (step.verify_type !== type) {
    return NextResponse.json({ error: "verify type mismatch" }, { status: 400 });
  }

  const project = step.projects as unknown as {
    github_org: string | null;
    vercel_team: string | null;
    supabase_org: string | null;
  } | null;
  const slug = project?.[SLUG_COLUMN[type]] ?? null;

  let result: VerifyResult;
  if (!slug) {
    result = makeResult("not_found", "조직 이름이 아직 입력되지 않았습니다");
  } else if (type === "github") {
    result = await verifyGithubMembership(slug);
  } else if (type === "vercel") {
    result = await verifyVercelMembership(slug);
  } else {
    const admin = createAdminClient();
    const { data: adminRow } = await admin
      .from("admins")
      .select("email")
      .limit(1)
      .maybeSingle();
    if (!adminRow) {
      result = makeResult("error", "관리자 이메일이 등록되지 않았습니다");
    } else {
      result = await verifySupabaseMembership(slug, adminRow.email);
    }
  }

  const admin = createAdminClient();
  const update =
    result.status === "verified"
      ? {
          verify_result: result,
          status: "verified" as const,
          verified_at: result.checked_at,
        }
      : { verify_result: result };
  const { error: updateError } = await admin
    .from("steps")
    .update(update)
    .eq("id", step.id);

  if (updateError) {
    return NextResponse.json({ error: "failed to save" }, { status: 500 });
  }

  return NextResponse.json({ result });
}
