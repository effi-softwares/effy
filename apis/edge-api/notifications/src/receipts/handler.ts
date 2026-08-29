// The scheduled RECEIPT-EMAIL drain worker. 052-order-confirmation-invoice, US3.
//
// A sibling of ../worker/handler.ts (the 050 push drain), running on its own schedule against its own
// outbox. Off every user path: the paid transition writes a `receipt_dispatch` row and returns, and
// this sends. An SES call on the payment path would make a payment's success depend on a mail service.
//
// Fail-open: an unconfigured mailer leaves rows pending and returns cleanly. A thrown error surfaces
// to the send-failure alarm; the next tick retries.
import type { ScheduledHandler } from "aws-lambda";

import { logger } from "@effy/edge-shared";

import { drainReceiptsOnce } from "./drain";
import { receiptRepositoryDeps } from "./repository";
import { createReceiptSender } from "./sender";

const MAX_ATTEMPTS = Number(process.env.RECEIPT_MAX_ATTEMPTS ?? "5");
const BATCH_SIZE = Number(process.env.RECEIPT_BATCH_SIZE ?? "50");

/**
 * Emit a CloudWatch EMF metric on stdout — the same stdout-EMF pattern the 050 drain and the 035 auth
 * triggers use (no SDK call, no metric-filter/log-group ordering dependency). Emitted every run, 0
 * included, so the alarm has a continuous signal rather than a gap that reads as health.
 *
 * ⚠ THIS ALARM IS IN SCOPE ON PURPOSE. 038 and 046 each deferred their send-failure alarm with "the
 * service already logs it". A missing receipt is invisible to everyone — the shopper assumes it is
 * coming, and nobody on the platform finds out until they complain. Deferring it a third time would
 * make the exception the rule.
 */
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
    // ⚠ The storefront origin is published by Terraform (042 publishes /effy/<env>/web/site_url). An
    // unset value would put a broken "View your order" link in a receipt, so it degrades to the
    // canonical host rather than to something malformed.
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
