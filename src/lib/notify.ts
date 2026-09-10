import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmin } from "@/lib/push";
import { redact } from "@/lib/redact";
import type { NoticeKind } from "@/lib/database.types";

// 관리자 푸시의 유일한 입구 — 장부(notices)를 거친다.
//   claim(dedupe_key) → 보내기 → sent | failed
// dedupe_key 가 같으면 두 번 보내지 않는다. 키에는 반드시 에폭(전이 시각·회차)이
// 들어가야 한다 — 상태가 다시 나빠지면 새 키로 다시 알린다.
// 어떤 경우에도 throw 하지 않는다. 알림 실패는 의뢰인의 행동 저장을 막지 않는다.

export interface AdminPushInput {
  dedupeKey: string;
  kind: NoticeKind;
  projectId?: string | null;
  stepId?: string | null;
  title: string;
  body: string;
  url: string;
  detail?: string;
}

export type PushOutcome = "sent" | "duplicate" | "failed" | "unconfigured" | "no_subscribers";

// KST 날짜 (일일 상한 인덱스용). 서버 TZ 와 무관하게 계산한다
export function dayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

// dedupe_key 에서 ISO 분 단위 에폭을 만들 때 쓴다
export function minuteOf(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 16);
}

// 푸시 서비스의 topic (같은 topic 은 미배달 알림을 대체한다). 32자 URL-safe
function topicOf(dedupeKey: string): string {
  return createHash("sha256").update(dedupeKey).digest("base64url").slice(0, 32);
}

export async function pushAdmin(input: AdminPushInput): Promise<PushOutcome> {
  try {
    const admin = createAdminClient();
    const now = new Date();
    // 멱등 잠금: 이미 같은 키가 있으면 아무 것도 돌려주지 않는다
    const { data: claimed, error } = await admin
      .from("notices")
      .upsert(
        {
          project_id: input.projectId ?? null,
          step_id: input.stepId ?? null,
          kind: input.kind,
          channel: "push",
          dedupe_key: input.dedupeKey,
          status: "claimed",
          claimed_at: now.toISOString(),
          day_kst: dayKst(now),
          detail: input.detail ? redact(input.detail) : null,
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      // 23505 = 일일 상한 부분 유니크 인덱스 충돌(dedupe_key 충돌은 ignoreDuplicates 가 흡수한다)
      // — 「오늘은 이미 알렸다」이므로 조용히 끝낸다
      if (error.code === "23505") return "duplicate";
      console.error("[notify] 장부 기록 실패", { key: input.dedupeKey, message: redact(error.message) });
      // 장부가 안 되면 알림을 포기하지는 않는다 — 알림이 장부보다 중요하다
      const fallback = await notifyAdmin({ title: input.title, body: input.body, url: input.url, key: input.dedupeKey });
      return fallback.sent > 0 ? "sent" : "failed";
    }
    const row = claimed?.[0];
    if (!row) return "duplicate";

    const result = await notifyAdmin({
      title: input.title,
      body: input.body,
      url: input.url,
      key: input.dedupeKey,
      topic: topicOf(input.dedupeKey),
    });
    const outcome: PushOutcome =
      result.subscribers === 0
        ? "no_subscribers"
        : result.sent > 0
          ? "sent"
          : result.configured
            ? "failed"
            : "unconfigured";
    // detail 은 호출자의 데이터(토큰 전환 상태 등)라 덮어쓰지 않는다. 실패 사유는 로그로
    if (outcome !== "sent") {
      console.error("[notify] 배달 실패", { key: input.dedupeKey, outcome });
    }
    await admin
      .from("notices")
      .update({
        status: outcome === "sent" ? "sent" : "failed",
        sent_at: outcome === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    return outcome;
  } catch (cause) {
    console.error("[notify] 알림 처리 실패", { key: input.dedupeKey, message: redact(cause) });
    return "failed";
  }
}
