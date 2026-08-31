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

// 검색이 붙으면 응답이 길어질 수 있다. 다만 무한정 매달리게 두지 않는다
export const maxDuration = 180;

const bodySchema = z.object({
  code: z.string().min(1).max(60),
  stepKey: z.string().min(1).max(60),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        // 길이는 거절하지 않고 서버에서 잘라 쓴다 — 한 번 길어진 대화 때문에
        // 이후 모든 질문이 400으로 막히는 상황을 만들지 않는다
        content: z.string().min(1).max(ASSIST_MAX_CHARS * 10),
      }),
    )
    .min(1)
    .max(ASSIST_MAX_TURNS),
});

// 호출량 제한. 새 테이블을 만들지 않는다(§12) — 인스턴스 메모리에만 둔다.
// 정확한 쿼터가 목적이 아니라 폭주(재시도 루프·장난)를 막는 것이 목적이다.
const HOUR = 3_600_000;
const MINUTE = 60_000;
const PER_HOUR = 40;
const PER_MINUTE = 10;
// 진행 중 표시에는 만료를 둔다. 함수가 중간에 죽으면 finally가 돌지 않아
// 표시가 남고, 그 의뢰인만 계속 「너무 빠르다」를 보게 된다
const INFLIGHT_TTL = 200_000;
const hits = new Map<string, number[]>();
const inFlight = new Map<string, number>();

function busy(userId: string): boolean {
  const started = inFlight.get(userId);
  if (started === undefined) return false;
  if (Date.now() - started > INFLIGHT_TTL) {
    inFlight.delete(userId);
    return false;
  }
  return true;
}

function allow(userId: string): boolean {
  const now = Date.now();
  if (hits.size > 200) {
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= HOUR)) hits.delete(key);
    }
  }
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < HOUR);
  if (recent.length >= PER_HOUR) return false;
  if (recent.filter((time) => now - time < MINUTE).length >= PER_MINUTE) {
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

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

  // 같은 사람이 동시에 여러 번 던지거나 짧은 시간에 몰아치는 것을 막는다
  if (busy(user.id) || !allow(user.id)) {
    return NextResponse.json({ reply: ko.assist.tooMany }, { status: 429 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, status, github_org, vercel_team, supabase_org")
    .eq("code", code)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 종료된 프로젝트는 열람 전용이다. 화면이 도우미를 숨기는 것과 별개로
  // 서버에서도 막는다 — 의뢰인 비밀번호에는 만료가 없다.
  if (project.status === "closed") {
    return NextResponse.json({ reply: ko.assist.closed }, { status: 403 });
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

  // 첫 메시지는 반드시 user여야 한다 — assistant로 시작하면 API가 400을 낸다.
  // 화면이 대화를 잘못 잘라 보내도 여기서 흡수한다.
  const firstUser = messages.findIndex((message) => message.role === "user");
  if (firstUser < 0) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const convo: Anthropic.MessageParam[] = messages
    .slice(firstUser)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, ASSIST_MAX_CHARS),
    }));

  const textOf = (blocks: Anthropic.ContentBlock[]) =>
    blocks
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

  inFlight.set(user.id, Date.now());
  // 한 번의 질문이 재시도까지 겹쳐 여러 번 과금되지 않게 재시도를 줄이고,
  // 한 호출이 무한정 매달리지 않게 시간 상한을 둔다
  const deadline = Date.now() + 110_000;
  try {
    const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
    const ask = () =>
      client.messages.create({
        model: ASSIST_MODEL,
        max_tokens: ASSIST_MAX_TOKENS,
        system,
        // Opus 5의 기본값과 같다. 의도를 코드에 남긴다
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 3,
            allowed_domains: ASSIST_SEARCH_DOMAINS,
          },
        ],
        messages: convo,
      });

    const parts: string[] = [];
    let response = await ask();

    // 검색 루프가 한도에 걸리면 pause_turn으로 돌아온다. 이어받지 않으면
    // "검색만 하고 답은 아직 쓰지 않은" 상태가 그대로 나간다
    for (
      let i = 0;
      i < 2 && response.stop_reason === "pause_turn" && Date.now() < deadline;
      i += 1
    ) {
      parts.push(textOf(response.content));
      convo.push({ role: "assistant", content: response.content });
      response = await ask();
    }

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ reply: ko.assist.refused });
    }

    parts.push(textOf(response.content));
    const reply = parts.filter(Boolean).join("\n").trim();

    // 잘린 답을 완성된 안내처럼 내보내지 않는다 —
    // 절차 안내가 중간에 끊기면 아무 안내도 없는 것보다 나쁘다
    if (
      response.stop_reason === "max_tokens" ||
      response.stop_reason === "pause_turn"
    ) {
      console.error("[assist] 답변이 잘림", {
        code,
        stepKey,
        stopReason: response.stop_reason,
      });
      return NextResponse.json({
        reply: reply
          ? `${reply}\n\n${ko.assist.truncated}`
          : ko.assist.truncated,
      });
    }

    return NextResponse.json({ reply: reply || ko.assist.empty });
  } catch (cause) {
    // 도우미가 죽어도 온보딩 자체는 계속 진행할 수 있어야 한다
    console.error("[assist] 응답 실패", {
      code,
      stepKey,
      status: cause instanceof Anthropic.APIError ? cause.status : null,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return NextResponse.json({ reply: ko.assist.failed });
  } finally {
    inFlight.delete(user.id);
  }
}
