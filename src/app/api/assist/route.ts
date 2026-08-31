import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONNECT_META, SIMPLE_CONNECT_META } from "@/lib/steps";
import {
  ASSIST_MAX_CHARS,
  ASSIST_MAX_TOKENS,
  ASSIST_MAX_TURNS,
  ASSIST_MODEL,
  ASSIST_SEARCH_DOMAINS,
  buildAssistSystemPrompt,
} from "@/lib/assist";
import { ko } from "@/content/ko";

const bodySchema = z.object({
  code: z.string().min(1).max(60),
  stepKey: z.string().min(1).max(60),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(ASSIST_MAX_CHARS),
      }),
    )
    .min(1)
    .max(ASSIST_MAX_TURNS),
});

// 도우미 응답. 대화는 저장하지 않는다 — 요청을 처리하고 잊는다.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { code, stepKey, messages } = parsed.data;

  // 로그인한 사람만. 프로젝트 접근 권한은 RLS가 판정한다.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, github_org, vercel_team, supabase_org")
    .eq("code", code)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: step } = await supabase
    .from("steps")
    .select("title, status, verify_result")
    .eq("project_id", project.id)
    .eq("key", stepKey)
    .maybeSingle();
  if (!step) {
    return NextResponse.json({ error: "step not found" }, { status: 404 });
  }

  const meta = CONNECT_META[stepKey];
  const simpleMeta = SIMPLE_CONNECT_META[stepKey];
  if (!meta && !simpleMeta) {
    return NextResponse.json({ error: "not a connect step" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ reply: ko.assist.unavailable });
  }

  const savedSlug = meta ? (project[meta.slugColumn] ?? null) : null;

  // 초대할 이메일(제작자)은 서버에서만 조회한다
  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from("admins")
    .select("email")
    .limit(1)
    .maybeSingle();

  const system = buildAssistSystemPrompt({
    projectName: project.name,
    stepTitle: step.title,
    serviceName: meta?.serviceName ?? simpleMeta.serviceName,
    roleName: meta?.roleName ?? simpleMeta.roleName,
    orgNoun: meta?.orgNoun ?? "계정",
    savedSlug,
    stepStatus: step.status,
    verifyStatus: step.verify_result?.status ?? null,
    inviteEmail: adminRow?.email ?? "",
    createUrl: meta?.createUrl ?? simpleMeta.createUrl,
    inviteUrl: meta
      ? savedSlug
        ? meta.inviteUrl(savedSlug)
        : null
      : simpleMeta.inviteUrl,
  });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: ASSIST_MODEL,
      max_tokens: ASSIST_MAX_TOKENS,
      system,
      output_config: { effort: "low" },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 3,
          allowed_domains: ASSIST_SEARCH_DOMAINS,
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ reply: ko.assist.refused });
    }

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return NextResponse.json({ reply: reply || ko.assist.empty });
  } catch (cause) {
    // 도우미가 죽어도 온보딩 자체는 계속 진행할 수 있어야 한다
    console.error("[assist] 응답 실패", {
      code,
      stepKey,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return NextResponse.json({ reply: ko.assist.failed });
  }
}
