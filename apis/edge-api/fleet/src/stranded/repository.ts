// Stranded work (056 US2/US4): work claimed by a driver who can no longer do it.
//
// ⚠ DERIVED ON READ, NEVER STORED (027's counted-not-stored rule, third application after 028's
// exhaustion count and 055's refund proposals). A stored `is_stranded` flag and the task rows can
// disagree, and then nobody knows which is true.
//
// ⚠ WHY THIS STATE EXISTS AT ALL. `releaseIneligibleWork`
// (apis/edge-api/driver/src/assignment/repository.ts) automatically returns an ineligible driver's
// work to the pool — but ONLY work not yet physically started: `assigned`/`en_route` collection tasks
// and `staged` drops. Its comment says why, and it is right: "In-progress steps are NEVER yanked."
// The packages are in a van; deleting the task would make the platform forget goods that exist.
//
// The gap is that nothing told a human. `collection_task_package_uq UNIQUE(shop_fulfillment_id)`
// keeps those packages claimed and the sweep's `NOT EXISTS` skips them, so they are unreachable by
// any automatic path — permanently, silently, with an order attached to each one.
import { query, withTransaction } from "@effy/edge-shared";
import type { StrandedWork } from "@effy/shared-types";
import type pg from "pg";

import { DRIVER_INELIGIBLE } from "../drivers/sql";

interface StrandedRow {
  kind: "collection" | "delivery";
  task_id: string;
  task_status: string;
  driver_id: string;
  driver_name: string;
  driver_status: StrandedWork["driverStatus"];
  order_id: string;
  order_reference: string;
  location: string | null;
  since: Date;
}

const SELECT = `
  SELECT 'collection'::text AS kind,
         ct.id              AS task_id,
         ct.status          AS task_status,
         d.id               AS driver_id,
         d.name             AS driver_name,
         d.status           AS driver_status,
         sf.order_id,
         o.order_number     AS order_reference,
         sh.name            AS location,
         r.assigned_at      AS since
    FROM public.collection_task ct
    JOIN public.driver_run r        ON r.id = ct.run_id
    JOIN public.driver d            ON d.id = r.driver_id
    JOIN public.shop_fulfillment sf ON sf.id = ct.shop_fulfillment_id
    LEFT JOIN public."order" o      ON o.id = sf.order_id
    LEFT JOIN public.shop sh        ON sh.id = ct.shop_id
   WHERE ct.status IN ('collected', 'short')
     AND r.status NOT IN ('completed', 'cancelled')
     AND ${DRIVER_INELIGIBLE}
   UNION ALL
  SELECT 'delivery'::text,
         dt.id,
         dt.status,
         d.id,
         d.name,
         d.status,
         dt.order_id,
         o.order_number,
         ca.city,
         r.assigned_at
    FROM public.delivery_task dt
    JOIN public.driver_run r  ON r.id = dt.run_id
    JOIN public.driver d      ON d.id = r.driver_id
    LEFT JOIN public."order" o ON o.id = dt.order_id
    LEFT JOIN public.customer_address ca ON ca.id = dt.customer_address_id
   WHERE dt.status IN ('out_for_delivery', 'en_route', 'arrived')
     AND ${DRIVER_INELIGIBLE}
`;

export async function listStranded(): Promise<StrandedWork[]> {
  const res = await query<StrandedRow>(`${SELECT} ORDER BY since ASC`);
  return res.rows.map((r) => ({
    kind: r.kind,
    taskId: r.task_id,
    taskStatus: r.task_status,
    driverId: r.driver_id,
    driverName: r.driver_name,
    driverStatus: r.driver_status,
    orderId: r.order_id,
    orderReference: r.order_reference,
    location: r.location,
    since: r.since.toISOString(),
  }));
}

/**
 * Release stranded work back to the unassigned pool (FR-021).
 *
 * Deletes the task rows exactly the way the sweep does for un-started work — the packages then match
 * the sweep's `NOT EXISTS` candidate predicate again and are re-assigned on its next round. A
 * `driver_task_event` records the release on the run's timeline so the history does not simply lose
 * the stop.
 *
 * ⚠ THIS IS AN EXPLICIT HUMAN ACTION AND CANNOT BE AUTOMATED, because releasing asserts something
 * about the PHYSICAL world — the goods are back at the hub, or they are written off. No query can
 * know that.
 *
 * ⚠ Scoped to genuinely stranded rows. Passing the id of a task belonging to a working driver
 * matches nothing and releases nothing, so a stale screen cannot yank work out of someone's hands.
 */
export async function releaseStranded(
  collectionTaskIds: string[],
  deliveryTaskIds: string[],
): Promise<number> {
  if (collectionTaskIds.length === 0 && deliveryTaskIds.length === 0) return 0;

  return withTransaction(async (tx: pg.PoolClient) => {
    let released = 0;

    if (collectionTaskIds.length > 0) {
      const stranded = await tx.query<{ id: string; run_id: string }>(
        `SELECT ct.id, ct.run_id
           FROM public.collection_task ct
           JOIN public.driver_run r ON r.id = ct.run_id
           JOIN public.driver d     ON d.id = r.driver_id
          WHERE ct.id = ANY($1::uuid[])
            AND ct.status IN ('collected', 'short')
            AND r.status NOT IN ('completed', 'cancelled')
            AND ${DRIVER_INELIGIBLE}
          FOR UPDATE OF ct`,
        [collectionTaskIds],
      );
      for (const row of stranded.rows) {
        await tx.query(
          `INSERT INTO public.driver_task_event (run_id, status) VALUES ($1, 'released_by_back_office')`,
          [row.run_id],
        );
      }
      const del = await tx.query(`DELETE FROM public.collection_task WHERE id = ANY($1::uuid[])`, [
        stranded.rows.map((r) => r.id),
      ]);
      released += del.rowCount ?? 0;
    }

    if (deliveryTaskIds.length > 0) {
      const stranded = await tx.query<{ id: string; run_id: string }>(
        `SELECT dt.id, dt.run_id
           FROM public.delivery_task dt
           JOIN public.driver_run r ON r.id = dt.run_id
           JOIN public.driver d     ON d.id = r.driver_id
          WHERE dt.id = ANY($1::uuid[])
            AND dt.status IN ('out_for_delivery', 'en_route', 'arrived')
            AND ${DRIVER_INELIGIBLE}
          FOR UPDATE OF dt`,
        [deliveryTaskIds],
      );
      for (const row of stranded.rows) {
        await tx.query(
          `INSERT INTO public.driver_task_event (run_id, status) VALUES ($1, 'released_by_back_office')`,
          [row.run_id],
        );
      }
      // delivery_task_package cascades, freeing each package for re-grouping into a new drop.
      const del = await tx.query(`DELETE FROM public.delivery_task WHERE id = ANY($1::uuid[])`, [
        stranded.rows.map((r) => r.id),
      ]);
      released += del.rowCount ?? 0;
    }

    // Cancel runs left with nothing in them, so they do not linger on a returning driver's home —
    // the same tidy-up the sweep does after its own releases.
    await tx.query(
      `UPDATE public.driver_run r
          SET status = 'cancelled', completed_at = now()
        WHERE r.status IN ('assigned', 'active')
          AND NOT EXISTS (SELECT 1 FROM public.collection_task ct WHERE ct.run_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM public.delivery_task dt WHERE dt.run_id = r.id)`,
    );
    return released;
  });
}
