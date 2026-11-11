// FCM HTTP v1 via firebase-admin, which mints the OAuth token and reports dead tokens. Fails open: with no
// service-account secret, `configured` is false and push deliveries are not claimed.
//
// One message per device token, sent in batches (`sendEach`, at most 500 per call), so a large send takes minutes,
// not hours (109). The payload is specs/109-notification-record/contracts/push-payload.md.
import { getSecretString, type DevicePlatform } from "@effy/edge-shared";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";

/** One push to one device, built from a notification row: the words as they were written, never the catalogue's. */
export interface PushMessage {
  token: string;
  platform: DevicePlatform;
  type: string;
  notificationId: string;
  title: string;
  body: string;
  /** Compact JSON (notification-destinations). */
  destination: string;
  tag: string;
  group: string;
  /** The recipient's unseen count (110): the app icon's number on iOS, the launcher count on Android. Not for web. */
  badge?: number;
  /** The Android notification channel of its category (111 R12), so a person can mute one kind in the phone's settings. */
  androidChannel?: string | null;
  /** A back-office message's picture (112): shown expanded on Android, and by the shop console. iOS shows it in the inbox. */
  imageUrl?: string | null;
}

export interface SendResult {
  ok: boolean;
  /** FCM says the token is dead, so the worker deletes it. */
  prune: boolean;
  errorClass?: string;
}

export interface Sender {
  configured: boolean;
  /** One result per message, in order. */
  sendEach(messages: readonly PushMessage[]): Promise<SendResult[]>;
}

/** FCM's limit per `sendEach` call. */
export const FCM_BATCH_LIMIT = 500;

let appInstance: App | undefined;

async function firebaseApp(): Promise<App | undefined> {
  if (appInstance) return appInstance;
  const arn = process.env.FCM_SERVICE_ACCOUNT_ARN;
  const projectId = process.env.FCM_PROJECT_ID;
  if (!arn || !projectId) return undefined;

  const raw = await getSecretString(arn);
  const svc = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  if (!svc.client_email || !svc.private_key) return undefined;

  appInstance =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: svc.project_id ?? projectId,
        clientEmail: svc.client_email,
        privateKey: svc.private_key,
      }),
    });
  return appInstance;
}

/**
 * Errors that mean the token is dead. Not `messaging/invalid-argument`: that is a malformed message (our fault), and
 * pruning on it silently deletes working registrations.
 */
const PRUNABLE = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/** The FCM message for one push. Every `data` value is a string (an FCM rule). */
export function toFcmMessage(m: PushMessage): Message {
  const data = {
    type: m.type,
    notificationId: m.notificationId,
    destination: m.destination,
    // Web messages have no `notification` block, so the words ride here; the apps read them from `notification`.
    title: m.title,
    body: m.body,
    tag: m.tag,
    group: m.group,
    ...(m.imageUrl ? { image: m.imageUrl } : {}),
  };
  if (m.platform === "web") {
    return {
      token: m.token,
      // No `notification` key: with one, the Firebase SDK shows a second banner, and `tag`, `data` and the badge
      // could not be used. Our service worker must therefore show something on every push, or iOS revokes the
      // permission (`src/sw.ts` does).
      data,
      webpush: {
        headers: {
          // A new-order push eleven minutes late is worse than none.
          TTL: "600",
          Urgency: "high",
        },
      },
    };
  }
  const badge = typeof m.badge === "number" && m.badge >= 0 ? Math.floor(m.badge) : undefined;
  const androidNotification = {
    ...(badge !== undefined ? { notificationCount: badge } : {}),
    ...(m.androidChannel ? { channelId: m.androidChannel } : {}),
  };
  return {
    token: m.token,
    // iOS would need a notification service extension to show the picture (waits for the paid Apple account).
    notification: { title: m.title, body: m.body, ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}) },
    data,
    android: { priority: "high", ...(Object.keys(androidNotification).length > 0 ? { notification: androidNotification } : {}) },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", ...(badge !== undefined ? { badge } : {}) } },
    },
  };
}

function errorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "unknown";
}

export async function createSender(): Promise<Sender> {
  const app = await firebaseApp();
  if (!app)
    return {
      configured: false,
      async sendEach(messages) {
        return messages.map(() => ({ ok: false, prune: false, errorClass: "fcm_not_configured" }));
      },
    };

  const messaging = getMessaging(app);
  return {
    configured: true,
    async sendEach(messages): Promise<SendResult[]> {
      const out: SendResult[] = [];
      for (let i = 0; i < messages.length; i += FCM_BATCH_LIMIT) {
        const chunk = messages.slice(i, i + FCM_BATCH_LIMIT);
        try {
          const res = await messaging.sendEach(chunk.map(toFcmMessage));
          for (const r of res.responses) {
            if (r.success) out.push({ ok: true, prune: false });
            else {
              const code = errorCode(r.error);
              out.push({ ok: false, prune: PRUNABLE.has(code), errorClass: code });
            }
          }
        } catch (err) {
          // The whole call failed (auth, network): every message in it may be retried.
          const code = errorCode(err);
          for (let k = 0; k < chunk.length; k += 1) out.push({ ok: false, prune: false, errorClass: code });
        }
      }
      return out;
    },
  };
}
