// The scheduled receipt drain. The paid transition only writes a `receipt_dispatch` row, so a
// payment never depends on the mail service. Fails open when unconfigured.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { drainReceiptsOnce } from "./drain";
import { receiptRepositoryDeps } from "./repository";
import { createReceiptSender } from "./sender";

const MAX_ATTEMPTS = Number(process.env.RECEIPT_MAX_ATTEMPTS ?? "5");
const BATCH_SIZE = Number(process.env.RECEIPT_BATCH_SIZE ?? "50");

/** EMF metric, emitted every run including 0, so the alarm has a continuous signal. */
function emitFailureMetric(failed: number, skipped: number): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Effy/Notifications",
            Dimensions: [[]],
            Metrics: [
              { Name: "ReceiptSendFailed", Unit: "Count" },
              { Name: "ReceiptSkipped", Unit: "Count" },
            ],
          },
        ],
      },
      ReceiptSendFailed: failed,
      ReceiptSkipped: skipped,
    }),
  );
}

export const handler: ScheduledHandler = async () => {
  const log = logger.child({ worker: "receipt-drain" });
  try {
    // Falls back to the canonical host rather than a broken link.
    const siteUrl = process.env.WEB_SITE_URL || "https://effyshopping.com";

    const sender = createReceiptSender({ siteUrl });
    if (!sender.mailerConfigured) {
      log.warn("mail not configured — skipping receipt drain; rows remain pending");
      return;
    }

    const deps = receiptRepositoryDeps(
      { send: sender.send, mailerConfigured: sender.mailerConfigured },
      { maxAttempts: MAX_ATTEMPTS, batchSize: BATCH_SIZE },
    );
    const summary = await drainReceiptsOnce(deps);

    log.info({ metric: "receipt_drain", ...summary }, "receipt drain complete");
    emitFailureMetric(summary.failed, summary.skipped);
    if (summary.failed > 0) {
      log.error({ failed: summary.failed }, "receipt sends failed");
    }
  } catch (err) {
    log.error({ err }, "receipt drain failed");
    throw err;
  }
};
