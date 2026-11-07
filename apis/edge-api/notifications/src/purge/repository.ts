// What the daily purge removes (109 FR-023 to FR-025). The only deleter of notifications and deliveries
// (notifications.guard.test.ts). Batched, so one run never holds a long lock on a large table.
import type { Queryable } from "@effy/edge-shared";

export const RETENTION_DAYS = { customer: 180, driver: 90, shop: 90 } as const;
export const DELIVERY_RETENTION_DAYS = 30;
export const PURGE_BATCH = 5_000;

export interface PurgeSummary {
  notifications: number;
  deliveries: number;
  erased: number;
  legacy: number;
}

/** Repeats `statement` (which deletes at most PURGE_BATCH rows) until it deletes fewer, or the deadline passes. */
async function inBatches(db: Queryable, statement: string, params: unknown[], deadline: number, now: () => number): Promise<number> {
  let total = 0;
  for (;;) {
    const res = await db.query(statement, params);
    const n = res.rowCount ?? 0;
    total += n;
    if (n < PURGE_BATCH || now() >= deadline) return total;
  }
}

export async function purge(db: Queryable, at: Date, deadline: number, now: () => number = Date.now): Promise<PurgeSummary> {
  const iso = at.toISOString();
  let notifications = 0;
  for (const [audience, days] of Object.entries(RETENTION_DAYS)) {
    // The deliveries go with them (ON DELETE CASCADE).
    notifications += await inBatches(
      db,
      `DELETE FROM public.notification
        WHERE id IN (SELECT id FROM public.notification
                      WHERE audience = $1 AND created_at < $2::timestamptz - make_interval(days => $3)
                      LIMIT ${PURGE_BATCH})`,
      [audience, iso, days],
      deadline,
      now,
    );
  }

  const deliveries = await inBatches(
    db,
    `DELETE FROM public.notification_delivery
      WHERE id IN (SELECT id FROM public.notification_delivery
                    WHERE created_at < $1::timestamptz - make_interval(days => $2)
                    LIMIT ${PURGE_BATCH})`,
    [iso, DELIVERY_RETENTION_DAYS],
    deadline,
    now,
  );

  // A customer whose account closure has passed its erasure date (and was not cancelled) leaves no notification.
  const erased = await inBatches(
    db,
    `DELETE FROM public.notification
      WHERE id IN (SELECT n.id
                     FROM public.notification n
                     JOIN public.customer c ON c.cognito_sub = n.recipient_sub
                     JOIN public.customer_closure_request r ON r.customer_id = c.id
                    WHERE n.audience = 'customer'
                      AND r.cancelled_at IS NULL
                      AND r.erase_after <= $1::timestamptz
                    LIMIT ${PURGE_BATCH})`,
    [iso],
    deadline,
    now,
  );

  // LEGACY until Stage B: the old outbox, which nothing writes any more.
  const legacy = await inBatches(
    db,
    `DELETE FROM public.notification_request
      WHERE id IN (SELECT id FROM public.notification_request
                    WHERE created_at < $1::timestamptz - make_interval(days => $2)
                    LIMIT ${PURGE_BATCH})`,
    [iso, DELIVERY_RETENTION_DAYS],
    deadline,
    now,
  );

  return { notifications, deliveries, erased, legacy };
}
