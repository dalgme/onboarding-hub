"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { STEP_TEMPLATE } from "@/lib/steps";
import { normalizeSlug } from "@/lib/slug";
import { ko } from "@/content/ko";
import type { ActionResult } from "@/app/(guest)/p/[code]/actions";

function revalidateProject(code: string) {
  revalidatePath("/a");
  revalidatePath(`/a/${code}`, "layout");
  revalidatePath(`/p/${code}`, "layout");
}

// ── 프로젝트 ──────────────────────────────────────────────────────

const createProjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, ko.admin.form.invalidCode),
  name: z.string().trim().min(1).max(100),
  clientName: z.string().trim().min(1).max(100),
  clientEmail: z.email(),
  supportTier: z.enum(["self", "assisted"]),
});

export async function createProject(
  input: z.infer<typeof createProjectSchema>,
): Promise<ActionResult> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? ko.common.error,
    };
  }
  const { code, name, clientName, clientEmail, supportTier } = parsed.data;

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      code,
      name,
      client_name: clientName,
      client_email: clientEmail,
      support_tier: supportTier,
    })
    .select("id")
    .single();

  if (error || !project) {
    const duplicate = error?.code === "23505";
    return {
      ok: false,
      message: duplicate ? ko.admin.form.codeDuplicate : ko.common.error,
    };
  }

  // 온보딩 단계를 템플릿에서 복사해 채운다
  const { error: stepsError } = await supabase.from("steps").insert(
    STEP_TEMPLATE.map((template, index) => ({
      project_id: project.id,
      order_index: index,
      key: template.key,
      title: template.title,
      description_md: template.description_md,
      owner_side: template.owner_side,
      verify_type: template.verify_type,
    })),
  );
  if (stepsError) return { ok: false, message: ko.common.error };

  // 의뢰인 이메일을 포털 접근 목록에 등록
  const { error: guestError } = await supabase
    .from("project_guests")
    .insert({ project_id: project.id, email: clientEmail.toLowerCase() });
  if (guestError) return { ok: false, message: ko.common.error };

  revalidatePath("/a");
  redirect(`/a/${code}`);
}

const updateProjectSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  clientName: z.string().trim().min(1).max(100),
  clientEmail: z.email(),
  supportTier: z.enum(["self", "assisted"]),
  status: z.enum(["onboarding", "building", "delivered", "closed"]),
  githubOrg: z.string().trim().max(100),
  vercelTeam: z.string().trim().max(100),
  supabaseOrg: z.string().trim().max(100),
  domain: z.string().trim().max(200),
});

export async function updateProject(
  input: z.infer<typeof updateProjectSchema>,
): Promise<ActionResult> {
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name: data.name,
      client_name: data.clientName,
      client_email: data.clientEmail,
      support_tier: data.supportTier,
      status: data.status,
      github_org: data.githubOrg ? normalizeSlug(data.githubOrg, "github") : null,
      vercel_team: data.vercelTeam ? normalizeSlug(data.vercelTeam, "vercel") : null,
      supabase_org: data.supabaseOrg
        ? normalizeSlug(data.supabaseOrg, "supabase")
        : null,
      domain: data.domain || null,
    })
    .eq("id", data.projectId);

  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(data.code);
  return { ok: true };
}

// ── 게스트 접근 목록 ──────────────────────────────────────────────

const guestSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  email: z.email(),
});

export async function addProjectGuest(
  input: z.infer<typeof guestSchema>,
): Promise<ActionResult> {
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.invalidEmail };

  const supabase = await createClient();
  const { error } = await supabase.from("project_guests").insert({
    project_id: parsed.data.projectId,
    email: parsed.data.email.toLowerCase(),
  });
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}

const guestRemoveSchema = z.object({
  guestId: z.uuid(),
  code: z.string().min(1),
});

export async function removeProjectGuest(
  input: z.infer<typeof guestRemoveSchema>,
): Promise<ActionResult> {
  const parsed = guestRemoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_guests")
    .delete()
    .eq("id", parsed.data.guestId);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}

// ── 단계 ─────────────────────────────────────────────────────────

const adminStepSchema = z.object({
  stepId: z.uuid(),
  code: z.string().min(1),
  status: z.enum(["todo", "verified", "skipped"]),
});

export async function adminSetStepStatus(
  input: z.infer<typeof adminStepSchema>,
): Promise<ActionResult> {
  const parsed = adminStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { stepId, code, status } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("steps")
    .update({
      status,
      blocked_reason: null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
      checked_at: status === "todo" ? null : undefined,
    })
    .eq("id", stepId);

  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(code);
  return { ok: true };
}

// ── 링크 ─────────────────────────────────────────────────────────

const addLinkSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  url: z.url(ko.common.invalidUrl),
  isPinned: z.boolean(),
});

export async function addLink(
  input: z.infer<typeof addLinkSchema>,
): Promise<ActionResult> {
  const parsed = addLinkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? ko.common.error,
    };
  }
  const { projectId, code, label, url, isPinned } = parsed.data;

  const supabase = await createClient();
  const { count } = await supabase
    .from("links")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("links").insert({
    project_id: projectId,
    order_index: count ?? 0,
    label,
    url,
    is_pinned: isPinned,
  });
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(code);
  return { ok: true };
}

const linkIdSchema = z.object({
  linkId: z.uuid(),
  code: z.string().min(1),
});

export async function deleteLink(
  input: z.infer<typeof linkIdSchema>,
): Promise<ActionResult> {
  const parsed = linkIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("links")
    .delete()
    .eq("id", parsed.data.linkId);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}

const togglePinSchema = z.object({
  linkId: z.uuid(),
  code: z.string().min(1),
  isPinned: z.boolean(),
});

export async function toggleLinkPin(
  input: z.infer<typeof togglePinSchema>,
): Promise<ActionResult> {
  const parsed = togglePinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("links")
    .update({ is_pinned: parsed.data.isPinned })
    .eq("id", parsed.data.linkId);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}

// ── 범위 ─────────────────────────────────────────────────────────

const scopeSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  scopeMd: z.string().max(50000),
  agree: z.boolean(),
});

export async function saveScope(
  input: z.infer<typeof scopeSchema>,
): Promise<ActionResult> {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, code, scopeMd, agree } = parsed.data;

  const supabase = await createClient();
  const update: { scope_md: string; scope_agreed_at?: string } = {
    scope_md: scopeMd,
  };
  if (agree) update.scope_agreed_at = new Date().toISOString();

  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(code);
  return { ok: true };
}

// ── 종료 ─────────────────────────────────────────────────────────

const closeSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
});

export async function closeProject(
  input: z.infer<typeof closeSchema>,
): Promise<ActionResult> {
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", parsed.data.projectId);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}

// ── 코멘트 ────────────────────────────────────────────────────────

const adminCommentSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  stepId: z.uuid().nullable(),
  kind: z.enum(["question", "request"]),
  body: z.string().trim().min(1).max(4000),
});

export async function addAdminComment(
  input: z.infer<typeof adminCommentSchema>,
): Promise<ActionResult> {
  const parsed = adminCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, code, stepId, kind, body } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({
    project_id: projectId,
    step_id: stepId,
    author_side: "admin",
    kind,
    body,
  });
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(code);
  return { ok: true };
}

const adminCommentDeleteSchema = z.object({
  commentId: z.uuid(),
  code: z.string().min(1),
});

export async function deleteAdminComment(
  input: z.infer<typeof adminCommentDeleteSchema>,
): Promise<ActionResult> {
  const parsed = adminCommentDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.commentId);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}

const markReadSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
});

export async function markClientCommentsRead(
  input: z.infer<typeof markReadSchema>,
): Promise<ActionResult> {
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ read_at: new Date().toISOString() })
    .eq("project_id", parsed.data.projectId)
    .eq("author_side", "client")
    .is("read_at", null);
  if (error) return { ok: false, message: ko.common.error };
  revalidateProject(parsed.data.code);
  return { ok: true };
}
