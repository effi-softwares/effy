// Pure drain orchestration for the RECEIPT EMAIL outbox — the decision logic, dependency-injected so
// it is unit-testable with fakes (no DB, no SES). 052-order-confirmation-invoice, US3.
//
// ⚠ A DELIBERATE SIBLING OF ../worker/drain.ts, NOT A REUSE OF IT. The mechanics are the same
// (claim → act → mark, with an attempt cap and a fail-open posture) but the two outboxes differ in
// ways that matter: push is exactly-once per (type, recipient, entity) and can never be re-sent on
// purpose, while a receipt CAN — a resend is a first-class feature (FR-027). Research R2 records why
// `notification_request` could not carry this.

/** One claimed row from `public.receipt_dispatch`. */
export interface PendingReceipt {
  id: string;
  orderId: string;
  /** ⚠ The address SNAPSHOTTED at enqueue time — never re-resolved here (data-model §2). */
  recipient: string;
  reason: "order_paid" | "customer_request";
  attempts: number;
}

/** What the mailer reports back. `messageId` joins to `email_delivery_event` (037). */
export interface ReceiptSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface ReceiptDrainDeps {
  /** False when mail is not configured — the worker then does nothing at all (see below). */
  mailerConfigured: boolean;
  maxAttempts: number;
  batchSize: number;
  claimPending(limit: number): Promise<PendingReceipt[]>;
  /**
   * Render + send one receipt. Returns `null` when the order can no longer be read — an order that
   * vanished is not a failure to retry forever.
   */
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

/**
 * Drain one batch.
 *
 * ⚠ IDEMPOTENT BY CONSTRUCTION, not by remembering. Rows are claimed `FOR UPDATE SKIP LOCKED` (the
 * repository) and only `pending` rows are ever claimed, so a re-run never re-sends a row that already
 * reached `sent`, `skipped` or `failed`. Two overlapping invocations cannot claim the same row.
 */
export async function drainReceiptsOnce(deps: ReceiptDrainDeps): Promise<ReceiptDrainSummary> {
  const s: ReceiptDrainSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    disabled: false,
  };

  // ⚠ FAIL-OPEN: not configured → leave EVERYTHING pending and do nothing (050 FR-027's posture).
  // The alternative — marking rows failed because this deployment lacks a mail identity — would burn
  // the attempt budget on a misconfiguration and lose receipts that were never actually attempted.
  if (!deps.mailerConfigured) {
    s.disabled = true;
    return s;
  }

  const batch = await deps.claimPending(deps.batchSize);
  s.claimed = batch.length;

  for (const req of batch) {
    // No address on the account. A VALID OUTCOME, not a failure — the 050 `no_token` precedent. There
    // is nothing to retry and nothing broken; the row records why nothing was sent.
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

    // ⚠ The order could not be read. Retrying forever would not help, and the row must not sit
    // `pending` for eternity making the queue look permanently backed up.
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
