// The scheduled notifications-drain worker. 050-observability-push-foundation (research R6).
//
// Off every user path. Idempotent (drain.ts + the outbox's dedupe_key/status). Fail-open: an
// unconfigured FCM sender leaves rows pending and returns cleanly (FR-027). A thrown error surfaces to
// the send-failure alarm (Principle VII / T056); the next tick retries.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { createSender } from "../fcm/sender";
import { drainOnce } from "./drain";
import { repositoryDeps } from "./repository";

const MAX_ATTEMPTS = Number(process.env.NOTIF_MAX_ATTEMPTS ?? "5");
const BATCH_SIZE = Number(process.env.NOTIF_BATCH_SIZE ?? "100");

/**
 * Emit a CloudWatch EMF metric on stdout (Principle VII; the same stdout-EMF pattern the 035 auth
 * triggers use — no SDK call, no metric-filter/log-group ordering dependency). CloudWatch auto-extracts
 * `NotificationSendFailed` into the `Effy/Notifications` namespace, which the alarm in notifications.tf
 * pages on. Emitted every run (0 included) so the alarm has a continuous signal.
 */
function emitFailureMetric(failed: number, pruned: number): void {
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
            ],
          },
        ],
      },
      NotificationSendFailed: failed,
      DeviceTokenPruned: pruned,
    }),
  );
}

export const handler: ScheduledHandler = async () => {
  const log = logger.child({ worker: "notification-drain" });
  try {
    const sender = await createSender();
    if (!sender.configured) {
      log.warn("fcm not configured — skipping drain; rows remain pending");
      return;
    }

    const deps = repositoryDeps(
      { send: sender.send, senderConfigured: sender.configured },
      { maxAttempts: MAX_ATTEMPTS, batchSize: BATCH_SIZE },
    );
    const summary = await drainOnce(deps);

    // Structured log for triage + an EMF metric the send-failure alarm pages on (Principle VII).
    log.info({ metric: "notification_drain", ...summary }, "notification drain complete");
    emitFailureMetric(summary.failed, summary.pruned);
    if (summary.failed > 0) {
      log.error({ failed: summary.failed }, "notification sends failed");
    }
  } catch (err) {
    log.error({ err }, "notification drain failed");
    throw err;
  }
};
