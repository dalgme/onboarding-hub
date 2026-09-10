"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/auth";
import { OPTIONAL_STEP_TEMPLATES, STEP_TEMPLATE } from "@/lib/steps";
import { normalizeSlug } from "@/lib/slug";
import { buildMagicLinkUrl } from "@/lib/magic-link";
import { preflightBlockReason } from "@/lib/preflight";
import { onAdminReplied, portalUrl, recordCredentialsSent } from "@/lib/outbox";
import { after } from "next/server";
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

// 선택 단계(Resend·Solapi 등)를 템플릿에서 복사해 프로젝트에 추가한다
const optionalStepSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  stepKey: z.string().min(1),
});

export async function addOptionalStep(
  input: z.infer<typeof optionalStepSchema>,
): Promise<ActionResult> {
  const parsed = optionalStepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, code, stepKey } = parsed.data;

  const template = OPTIONAL_STEP_TEMPLATES.find(
    (item) => item.key === stepKey,
  );
  if (!template) return { ok: false, message: ko.common.error };

  const supabase = await createClient();
  const { data: lastStep } = await supabase
    .from("steps")
    .select("order_index")
    .eq("project_id", projectId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("steps").insert({
    project_id: projectId,
    order_index: (lastStep?.order_index ?? -1) + 1,
    key: template.key,
    title: template.title,
    description_md: template.description_md,
    owner_side: template.owner_side,
    verify_type: template.verify_type,
  });
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
  const repliedAt = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("comments")
    .insert({
      project_id: projectId,
      step_id: stepId,
      author_side: "admin",
      kind,
      body,
    })
    .select("id, projects(code, client_name)")
    .maybeSingle();
  if (error) return { ok: false, message: ko.common.error };

  // 답했다는 것은 읽었다는 뜻 — 답글 이전에 온 의뢰인 글을 읽음 처리한다.
  // 안 그러면 「안 읽은 질문 N건」이 처리 후에도 빨갛게 남아 다시 안 보게 된다.
  // 실패해도 답글은 이미 저장됐으므로 결과를 뒤집지 않는다
  await supabase
    .from("comments")
    .update({ read_at: repliedAt })
    .eq("project_id", projectId)
    .eq("author_side", "client")
    .is("read_at", null)
    .lte("created_at", repliedAt);

  // 답글은 포털에 있지만 의뢰인은 카톡을 본다 — 「답글 달았습니다 + 본문」 문구를 보낼 카톡에
  const project = (inserted as unknown as { id: string; projects: { code: string; client_name: string } | null } | null);
  if (project?.projects && inserted?.id) {
    const info = {
      commentId: inserted.id,
      projectId,
      stepId,
      body,
      projectCode: project.projects.code,
      clientName: project.projects.client_name,
    };
    after(() => onAdminReplied(info));
  }

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

// ── 의뢰인 비밀번호 발급·재발급 ──────────────────────────────────
// 임시 비밀번호를 만들어 카톡으로 전달하는 주 접속 수단.
// service_role을 쓰므로 관리자 여부와 대상 이메일의 프로젝트 소속을 검증한다.

const passwordIssueSchema = z.object({
  projectId: z.uuid(),
  email: z.email(),
});

export interface PasswordIssueResult {
  ok: boolean;
  message?: string;
  password?: string;
}

function generateTempPassword(): string {
  // 헷갈리는 문자(0/O, 1/l/I)를 뺀 12자, 4자 단위 하이픈
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export async function issueGuestPassword(
  input: z.infer<typeof passwordIssueSchema>,
): Promise<PasswordIssueResult> {
  const parsed = passwordIssueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  if (!(await isAdminUser())) {
    return { ok: false, message: ko.common.unauthorized };
  }

  const supabase = await createClient();
  const { data: guestRow } = await supabase
    .from("project_guests")
    .select("id")
    .eq("project_id", projectId)
    .eq("email", email)
    .maybeSingle();
  if (!guestRow) return { ok: false, message: ko.common.error };

  // 사전 점검 빨강이면 만들지 않는다 — 우회 없음. 이 상태로 나간 접속 정보는
  // 의뢰인의 초대를 헛돌게 한다 (실제 사고 2건의 공통 원인)
  const blocked = await preflightBlockReason(email);
  if (blocked) return { ok: false, message: blocked };

  const password = generateTempPassword();
  const admin = createAdminClient();

  // must_change_password: 임시 비밀번호 표시 — 로그인하면 새 비밀번호 정하는
  // 화면이 먼저 뜨고, 본인이 바꾸는 순간 해제된다
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });

  if (createError) {
    // 이미 존재하는 사용자면 비밀번호만 교체한다
    const { data: userList, error: listError } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return { ok: false, message: ko.common.error };
    const existing = userList.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (!existing) return { ok: false, message: ko.common.error };
    const { error: updateError } = await admin.auth.admin.updateUserById(
      existing.id,
      { password, user_metadata: { must_change_password: true } },
    );
    if (updateError) return { ok: false, message: ko.common.error };
  }

  return { ok: true, password };
}

// 관리자 본인 비밀번호 변경 — 본인 세션으로 직접 바꾼다 (admin API 불필요)
const myPasswordSchema = z.object({
  newPassword: z.string().min(8, ko.admin.password.tooShort).max(100),
});

export async function changeMyPassword(
  input: z.infer<typeof myPasswordSchema>,
): Promise<ActionResult> {
  const parsed = myPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? ko.common.error,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) return { ok: false, message: ko.common.error };
  return { ok: true };
}

// ── 로그인 링크 (매직링크) 생성 ──────────────────────────────────
// 메일이 늦거나 스팸에 빠질 때, 관리자가 직접 만들어 카톡 등으로 전달한다.
// service_role을 쓰므로 관리자 여부와 대상 이메일의 프로젝트 소속을
// 반드시 서버에서 검증한다.

const magicLinkSchema = z.object({
  projectId: z.uuid(),
  email: z.email(),
});

export interface MagicLinkResult {
  ok: boolean;
  message?: string;
  link?: string;
}

export async function generateGuestMagicLink(
  input: z.infer<typeof magicLinkSchema>,
): Promise<MagicLinkResult> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  const { projectId, email } = parsed.data;

  if (!(await isAdminUser())) {
    return { ok: false, message: ko.common.unauthorized };
  }

  // 이 프로젝트의 접근 목록에 있는 이메일만 허용
  const supabase = await createClient();
  const { data: guestRow } = await supabase
    .from("project_guests")
    .select("id")
    .eq("project_id", projectId)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!guestRow) return { ok: false, message: ko.common.error };

  const blocked = await preflightBlockReason(email.toLowerCase());
  if (blocked) return { ok: false, message: blocked };

  const headerList = await headers();
  const host = headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : "");

  const admin = createAdminClient();
  let { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: email.toLowerCase(),
  });

  // 한 번도 로그인한 적 없는 이메일이면 사용자부터 만든다
  if (error) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true,
    });
    if (createError) return { ok: false, message: ko.common.error };
    ({ data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: email.toLowerCase(),
    }));
  }

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) return { ok: false, message: ko.common.error };

  // Supabase의 action_link 대신 우리 착지 화면으로 연결한다. 토큰은 프래그먼트(#)에
  // 실어 서버·카톡 링크 미리보기·메일 스캐너에는 전달되지 않게 하고, 의뢰인이
  // 버튼을 누른 뒤에만 /auth/callback 이 검증·소비한다 (GET 즉시 소비하던 이전 형태는
  // 미리보기가 먼저 열어 링크를 태워 버렸다).
  const link = buildMagicLinkUrl(origin, hashedToken);
  return { ok: true, link };
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


// ── 「보낼 카톡」 ──────────────────────────────────────────────────

const outboxSchema = z.object({
  id: z.uuid(),
  action: z.enum(["sent", "skipped", "restore"]),
});

// 카드 버튼 3개. 「카톡으로 보내기」는 화면에서 공유/복사가 성공한 뒤에만 sent 를 부른다
export async function handleOutbox(
  input: z.infer<typeof outboxSchema>,
): Promise<ActionResult> {
  const parsed = outboxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  if (!(await isAdminUser())) return { ok: false, message: ko.common.unauthorized };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { id, action } = parsed.data;
  let query = admin.from("notices").update(
    action === "sent"
      ? { status: "sent", sent_at: now, skip_reason: null }
      : action === "skipped"
        ? { status: "skipped", skip_reason: "admin", sent_at: null }
        : { status: "pending", sent_at: null, skip_reason: null },
  ).eq("id", id).eq("channel", "outbox");
  // 되돌리기는 사람이 처리한 것만, 그리고 pending 인 적이 없던 credentials 는 제외
  query =
    action === "restore"
      ? query.in("status", ["sent", "skipped"]).neq("kind", "credentials")
      : query.eq("status", "pending");
  const { data, error } = await query.select("id, kind, project_id, projects(code)");
  if (error || !data || data.length === 0) return { ok: false, message: ko.common.error };

  const row = data[0] as unknown as { kind: string; project_id: string | null; projects: { code: string } | null };
  // 접속 안내를 보냈으면 프로젝트의 「접속 안내 보냄」 시각도 함께
  if (action === "sent" && row.kind === "credentials" && row.project_id) {
    await admin.from("projects").update({ access_sent_at: now }).eq("id", row.project_id);
  }
  revalidatePath("/a");
  if (row.projects?.code) revalidatePath(`/a/${row.projects.code}`, "layout");
  return { ok: true };
}

const accessSentSchema = z.object({
  projectId: z.uuid(),
  code: z.string().min(1),
  email: z.email(),
});

// 발급 화면의 「카톡으로 보내기」— 공유/복사가 성공한 순간 접속 안내를 보낸 것으로 기록한다.
// 장부에는 비밀번호 없는 본문만 남는다
export async function markAccessSent(
  input: z.infer<typeof accessSentSchema>,
): Promise<ActionResult> {
  const parsed = accessSentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ko.common.error };
  if (!(await isAdminUser())) return { ok: false, message: ko.common.unauthorized };
  const { projectId, code, email } = parsed.data;

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .update({ access_sent_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("name")
    .maybeSingle();
  if (error || !project) return { ok: false, message: ko.common.error };
  // 장부 본문은 서버가 만든다 — 비밀번호 자리는 마스킹. 브라우저가 준 문자열을 저장하지 않는다
  const bodyMasked = ko.admin.password.kakaoMessage({
    projectName: project.name,
    portalUrl: portalUrl(code),
    email: email.toLowerCase(),
    password: ko.outbox.credentialsBodyMasked,
  });
  await recordCredentialsSent({ projectId, email: email.toLowerCase(), body: bodyMasked });
  revalidateProject(code);
  return { ok: true };
}
