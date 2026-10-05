import type { Queryable } from "../lib/db";

/** A domain event as it is recorded for later delivery. */
export interface EventEnvelope {
  eventType: string;
  /** Makes the append exactly-once: a second append with the same key inserts nothing. */
  dedupKey: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

/**
 * Record a domain event in the SAME transaction as the fact it announces (the outbox pattern): the
 * event exists if and only if the fact was committed.
 *
 * ⚠ KNOWN GAP, CARRIED OVER DELIBERATELY (070 FR-026): nothing drains `event_outbox` yet. The row is
 * written so that the day a drain exists, every order placed since is there to deliver. Do not read
 * the presence of this table as evidence that the event reaches anyone.
 */
export async function appendEvent(tx: Queryable, e: EventEnvelope): Promise<void> {
  await tx.query(
    `
INSERT INTO public.event_outbox (event_type, dedup_key, aggregate_type, aggregate_id, payload)
VALUES ($1, $2, $3, $4, $5::jsonb)
ON CONFLICT (dedup_key) DO NOTHING`,
    [e.eventType, e.dedupKey, e.aggregateType, e.aggregateId, JSON.stringify(e.payload)],
  );
}

/** A push-notification intent for the notifications worker to deliver. */
export interface NotificationRequest {
  recipientSub: string;
  audience: "customer" | "shop" | "driver";
  type: string;
  /** orderId | fulfillmentId | runId */
  entityId: string;
  /** Where a tap lands — `effy://order/<id>`. */
  deepLink: string;
}

/**
 * Enqueue a notification in the caller's transaction. Exactly-once by its dedupe key. The payload
 * carries routing ids only — no name, address or amount (050 FR-021).
 */
export async function appendNotification(tx: Queryable, r: NotificationRequest): Promise<void> {
  await tx.query(
    `
INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
VALUES ($1, $2, $3, $4::jsonb, $5)
ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      r.recipientSub, r.audience, r.type,
      JSON.stringify({ entityId: r.entityId, deepLink: r.deepLink }),
      `${r.type}:${r.recipientSub}:${r.entityId}`,
    ],
  );
}
