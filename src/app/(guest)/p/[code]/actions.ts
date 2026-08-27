"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeSlug } from "@/lib/slug";
import { ko } from "@/content/ko";
import { CONNECT_META } from "@/lib/steps";

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
  const { error } = await supabase.from("comments").insert({
    project_id: projectId,
    step_id: stepId,
    author_side: "client",
    kind,
    body,
  });

  if (error) return { ok: false, message: ko.common.error };
  revalidatePath(`/p/${code}`, "layout");
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
  return { ok: true };
}
