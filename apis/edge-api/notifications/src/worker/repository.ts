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
  /** An assertion, not a check: see `isKnownNotificationType`. */
  type: string;
  payload: { entityId?: string } | null;
  attempts: number;
  channel: PendingRequest["channel"];
  recipient_email: string | null;
}

/** For UPDATE skip locked, so overlapping invocations never claim the same row. */
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
    // Unknown types are filtered, not cast: they stay pending for the deploy that knows them, instead
    // of throwing inside the claim window and killing the drain.
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

export function repositoryDeps(
  sender: Pick<DrainDeps, "send" | "senderConfigured" | "sendEmail" | "log">,
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
