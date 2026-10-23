// The scheduled notifications drain. Idempotent and fail-open; thrown errors reach the alarm.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { createSender } from "../fcm/sender";
import { drainOnce } from "./drain";
import { createEmailSender } from "./email-sender";
import { repositoryDeps } from "./repository";

const MAX_ATTEMPTS = Number(process.env.NOTIF_MAX_ATTEMPTS ?? "5");
const BATCH_SIZE = Number(process.env.NOTIF_BATCH_SIZE ?? "100");

/** EMF for the `NotificationSendFailed` alarm, emitted every run including 0. */
function emitFailureMetric(
  failed: number,
  pruned: number,
  emailFailed = 0,
  emailSent = 0,
): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Notifications",
            Dimensions: [[]],
            Metrics: [
              { Name: "NotificationSendFailed", Unit: "Count" },
              { Name: "DeviceTokenPruned", Unit: "Count" },
              // Split so the alarm says which channel broke.
              { Name: "NotificationEmailSendFailed", Unit: "Count" },
              { Name: "NotificationEmailSent", Unit: "Count" },
            ],
          },
        ],
      },
      NotificationSendFailed: failed,
      DeviceTokenPruned: pruned,
      NotificationEmailSendFailed: emailFailed,
      NotificationEmailSent: emailSent,
    }),
  );
}

/**
 * Push outcomes per platform (android | ios | web), as a separate record so the undimensioned alarm
 * keeps its series. Not alarmed: browser subscriptions expire normally.
 */
function emitPlatformMetrics(byPlatform: Record<string, { sent: number; failed: number }>): void {
  for (const [platform, counts] of Object.entries(byPlatform)) {
    console.log(
      JSON.stringify({
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: "Effy/Notifications",
              Dimensions: [["platform"]],
              Metrics: [
                { Name: "PushSentByPlatform", Unit: "Count" },
                { Name: "PushFailedByPlatform", Unit: "Count" },
              ],
            },
          ],
        },
        platform,
        PushSentByPlatform: counts.sent,
        PushFailedByPlatform: counts.failed,
      }),
    );
  }
}

export const handler: ScheduledHandler = async () => {
  const log = logger.child({ worker: "notification-drain" });
  try {
    const sender = await createSender();
    if (!sender.configured) {
      log.warn("fcm not configured — push rows remain pending; email still drains");
    }

    const emailSender = createEmailSender({ siteUrl: process.env.WEB_SITE_URL ?? "" });
    if (!emailSender.mailerConfigured) {
      log.warn("mail not configured — email rows will retry");
    }

    const deps = repositoryDeps(
      {
        send: sender.send,
        senderConfigured: sender.configured,
        sendEmail: emailSender.send,
        log,
      },
      { maxAttempts: MAX_ATTEMPTS, batchSize: BATCH_SIZE },
    );
    const summary = await drainOnce(deps);

    log.info({ metric: "notification_drain", ...summary }, "notification drain complete");
    emitFailureMetric(summary.failed, summary.pruned, summary.emailFailed, summary.emailSent);
    emitPlatformMetrics(summary.byPlatform);
    if (summary.failed > 0) {
      log.error(
        { failed: summary.failed, emailFailed: summary.emailFailed },
        "notification sends failed",
      );
    }
  } catch (err) {
    log.error({ err }, "notification drain failed");
    throw err;
  }
};
