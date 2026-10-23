// The receipt outbox drain. A sibling of../worker/drain.ts rather than a reuse: push is exactly-once,
// while a receipt can be re-sent on purpose.

export interface PendingReceipt {
  id: string;
  orderId: string;
  /** Snapshotted at enqueue time, never re-resolved. */
  recipient: string;
  reason: "order_paid" | "customer_request";
  attempts: number;
}

/** `messageId` joins to `email_delivery_event`. */
export interface ReceiptSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface ReceiptDrainDeps {
  /** False when mail is not configured; the worker then does nothing. */
  mailerConfigured: boolean;
  maxAttempts: number;
  batchSize: number;
  claimPending(limit: number): Promise<PendingReceipt[]>;
  /** `null` when the order can no longer be read: not a failure to retry. */
  send(req: PendingReceipt): Promise<ReceiptSendResult | null>;
  markSent(id: string, messageId: string | undefined): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markRetry(id: string, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export interface ReceiptDrainSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  disabled: boolean;
}

/** Rows are claimed `FOR UPDATE SKIP LOCKED` and only when pending, so a re-run never re-sends. */
export async function drainReceiptsOnce(deps: ReceiptDrainDeps): Promise<ReceiptDrainSummary> {
  const s: ReceiptDrainSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    disabled: false,
  };

  // Fail open: not configured leaves everything pending, so no attempts are burnt.
  if (!deps.mailerConfigured) {
    s.disabled = true;
    return s;
  }

  const batch = await deps.claimPending(deps.batchSize);
  s.claimed = batch.length;

  for (const req of batch) {
    // No address on the account: a valid outcome, recorded.
    if (!req.recipient) {
      await deps.markSkipped(req.id, "no_recipient");
      s.skipped += 1;
      continue;
    }

    let result: ReceiptSendResult | null;
    try {
      result = await deps.send(req);
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : "unknown" };
    }

    // The order cannot be read; retrying forever would not help.
    if (result === null) {
      await deps.markSkipped(req.id, "order_unavailable");
      s.skipped += 1;
      continue;
    }

    if (result.ok) {
      await deps.markSent(req.id, result.messageId);
      s.sent += 1;
      continue;
    }

    const error = result.error ?? "unknown";
    if (req.attempts + 1 >= deps.maxAttempts) {
      await deps.markFailed(req.id, error);
      s.failed += 1;
    } else {
      await deps.markRetry(req.id, error);
      s.retried += 1;
    }
  }

  return s;
}
