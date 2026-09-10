import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// 관리자 휴대폰으로 웹 푸시. 메일·외부 서비스 없이 PWA만으로 간다.
// 어떤 경우에도 throw 하지 않는다 — 알림이 실패해도 의뢰인의 행동은 저장돼야 한다.

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function vapidSubject(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return site.startsWith("https://") ? site : "mailto:admin@example.com";
}

export async function notifyAdmin(payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;
  try {
    webpush.setVapidDetails(
      vapidSubject(),
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");

    await Promise.all(
      (subs ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 },
          );
        } catch (cause) {
          const status =
            cause instanceof webpush.WebPushError ? cause.statusCode : null;
          // 기기가 구독을 해지했으면(404/410) 목록에서 지운다
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", sub.id);
            return;
          }
          console.error("[push] 전송 실패", {
            status,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }),
    );
  } catch (cause) {
    console.error("[push] 알림 처리 실패", {
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
