"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";
import { pushAdmin, minuteOf } from "@/lib/notify";
import { isAutoVerifyType, markAwaitAdminAck, runVerification } from "@/lib/verify/run";
import { ko } from "@/content/ko";
import { CONNECT_META } from "@/lib/steps";

type StepWithProject = {
  title: string;
  verify_type: string;
  projects: { id: string; name: string; code: string } | null;
};

// 알림 문구에 쓸 단계 제목·프로젝트 이름. 의뢰인 세션(RLS)으로 읽는다
async function describeStep(
  stepId: string,
): Promise<{ step: string; project: string; projectId: string; code: string; verifyType: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("steps")
    .select("title, verify_type, projects(id, name, code)")
    .eq("id", stepId)
    .maybeSingle();
  const row = data as unknown as StepWithProject | null;
  if (!row?.projects) return null;
  return {
    step: row.title,
    project: row.projects.name,
    projectId: row.projects.id,
    code: row.projects.code,
    verifyType: row.verify_type,
  };
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  normalizedSlug?: string;
}

const statusSchema = z.object({
  stepId: z.uuid(),
  code: z.string().min(1),
  status: z.enum(["doing", "client_done", "blocked"]),
  blockedReason: z.string().trim().max(500).optional(),
});

export async function updateStepStatus(
  input: z.infer<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { stepId, code, status, blockedReason } = parsed.data;

  if (status === "blocked" && !blockedReason) {
    return { ok: false, message: ko.stepDetail.blockedPrompt };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("steps")
    .update({
      status,
      blocked_reason: status === "blocked" ? blockedReason : null,
      checked_at: status === "client_done" ? now : null,
    })
    .eq("id", stepId);

  if (error) return { ok: false, message: ko.common.error };
  revalidatePath(`/p/${code}`, "layout");

  // 의뢰인이 한 일을 내 폰으로. 실패해도 위 저장은 이미 끝났다
  if (status === "client_done" || status === "blocked") {
    const info = await describeStep(stepId);
    if (info) {
      // 자동 확인이 되는 단계는 사람이 누를 필요 없이 지금 바로 검증한다.
      // 확인되면 그 자리에서 「확인 완료」, 아니면 원인과 함께 알림이 간다 (runVerification 안에서)
      if (status === "client_done" && isAutoVerifyType(info.verifyType)) {
        await runVerification(stepId, "client");
        revalidatePath(`/p/${code}`, "layout");
        return { ok: true };
      }
      // 메일함으로 초대가 오는 단계는 「내가 확인할 차례」로 표시한다
      if (status === "client_done") await markAwaitAdminAck(stepId).catch(() => null);
      const message =
        status === "client_done"
          ? ko.push.clientDone(info.project, info.step)
          : ko.push.blocked(info.project, info.step, blockedReason ?? "");
      after(() =>
        pushAdmin({
          dedupeKey: `client_event:${stepId}:${status}:${minuteOf(now)}`,
          kind: "client_event",
          projectId: info.projectId,
          stepId,
          ...message,
          url: `/a/${info.code}?tab=steps`,
        }),
      );
    }
  }
  return { ok: true };
}

const slugSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  stepKey: z.string().min(1),
  rawSlug: z.string().min(1),
});

export async function saveOrgSlug(
  input: z.infer<typeof slugSchema>,
): Promise<ActionResult> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, code, stepKey, rawSlug } = parsed.data;

  const meta = CONNECT_META[stepKey];
  if (!meta) return { ok: false, message: ko.common.error };

  // 조직 slug는 정규화 없이 그대로 저장하지 않는다 (절대 금지 §12)
  const slug = normalizeSlug(rawSlug, meta.provider);
  if (!slug) return { ok: false, message: ko.stepDetail.slugEmptyError };

  const supabase = await createClient();
  const update: Partial<
    Record<"github_org" | "vercel_team" | "supabase_org", string>
  > = {};
  update[meta.slugColumn] = slug;
  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId);

  if (error) return { ok: false, message: ko.common.error };

  // 주소를 저장했다 = 진행 중이다. todo 에 머물러 있으면 doing 으로 올린다 (의뢰인 허용 전이)
  await supabase
    .from("steps")
    .update({ status: "doing" })
    .eq("project_id", projectId)
    .eq("key", stepKey)
    .eq("status", "todo");

  // 「완료했습니다」를 먼저 누르고 주소를 나중에 넣은 경우 — 백오프를 기다리지 않고 바로 다시 확인한다.
  // (안 그러면 「주소 부탁」 문구가 최대 24시간 남는다)
  const { data: doneStep } = await supabase
    .from("steps")
    .select("id")
    .eq("project_id", projectId)
    .eq("key", stepKey)
    .eq("status", "client_done")
    .maybeSingle();
  if (doneStep) await runVerification(doneStep.id, "auto").catch(() => null);

  revalidatePath(`/p/${code}`, "layout");
  return { ok: true, normalizedSlug: slug };
}

const commentSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  stepId: z.uuid().nullable(),
  kind: z.enum(["question", "request"]),
  body: z.string().trim().min(1).max(4000),
});

export async function addGuestComment(
  input: z.infer<typeof commentSchema>,
): Promise<ActionResult> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, code, stepId, kind, body } = parsed.data;

  const supabase = await createClient();
  // author_side는 RLS WITH CHECK가 검사한다 — 의뢰인 세션이면 client만 통과
  const { data: inserted, error } = await supabase
    .from("comments")
    .insert({
      project_id: projectId,
      step_id: stepId,
      author_side: "client",
      kind,
      body,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, message: ko.common.error };
  revalidatePath(`/p/${code}`, "layout");

  const { data: project } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .maybeSingle();
  if (project) {
    const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
    const commentId = inserted?.id ?? minuteOf(new Date());
    after(() =>
      pushAdmin({
        dedupeKey: `client_event:comment:${commentId}`,
        kind: "client_event",
        projectId,
        stepId,
        ...ko.push.comment(project.name, kind, preview),
        url: `/a/${code}?tab=steps`,
      }),
    );
  }
  return { ok: true };
}

const deleteSchema = z.object({
  commentId: z.uuid(),
  code: z.string().min(1),
});

export async function deleteGuestComment(
  input: z.infer<typeof deleteSchema>,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.commentId);

  if (error) return { ok: false, message: ko.common.error };
  revalidatePath(`/p/${parsed.data.code}`, "layout");
  return { ok: true };
}

const readSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
});

export async function markAdminCommentsRead(
  input: z.infer<typeof readSchema>,
): Promise<ActionResult> {
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ read_at: new Date().toISOString() })
    .eq("project_id", parsed.data.projectId)
    .eq("author_side", "admin")
    .is("read_at", null);

  if (error) return { ok: false, message: ko.common.error };
  revalidatePath(`/p/${parsed.data.code}`, "layout");
  return { ok: true };
}

const helpSchema = z.object({
  stepId: z.uuid(),
  projectId: z.uuid(),
  code: z.string().min(1),
});

// 「화면공유로 도움받기」 — blocked(need_help) + 요청 코멘트로 내게 알림
export async function requestScreenShareHelp(
  input: z.infer<typeof helpSchema>,
): Promise<ActionResult> {
  const parsed = helpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { stepId, projectId, code } = parsed.data;

  const supabase = await createClient();
  const { error: stepError } = await supabase
    .from("steps")
    .update({ status: "blocked", blocked_reason: "need_help" })
    .eq("id", stepId);
  if (stepError) return { ok: false, message: ko.common.error };

  const { error: commentError } = await supabase.from("comments").insert({
    project_id: projectId,
    step_id: stepId,
    author_side: "client",
    kind: "request",
    body: ko.stepDetail.needHelpReason,
  });
  if (commentError) return { ok: false, message: ko.common.error };

  revalidatePath(`/p/${code}`, "layout");

  const info = await describeStep(stepId);
  if (info) {
    after(() =>
      pushAdmin({
        dedupeKey: `client_event:${stepId}:need_help:${minuteOf(new Date())}`,
        kind: "client_event",
        projectId,
        stepId,
        ...ko.push.needHelp(info.project, info.step),
        url: `/a/${info.code}?tab=steps`,
      }),
    );
  }
  return { ok: true };
}


const startSchema = z.object({ stepId: z.uuid(), code: z.string().min(1) });

// 「만들었습니다 — 다음 단계로」: 화면 상태만 바꾸면 서버는 의뢰인이 시작했는지 모른다.
// todo 인 단계만 doing 으로 올린다. 실패해도 화면 진행은 막지 않는다
export async function startStep(input: z.infer<typeof startSchema>): Promise<ActionResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const supabase = await createClient();
  await supabase
    .from("steps")
    .update({ status: "doing" })
    .eq("id", parsed.data.stepId)
    .eq("status", "todo");
  revalidatePath(`/p/${parsed.data.code}`, "layout");
  return { ok: true };
}


const proposeSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  when: z.string().trim().min(2).max(200),
});

// assisted 등급 첫 화면: 「편한 시간을 남겨 주세요」 — 질문·요청 코멘트 하나로 남긴다(새 테이블 없음)
export async function proposeScreenShareTime(
  input: z.infer<typeof proposeSchema>,
): Promise<ActionResult> {
  const parsed = proposeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, code, when } = parsed.data;
  return addGuestComment({
    projectId,
    code,
    stepId: null,
    kind: "request",
    body: `${ko.portal.assisted.commentPrefix} ${when}`,
  });
}
