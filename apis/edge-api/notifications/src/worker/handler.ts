// The scheduled notifications drain. Idempotent and fail-open; thrown errors reach the alarm.
//
// 109: sends public.notification_delivery in batches until about 15 s of the run are left.
import type { Context, ScheduledHandler } from "aws-lambda";

import { logger, pooled } from "@effy/edge-shared";
import { isKnownNotificationType } from "@effy/edge-shared/notifications";

import { createSender, type SendResult } from "../fcm/sender";
import { drainOnce } from "./drain";
import { createEmailSender } from "./email-sender";
import { inBatch, pendingStats } from "./repository";

const MAX_ATTEMPTS = Number(process.env.NOTIF_MAX_ATTEMPTS ?? "5");
const BATCH_SIZE = Number(process.env.NOTIF_BATCH_SIZE ?? "500");
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

    log.info({ metric: "notification_drain", ...summary, backlog }, "notification drain complete");
    // The `NotificationSendFailed` alarm's series, emitted every run including 0.
    emf([[]], {
      NotificationSendFailed: summary.failed,
      DeviceTokenPruned: summary.pruned,
      NotificationEmailSendFailed: summary.emailFailed,
      NotificationEmailSent: summary.emailSent,
      NotificationExpired: summary.expired,
      NotificationDeliveriesPending: backlog.pending,
      NotificationOldestPendingSeconds: backlog.oldestSeconds,
    });
    // Push outcomes per platform, as a separate record so the undimensioned alarm keeps its series. Not alarmed.
    const byPlatform: Record<string, { sent: number; failed: number }> = {};
    for (const [platform, c] of Object.entries(summary.byPlatform)) {
      const p = (byPlatform[platform] ??= { sent: 0, failed: 0 });
      p.sent += c.sent;
      p.failed += c.failed;
    }
    for (const [platform, c] of Object.entries(byPlatform)) {
      emf([["platform"]], { PushSentByPlatform: c.sent, PushFailedByPlatform: c.failed }, { platform });
    }
    if (summary.failed > 0) {
      log.error({ failed: summary.failed, emailFailed: summary.emailFailed }, "notification sends failed");
    }
  } catch (err) {
    log.error({ err }, "notification drain failed");
    throw err;
  }
};
