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

// 공개키는 브라우저 구독에도 쓰이므로 NEXT_PUBLIC_ 하나만 둔다.
// 서버와 브라우저가 다른 키를 보면 푸시 서비스가 400(VapidPkHashMismatch)을 내고
// 알림은 조용히 사라진다 — 변수를 둘로 두면 그 사고가 언젠가 난다.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// 이 구독으로는 영원히 배달되지 않는다는 뜻 — 목록에서 지운다.
// 404/410: 기기가 해지. 400 VapidPkHashMismatch: 다른 공개키로 만든 구독.
function isDeadSubscription(error: webpush.WebPushError): boolean {
  return (
    error.statusCode === 404 ||
    error.statusCode === 410 ||
    error.body.includes("VapidPkHashMismatch")
  );
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
      PUBLIC_KEY as string,
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
            // 푸시 서비스가 응답을 멈추면 after() 작업이 함수 시간을 다 잡아먹는다
            { TTL: 60 * 60, timeout: 5_000 },
          );
        } catch (cause) {
          if (cause instanceof webpush.WebPushError) {
            if (isDeadSubscription(cause)) {
              await admin.from("push_subscriptions").delete().eq("id", sub.id);
              return;
            }
            // 400/401/403은 내 VAPID 설정 문제(키 짝·subject)다. 의뢰인 문제가 아니다
            console.error("[push] 전송 실패", {
              status: cause.statusCode,
              body: cause.body.slice(0, 300),
              configError: [400, 401, 403].includes(cause.statusCode),
            });
            return;
          }
          console.error("[push] 전송 실패", {
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
