// The scheduled notifications drain. Idempotent and fail-open; thrown errors reach the alarm.
//
// 109: the legacy drain empties public.notification_request (nothing writes it any more) and then the delivery drain
// sends public.notification_delivery in batches until about 15 s of the run are left.
import type { Context, ScheduledHandler } from "aws-lambda";

import { logger, pooled } from "@effy/edge-shared";
import { catalogueEntry, destinationFor, isKnownNotificationType, type NotificationType } from "@effy/edge-shared/notifications";
import { serializeDestination } from "@effy/shared-types";

import { createSender, type PushMessage, type SendResult } from "../fcm/sender";
import { drainOnce } from "./drain";
import { createEmailSender } from "./email-sender";
import { drainOnce as drainLegacyOnce } from "./legacy/drain";
import { repositoryDeps as legacyDeps } from "./legacy/repository";
import { inBatch, pendingStats } from "./repository";

const MAX_ATTEMPTS = Number(process.env.NOTIF_MAX_ATTEMPTS ?? "5");
const BATCH_SIZE = Number(process.env.NOTIF_BATCH_SIZE ?? "500");
const LEGACY_BATCH_SIZE = 100;
/** Stop claiming new batches this long before the Lambda's own timeout. */
const RESERVE_MS = 15_000;

function emf(dimensions: string[][], metrics: Record<string, number>, extra: Record<string, string> = {}): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Notifications",
            Dimensions: dimensions,
            Metrics: Object.keys(metrics).map((Name) => ({ Name, Unit: Name.endsWith("Seconds") ? "Seconds" : "Count" })),
          },
        ],
      },
      ...extra,
      ...metrics,
    }),
  );
}

/** A legacy row has no notification behind it: words and destination come from today's catalogue. */
function legacyMessage(token: string, platform: PushMessage["platform"], type: NotificationType, entityId: string): PushMessage {
  const e = catalogueEntry(type);
  let destination: string;
  try {
    destination = serializeDestination(destinationFor(type, { entityId }));
  } catch {
    // An old row whose entity is not the order (a consignment, a move): the orders list, Today or the queue.
    destination = JSON.stringify(e.audience === "customer" ? { kind: "orders" } : e.audience === "driver" ? { kind: "today" } : { kind: "queue" });
  }
  return { token, platform, type, notificationId: "", title: e.title, body: e.body, destination, tag: e.tag, group: e.group };
}

export const handler: ScheduledHandler = async (_event, context?: Context) => {
  const log = logger.child({ worker: "notification-drain" });
  const started = Date.now();
  const remaining = typeof context?.getRemainingTimeInMillis === "function" ? context.getRemainingTimeInMillis() : 60_000;
  try {
    const sender = await createSender();
    if (!sender.configured) log.warn("fcm not configured - push deliveries remain pending; email still drains");

    const emailSender = createEmailSender({ siteUrl: process.env.WEB_SITE_URL ?? "" });
    if (!emailSender.mailerConfigured) log.warn("mail not configured - email deliveries will retry");
    const sendEmail = (to: string, type: string, entityId: string): Promise<SendResult> =>
      isKnownNotificationType(type)
        ? emailSender.send(to, type, entityId)
        : Promise.resolve({ ok: false, prune: false, errorClass: "unknown_type" });

    // Legacy rows first (one bounded batch); they are few and stop appearing once every writer is deployed.
    const legacy = await drainLegacyOnce(
      legacyDeps(
        {
          send: async (token, type, entityId, platform) => (await sender.sendEach([legacyMessage(token, platform, type, entityId)]))[0]!,
          senderConfigured: sender.configured,
          sendEmail: emailSender.send,
          log,
        },
        { maxAttempts: MAX_ATTEMPTS, batchSize: LEGACY_BATCH_SIZE },
      ),
    );

    const summary = await drainOnce({
      senderConfigured: sender.configured,
      maxAttempts: MAX_ATTEMPTS,
      batchSize: BATCH_SIZE,
      deadline: started + remaining - RESERVE_MS,
      now: () => Date.now(),
      inBatch,
      sendEach: (messages) => sender.sendEach(messages),
      sendEmail,
      log,
    });
    const backlog = await pendingStats(pooled);

    log.info({ metric: "notification_drain", ...summary, legacy, backlog }, "notification drain complete");
    // The `NotificationSendFailed` alarm's series, emitted every run including 0.
    emf([[]], {
      NotificationSendFailed: summary.failed + legacy.failed,
      DeviceTokenPruned: summary.pruned + legacy.pruned,
      NotificationEmailSendFailed: summary.emailFailed + legacy.emailFailed,
      NotificationEmailSent: summary.emailSent + legacy.emailSent,
      NotificationExpired: summary.expired,
      NotificationDeliveriesPending: backlog.pending,
      NotificationOldestPendingSeconds: backlog.oldestSeconds,
    });
    // Push outcomes per platform, as a separate record so the undimensioned alarm keeps its series. Not alarmed.
    const byPlatform: Record<string, { sent: number; failed: number }> = { ...legacy.byPlatform };
    for (const [platform, c] of Object.entries(summary.byPlatform)) {
      const p = (byPlatform[platform] ??= { sent: 0, failed: 0 });
      p.sent += c.sent;
      p.failed += c.failed;
    }
    for (const [platform, c] of Object.entries(byPlatform)) {
      emf([["platform"]], { PushSentByPlatform: c.sent, PushFailedByPlatform: c.failed }, { platform });
    }
    if (summary.failed + legacy.failed > 0) {
      log.error({ failed: summary.failed + legacy.failed, emailFailed: summary.emailFailed + legacy.emailFailed }, "notification sends failed");
    }
  } catch (err) {
    log.error({ err }, "notification drain failed");
    throw err;
  }
};
