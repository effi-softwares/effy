// FCM HTTP v1 via firebase-admin, which mints the OAuth token and reports dead tokens. Fails open: with
// no service-account secret, `configured` is false and rows stay pending.
import { getSecretString } from "@effy/edge-shared";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import type { DevicePlatform } from "@effy/edge-shared";

import { copyFor, dataFor, type NotificationType } from "../worker/copy";

export interface SendResult {
  ok: boolean;
  /** FCM says the token is dead, so the worker deletes it. */
  prune: boolean;
  errorClass?: string;
}

export interface Sender {
  configured: boolean;
  /** Web and mobile need different message shapes (see the web branch below). */
  send(
    fcmToken: string,
    type: NotificationType,
    entityId: string,
    platform: DevicePlatform,
  ): Promise<SendResult>;
}

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
 * Errors that mean the token is dead. Not `messaging/invalid-argument`: that is a malformed message
 * (our fault), and pruning on it silently deletes working registrations.
 */
const PRUNABLE = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export async function createSender(): Promise<Sender> {
  const app = await firebaseApp();
  if (!app)
    return {
      configured: false,
      async send() {
        return { ok: false, prune: false };
      },
    };

  const messaging = getMessaging(app);
  return {
    configured: true,
    async send(fcmToken, type, entityId, platform): Promise<SendResult> {
      const c = copyFor(type);
      const data = dataFor(type, entityId);
      try {
        await messaging.send(
          platform === "web"
            ? {
                token: fcmToken,
                // No `notification` key: with one, the Firebase SDK shows a second banner, and `tag`, `data` and the
                // badge could not be used. Our service worker must therefore show something on every push, or iOS
                // revokes the permission (`src/sw.ts` does).
                data,
                webpush: {
                  headers: {
                    // A new-order push eleven minutes late is worse than none.
                    TTL: "600",
                    Urgency: "high",
                  },
                },
              }
            : {
                token: fcmToken,
                notification: { title: c.title, body: c.body },
                data,
                android: { priority: "high" },
                apns: {
                  headers: { "apns-priority": "10" },
                  payload: { aps: { sound: "default" } },
                },
              },
        );
        return { ok: true, prune: false };
      } catch (err) {
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code: unknown }).code)
            : "unknown";
        return { ok: false, prune: PRUNABLE.has(code), errorClass: code };
      }
    },
  };
}
