// The real drain dependencies over Postgres. Raw SQL, no ORM (Principle VI).
// 050-observability-push-foundation.
import {
  query,
  tokensForRecipient,
  pruneToken,
  withTransaction,
} from "@effy/edge-shared";

import type { DrainDeps, PendingRequest } from "./drain";
import { isKnownNotificationType, type NotificationType } from "./copy";

interface PendingRow {
  id: string;
  recipient_sub: string;
  audience: PendingRequest["audience"];
  /**
   * ⚠ `text` IN THE DATABASE, AND THIS DECLARATION IS AN ASSERTION, NOT A CHECK. Nothing verifies
   * that a claimed row's type is one this build knows — see `isKnownNotificationType`, which 059's
   * reader audit added for exactly this line.
   */
  type: string;
  payload: { entityId?: string } | null;
  attempts: number;
  channel: PendingRequest["channel"];
  recipient_email: string | null;
}

/**
 * Claim up to `limit` pending rows. FOR UPDATE SKIP LOCKED so concurrent worker invocations never
 * claim the same row (safe under overlap), inside one transaction that commits the claim window.
 */
async function claimPending(limit: number): Promise<PendingRequest[]> {
  return withTransaction(async (tx) => {
    const res = await tx.query<PendingRow>(
      `SELECT id, recipient_sub, audience, type, payload, attempts, channel, recipient_email
         FROM public.notification_request
        WHERE status = 'pending'
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    // ⚠ FILTERED, NOT CAST. A row whose type this build does not know is left `pending` for the
    // deploy that does know it, rather than claimed and thrown on. Throwing here would not skip one
    // row — an exception inside the claim window kills the whole drain, and with it every other
    // audience's notifications (053's "an unconfigured FCM halted the whole drain", by another
    // road). The mandated deploy order makes this window empty; this makes it survivable.
    //
    // ⚠ The rows are still CLAIMED by the SELECT ... FOR UPDATE, but the transaction commits without
    // marking them, so they remain pending and are picked up by a later invocation.
    return res.rows
      .filter((r) => isKnownNotificationType(r.type))
      .map((r) => ({
        id: r.id,
        recipientSub: r.recipient_sub,
        audience: r.audience,
        type: r.type as NotificationType,
        entityId:
          typeof r.payload?.entityId === "string" ? r.payload.entityId : "",
        attempts: r.attempts,
        // Rows written before 053 have no channel of their own; the column defaults to 'push', which
        // is exactly what they were.
        channel: r.channel ?? "push",
        recipientEmail: r.recipient_email,
      }));
  });
}

async function markSent(id: string): Promise<void> {
  await query(
    `UPDATE public.notification_request SET status='sent', processed_at=now() WHERE id=$1`,
    [id],
  );
}

async function markSkipped(id: string, reason: string): Promise<void> {
  await query(
    `UPDATE public.notification_request SET status='skipped', last_error=$2, processed_at=now() WHERE id=$1`,
    [id, reason],
  );
}

async function markRetry(id: string, error: string): Promise<void> {
  await query(
    `UPDATE public.notification_request SET attempts=attempts+1, last_error=$2 WHERE id=$1`,
    [id, error],
  );
}

async function markFailed(id: string, error: string): Promise<void> {
  await query(
    `UPDATE public.notification_request SET status='failed', attempts=attempts+1, last_error=$2, processed_at=now() WHERE id=$1`,
    [id, error],
  );
}

/** Build the DB-backed drain deps around an injected sender (so the handler wires FCM in). */
export function repositoryDeps(
  sender: Pick<DrainDeps, "send" | "senderConfigured" | "sendEmail">,
  opts: { maxAttempts: number; batchSize: number },
): DrainDeps {
  return {
    senderConfigured: sender.senderConfigured,
    maxAttempts: opts.maxAttempts,
    batchSize: opts.batchSize,
    claimPending,
    resolveTokens: (sub, audience) => tokensForRecipient(sub, audience),
    send: sender.send,
    sendEmail: sender.sendEmail,
    markSent,
    markSkipped,
    markRetry,
    markFailed,
    pruneToken,
  };
}
