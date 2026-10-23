// Hub check-in (063, per bag since 096) — ONE rule, used by the driver at the end of a collection run
// and by hub staff at the back-office hub station (research R8).
//
// A run's check-in CLOSES when every bag it collected is checked in or declared missing: the driver's
// check-in does it in one request; at the hub station, the scan of the run's last bag does it. Either
// way the same `closeRunCheckin` writes the one `hub_checkin` row, closes the hub stop and the run, and
// answers with the run's counts.
//
// ⚠ EVERY WRITE IS IDEMPOTENT. `hub_checkin` is UNIQUE (round_id): a retry is a retry.

import {
  anyTimeDayLabel,
  formatArrival,
  formatMoment,
  melbourneDate,
  type HubCheckinEffyGroup,
  type HubCheckinResponse,
} from "@effy/shared-types";

import { expectedParcels, type StepParcel } from "../labels/parcels";
import { nextCourierPickup, parseClock } from "./courier-pickup";
import { heldSql } from "./held";

type Tx = { query: (text: string, values?: unknown[]) => Promise<any> };

/** The packages a collection run collected (picked up at a shop, not left there). */
export async function collectedPackages(tx: Tx, runId: string): Promise<string[]> {
  const res = await tx.query(
    `SELECT rp.shop_fulfillment_id FROM public.round_package rp
       JOIN public.round_stop rs ON rs.id = rp.stop_id
      WHERE rs.round_id = $1 AND rp.state = 'picked_up'`,
    [runId],
  );
  return res.rows.map((r: { shop_fulfillment_id: string }) => r.shop_fulfillment_id);
}

/** The bags of this run still to be checked in at the hub (not yet in, not held). */
export async function bagsToCheckIn(tx: Tx, runId: string): Promise<StepParcel[]> {
  return expectedParcels(tx, { step: "checkin", packageIds: await collectedPackages(tx, runId), roundId: runId });
}

/**
 * Close a collection run's check-in: write `hub_checkin` (once), close the hub stop and the run, and
 * answer with the run's counts. ⚠ Only call when `bagsToCheckIn` is empty.
 */
export async function closeRunCheckin(
  tx: Tx,
  runId: string,
  closer: { by: "driver" } | { by: "admin_staff"; sub: string },
): Promise<Omit<HubCheckinResponse, "held">> {
  const counts = await tx.query(
    `SELECT rp.state                                 AS state,
            -- 080 — who takes it from the hub: what the driver is told ("Courier"), never the
            -- customer's word for the delivery.
            o.delivery_type AS delivered_by,
            opd.window_start                         AS window_start,
            opd.window_end                           AS window_end,
            -- 085 — the "Any time" window: the customer was sold the day, not these hours.
            COALESCE(ds.any_time, false)             AS any_time,
            count(*)::int                            AS n
       FROM public.round_package rp
       JOIN public.round_stop       rs ON rs.id = rp.stop_id
       JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
       JOIN public."order"          o  ON o.id = sf.order_id
  LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
  LEFT JOIN public.delivery_slot ds ON ds.id = opd.slot_id
      WHERE rs.round_id = $1
        -- 093 — a package declared not in the van did not arrive.
        AND NOT ${heldSql("rp.shop_fulfillment_id")}
      GROUP BY 1, 2, 3, 4, 5`,
    [runId],
  );

  const pickedUp = counts.rows.filter((r: any) => r.state === "picked_up");
  const total = (rows: any[]) => rows.reduce((a: number, r: any) => a + Number(r.n), 0);
  const arrived = total(pickedUp);
  const courier = total(pickedUp.filter((r: any) => r.delivered_by === "courier"));

  // 082 — Effy's parcels by the day and window each waits for, earliest first, those sold no window
  // last. The label is written here; the app never formats a day.
  const at = new Date();
  const effyRows = pickedUp.filter((r: any) => r.delivered_by === "effy");
  const byWindow = new Map<string, HubCheckinEffyGroup>();
  for (const r of effyRows) {
    const windowStart = r.window_start ? new Date(r.window_start).toISOString() : null;
    const windowEnd = r.window_end ? new Date(r.window_end).toISOString() : null;
    const key = `${windowStart}|${windowEnd}`;
    const g = byWindow.get(key) ?? {
      date: windowStart ? melbourneDate(new Date(windowStart)) : null,
      windowStart, windowEnd,
      label: windowStart && windowEnd
        ? r.any_time
          ? anyTimeDayLabel(melbourneDate(new Date(windowStart)), at)
          : formatArrival({ promisedFrom: null, promisedTo: null, windowStart, windowEnd }, at)
        : "Effy delivery",
      ...(r.any_time ? { anyTime: true as const } : {}),
      count: 0,
      dueToday: windowStart === null || melbourneDate(new Date(windowStart)) <= melbourneDate(at),
    };
    g.count += Number(r.n);
    byWindow.set(key, g);
  }
  const effyGroups = [...byWindow.values()].sort((a, b) =>
    a.windowStart === null ? 1 : b.windowStart === null ? -1 : a.windowStart.localeCompare(b.windowStart));
  const effyCount = effyGroups.reduce((a, g) => a + g.count, 0);
  const expected = total(counts.rows);

  // ⚠ UNIQUE (round_id) makes a retry a retry. The run's own driver is recorded whoever closed it.
  await tx.query(
    `INSERT INTO public.hub_checkin (round_id, driver_id, packages_expected, packages_arrived, closed_by, closed_by_sub)
     SELECT $1, dr.driver_id, $2, $3, $4, $5 FROM public.driver_round dr WHERE dr.id = $1
     ON CONFLICT (round_id) DO NOTHING`,
    [runId, expected, arrived, closer.by, closer.by === "admin_staff" ? closer.sub : null],
  );

  // ⚠ 064 — CLOSE THE HUB STOP TOO, or the round's own work item outlives the round.
  await tx.query(
    `UPDATE public.round_stop
        SET status = 'done', completed_at = now()
      WHERE round_id = $1 AND kind = 'hub_checkin' AND status <> 'done'`,
    [runId],
  );
  await tx.query(`UPDATE public.driver_round SET status = 'completed', updated_at = now() WHERE id = $1`, [runId]);

  // 092 — when the courier next collects from the hub, so the driver knows how long the courier bay waits.
  const nextCourierPickupLabel = courier > 0 ? await courierPickupLabel(tx, at) : null;

  return {
    scannedTotal: arrived, courierCount: courier, effyCount, effyGroups,
    nextCourierPickupLabel,
  };
}

/** The default courier service's next pickup after [at], in Melbourne words; null when there is none. */
async function courierPickupLabel(tx: Tx, at: Date): Promise<string | null> {
  const svc = await tx.query(
    `SELECT pickup_weekdays::int[] AS weekdays, to_char(pickup_cutoff, 'HH24:MI') AS cutoff
       FROM public.courier_service WHERE is_default AND status = 'active' LIMIT 1`, // availability-exempt: courier_service — a courier service, not a product
  );
  const row = svc.rows[0] as { weekdays: number[]; cutoff: string } | undefined;
  if (!row || row.weekdays.length === 0) return null;
  try {
    return formatMoment(nextCourierPickup(at, row.weekdays, parseClock(row.cutoff)), at);
  } catch {
    return null;
  }
}
