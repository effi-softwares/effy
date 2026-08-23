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
  send(fcmToken: string, type: NotificationType, entityId: string): Promise<SendResult>;
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

/** Errors that mean the token is dead and should be pruned (FR-018). */
const PRUNABLE = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export async function createSender(): Promise<Sender> {
  const app = await firebaseApp();
  if (!app) return { configured: false, async send() {return { ok: false, prune: false };} };

  const messaging = getMessaging(app);
  return {
    configured: true,
    async send(fcmToken, type, entityId): Promise<SendResult> {
      const c = copyFor(type);
      try {
        await messaging.send({
          token: fcmToken,
          notification: { title: c.title, body: c.body },
          data: dataFor(type, entityId),
          android: { priority: "high" },
          apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
        });
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
