// What the daily purge removes (109 FR-023 to FR-025). The only deleter of notifications and deliveries
// (notifications.guard.test.ts), and of an erased customer's notification choices and consent history (111;
// preferences.guard.test.ts). Batched, so one run never holds a long lock on a large table.
//
// 112: before a back-office message's recipients' rows can go, its report is frozen on the message (R15), and an
// erased customer's id is taken out of every message they were chosen for by hand.
import type { Queryable } from "@effy/edge-shared";
import { messageReport } from "@effy/edge-shared/notifications";

export const RETENTION_DAYS = { customer: 180, driver: 90, shop: 90 } as const;
export const DELIVERY_RETENTION_DAYS = 30;
export const PURGE_BATCH = 5_000;

export interface PurgeSummary {
  notifications: number;
  deliveries: number;
  erased: number;
  /** Choice and consent rows of customers past their erasure date (111). */
  preferencesErased: number;
  /** Message reports made final before their rows go (112). */
  reportsFrozen: number;
}

/** A message sent this long ago has its numbers frozen: deliveries go at 30 days. */
export const REPORT_FREEZE_DAYS = 29;

/** Freezes the report of every message whose sending began REPORT_FREEZE_DAYS or more ago and isn't frozen yet. */
export async function freezeReports(db: Queryable, iso: string, deadline: number, now: () => number): Promise<number> {
  const due = (await db.query<{ id: string }>(
    `SELECT m.id::text AS id FROM public.message m
      WHERE m.status IN ('sent', 'stopped', 'withdrawn', 'sending')
        AND COALESCE(m.send_at, m.created_at) <= $1::timestamptz - make_interval(days => $2)
        AND EXISTS (SELECT 1 FROM public.message_audience ma WHERE ma.message_id = m.id AND ma.report IS NULL)
      ORDER BY m.send_at LIMIT 100`,
    [iso, REPORT_FREEZE_DAYS],
  )).rows;
  let frozen = 0;
  for (const { id } of due) {
    if (now() >= deadline) break;
    const report = await messageReport(db, id);
    for (const [audience, r] of Object.entries(report.byAudience)) {
      await db.query(
        `UPDATE public.message_audience SET report = $3::jsonb, report_frozen_at = now()
          WHERE message_id = $1 AND audience = $2 AND report IS NULL`,
        [id, audience, JSON.stringify(r)],
      );
    }
    frozen += 1;
  }
  return frozen;
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
  // First, so no report loses a row it hasn't counted (112 R15).
  const reportsFrozen = await freezeReports(db, iso, deadline, now);
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

  // Their choices and every consent answer go too (111): a few rows per customer, so one statement each.
  const closedPastErasure = `SELECT r.customer_id FROM public.customer_closure_request r
                              WHERE r.cancelled_at IS NULL AND r.erase_after <= $1::timestamptz`;
  const choices = await db.query(
    `DELETE FROM public.customer_notification_choice WHERE customer_id IN (${closedPastErasure})`,
    [iso],
  );
  const consent = await db.query(
    `DELETE FROM public.customer_marketing_consent WHERE customer_id IN (${closedPastErasure})`,
    [iso],
  );
  const preferencesErased = (choices.rowCount ?? 0) + (consent.rowCount ?? 0);

  // A message a customer was chosen for by hand keeps no trace of them once they are erased (112).
  await db.query(
    `UPDATE public.message_audience ma
        SET filter = jsonb_set(ma.filter, '{people}',
              COALESCE((SELECT jsonb_agg(p) FROM jsonb_array_elements_text(ma.filter->'people') p
                         WHERE p::uuid NOT IN (${closedPastErasure})), '[]'::jsonb))
      WHERE ma.audience = 'customer' AND ma.filter ? 'people'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(ma.filter->'people') p WHERE p::uuid IN (${closedPastErasure}))`,
    [iso],
  );

  return { notifications, deliveries, erased, preferencesErased, reportsFrozen };
}
