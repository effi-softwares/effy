// Delivery assignment (049 US2, T025). A same-day package is ready for delivery when it has been
// collected AND its collection run was checked in at the hub AND its method is same_day. We group
// such packages by order into DROPS (one drop per order — SC-006, even across shops) and assign the
// current batch to one eligible on-duty driver. Raw SQL, no ORM; idempotent (a package belongs to at
// most one drop via UNIQUE(shop_fulfillment_id)).

import { withTransaction } from "@effy/edge-shared";
import type pg from "pg";

export async function assignDeliveryWork(): Promise<number> {
  return withTransaction(async (tx: pg.PoolClient) => {
    // An eligible driver with no active delivery run.
    const driver = await tx.query<{ id: string }>(
      `SELECT d.id
         FROM public.driver d
         JOIN public.driver_duty_session s ON s.driver_id = d.id AND s.ended_at IS NULL
        WHERE d.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM public.driver_run r
             WHERE r.driver_id = d.id AND r.type = 'same_day_delivery'
               AND r.status IN ('assigned', 'active')
          )
        ORDER BY s.started_at ASC
        LIMIT 1
        FOR UPDATE OF d SKIP LOCKED`,
    );
    const driverId = driver.rows[0]?.id;
    if (!driverId) return 0;

    // Same-day packages checked in at the hub, not yet in any drop.
    const ready = await tx.query<{ id: string; order_id: string }>(
      `SELECT sf.id, sf.order_id
         FROM public.shop_fulfillment sf
         JOIN public.order_package_delivery opd
              ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id AND opd.method = 'same_day'
         JOIN public.collection_task ct ON ct.shop_fulfillment_id = sf.id
         JOIN public.driver_run cr ON cr.id = ct.run_id AND cr.type = 'collection' AND cr.status = 'checked_in'
        WHERE sf.status = 'collected'
          AND NOT EXISTS (SELECT 1 FROM public.delivery_task_package dtp WHERE dtp.shop_fulfillment_id = sf.id)
        ORDER BY sf.order_id
        FOR UPDATE OF sf SKIP LOCKED`,
    );
    if (ready.rowCount === 0) return 0;

    // Group packages by order → one drop per order.
    const byOrder = new Map<string, string[]>();
    for (const p of ready.rows) {
      const list = byOrder.get(p.order_id) ?? [];
      list.push(p.id);
      byOrder.set(p.order_id, list);
    }

    const run = await tx.query<{ id: string }>(
      `INSERT INTO public.driver_run (driver_id, type, status, business_date)
       VALUES ($1, 'same_day_delivery', 'assigned', (now() AT TIME ZONE 'Australia/Melbourne')::date)
       RETURNING id`,
      [driverId],
    );
    const runId = run.rows[0]!.id;

    let seq = 0;
    let drops = 0;
    for (const [orderId, packageIds] of byOrder) {
      // A drop may already exist for this order from a prior partial batch — reuse it, else create.
      let dropId: string;
      const existing = await tx.query<{ id: string }>(
        `SELECT id FROM public.delivery_task WHERE order_id = $1`,
        [orderId],
      );
      if (existing.rows[0]) {
        dropId = existing.rows[0].id;
      } else {
        const created = await tx.query<{ id: string }>(
          `INSERT INTO public.delivery_task (run_id, order_id, sequence, status)
           VALUES ($1, $2, $3, 'staged') RETURNING id`,
          [runId, orderId, seq++],
        );
        dropId = created.rows[0]!.id;
        drops++;
      }
      for (const pkgId of packageIds) {
        await tx.query(
          `INSERT INTO public.delivery_task_package (delivery_task_id, shop_fulfillment_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [dropId, pkgId],
        );
      }
    }

    if (drops === 0) {
      // Everything folded into pre-existing drops on another run; drop the empty run we opened.
      await tx.query(`DELETE FROM public.driver_run WHERE id = $1`, [runId]);
      return 0;
    }

    await tx.query(`INSERT INTO public.driver_task_event (run_id, status) VALUES ($1, 'assigned')`, [runId]);
    await tx.query(
      `INSERT INTO public.driver_activity (driver_id, type, run_id, body)
       VALUES ($1, 'run_assigned', $2, $3)`,
      [driverId, runId, `Same-day delivery run assigned — ${drops} drop(s)`],
    );
    // 050 — push intent: a same-day delivery run is assigned to this driver. Same tx; deduped on run id.
    await tx.query(
      `INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
       SELECT d.cognito_sub, 'driver', 'run_assigned',
              jsonb_build_object('entityId', $2::text, 'deepLink', 'effy://run/' || $2::text),
              'run_assigned:' || d.cognito_sub || ':' || $2::text
         FROM public.driver d WHERE d.id = $1
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [driverId, runId],
    );
    return drops;
  });
}
