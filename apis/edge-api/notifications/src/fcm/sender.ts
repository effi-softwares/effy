// FCM HTTP v1 sender via firebase-admin. 050-observability-push-foundation (research R1).
//
// firebase-admin mints/refreshes the OAuth2 access token and surfaces the exact
// `messaging/registration-token-not-registered` error the token-pruning rule depends on (FR-018). It
// lives ONLY in this worker (off every user path), so its weight is irrelevant.
//
// ⚠ FAIL-OPEN (FR-027): if the service-account secret is absent, the sender reports `configured=false`
// and the worker no-ops, leaving rows pending until the operator seeds the secret — never a crash.
import { getSecretString } from "@effy/edge-shared";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import type { DevicePlatform } from "@effy/edge-shared";

import { copyFor, dataFor, type NotificationType } from "../worker/copy";

/** The outcome of one send, so the worker knows whether to prune the token. */
export interface SendResult {
  ok: boolean;
  /** True when FCM reports the token is dead (unregistered/invalid) → the worker deletes it. */
  prune: boolean;
  errorClass?: string;
}

export interface Sender {
  configured: boolean;
  /**
   * ⚠ `platform` IS REQUIRED SINCE 059, and its absence was a latent defect rather than an
   * omission. Before 059 this sender ignored the platform entirely and emitted ONE message shape for
   * every token. Given a browser that does not fail — it silently sends a mobile-shaped message,
   * whose `notification` block makes the Firebase SDK render a banner ON TOP OF the one our service
   * worker shows. Two banners for one order, and nothing anywhere reporting a problem.
   */
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
  if (!arn || !projectId) return undefined; // not configured → no-op

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
 * Errors that mean the TOKEN IS DEAD and the row should be deleted (050 FR-018).
 *
 * ⚠ `messaging/invalid-argument` WAS IN THIS SET AND HAS BEEN REMOVED (059). It does not mean the
 * token is dead — it means THE MESSAGE WAS MALFORMED, which is the sender's fault, not the
 * recipient's. Pruning on it deletes a perfectly good registration because of a bug in our own
 * payload, and the failure is self-concealing: the operator re-enables notifications, the next send
 * deletes the row again, and the console reports a healthy `skipped: no_token` drain forever.
 *
 * The cost of being wrong is asymmetric. A dead token left in place is retried and pruned on the
 * next genuine failure; a live token deleted in error can only be recovered by the operator
 * noticing and re-enabling, which is exactly the thing they have no reason to do.
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
                // ⚠ NO `notification` KEY, AND THIS IS THE WHOLE POINT OF THE BRANCH.
                //
                // With one present the Firebase JS SDK displays the message ITSELF, and our service
                // worker displays it too — two identical banners for one event. Omitting it is also
                // what makes everything 059 needs possible at all: `tag` (how twenty orders in a
                // minute become one banner), `data` (how the click knows where to go), the app badge,
                // and the decision NOT to show when the operator is demonstrably already looking.
                //
                // ⚠ It also means we are responsible for always showing something. iOS REVOKES
                // notification permission from a service worker that receives a push and displays
                // nothing, so `src/sw.ts` shows a notification on every push by construction,
                // including on a payload it cannot parse.
                data,
                webpush: {
                  headers: {
                    // A new-order notification that arrives eleven minutes late is worse than one
                    // that never arrives: it tells an operator to hurry for something already picked.
                    TTL: "600",
                    Urgency: "high",
                  },
                },
              }
            : {
                // ⚠ MOBILE IS BYTE-FOR-BYTE WHAT IT WAS BEFORE 059. The mobile send tests pass
                // unmodified, which is the proof this branch changed nothing that already worked.
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
