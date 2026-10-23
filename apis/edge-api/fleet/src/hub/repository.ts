// The hub station's reads (`hub.container.test.ts` runs them against the real schema).
import type { ParcelZone } from "@effy/shared-types";

type Tx = { query: (text: string, values?: unknown[]) => Promise<any> };

/** From its first collected package until its check-in is written. */
const OPEN_RUN = `
  dr.kind = 'collection'
  AND NOT EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id)`;

export interface ExpectedBagRow {
  run_id: string;
  driver_name: string;
  parcel_id: string;
  parcel_code: string;
  seq: number;
  of: number;
  zone: ParcelZone;
  order_number: string;
  checked_in: boolean;
  delivered_by: "effy" | "courier";
  window_start: Date | null;
  window_end: Date | null;
  any_time: boolean;
}

export async function expectedBags(tx: Tx): Promise<ExpectedBagRow[]> {
  const res = await tx.query(
    `SELECT dr.id::text AS run_id, d.name AS driver_name,
            p.id::text AS parcel_id, p.parcel_code, p.seq, p.zone,
            (SELECT count(*) FROM public.package_parcel l
              WHERE l.shop_fulfillment_id = p.shop_fulfillment_id AND l.voided_at IS NULL)::int AS of,
            o.order_number,
            EXISTS (SELECT 1 FROM public.package_handover h
                     WHERE h.parcel_id = p.id AND h.step = 'checkin' AND h.round_id = dr.id) AS checked_in,
            o.delivery_type AS delivered_by,
            opd.window_start, opd.window_end,
            COALESCE((SELECT ds.any_time FROM public.delivery_slot ds WHERE ds.id = opd.slot_id), false) AS any_time
       FROM public.driver_round dr
       JOIN public.driver d ON d.id = dr.driver_id
       JOIN public.round_stop rs ON rs.round_id = dr.id
       JOIN public.round_package rp ON rp.stop_id = rs.id AND rp.state = 'picked_up'
       JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
       JOIN public."order" o ON o.id = sf.order_id
       JOIN public.package_parcel p ON p.shop_fulfillment_id = sf.id AND p.voided_at IS NULL
  LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
      WHERE ${OPEN_RUN}
        AND NOT EXISTS (SELECT 1 FROM public.package_hold ph
                         WHERE ph.shop_fulfillment_id = sf.id AND (ph.parcel_id IS NULL OR ph.parcel_id = p.id)
                           AND (ph.resolution IS NULL OR ph.resolution = 'lost'))
      ORDER BY dr.created_at, dr.id, o.order_number, p.seq`,
  );
  return res.rows;
}

/** Locked; null when none is on its way in. */
export async function openRunFor(tx: Tx, packageId: string): Promise<{ runId: string; driverId: string } | null> {
  const res = await tx.query(
    `SELECT dr.id::text AS run_id, dr.driver_id::text AS driver_id
       FROM public.driver_round dr
       JOIN public.round_stop rs ON rs.round_id = dr.id
       JOIN public.round_package rp ON rp.stop_id = rs.id
      WHERE rp.shop_fulfillment_id = $1 AND rp.state = 'picked_up' AND ${OPEN_RUN}
      ORDER BY dr.created_at DESC
      LIMIT 1
      FOR UPDATE OF dr`,
    [packageId],
  );
  const r = res.rows[0];
  return r ? { runId: r.run_id, driverId: r.driver_id } : null;
}

export async function everCheckedIn(tx: Tx, parcelId: string): Promise<boolean> {
  const res = await tx.query(`SELECT 1 FROM public.package_handover WHERE parcel_id = $1 AND step = 'checkin' LIMIT 1`, [parcelId]);
  return (res.rowCount ?? 0) > 0;
}

export async function runHasUnsettledStops(tx: Tx, runId: string): Promise<boolean> {
  const res = await tx.query(
    `SELECT 1 FROM public.round_package rp JOIN public.round_stop rs ON rs.id = rp.stop_id
      WHERE rs.round_id = $1 AND rp.state = 'assigned' LIMIT 1`,
    [runId],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface SortFactsRow {
  of: number;
  order_number: string;
  delivered_by: "effy" | "courier";
  window_start: Date | null;
  window_end: Date | null;
  any_time: boolean;
}

export async function sortFacts(tx: Tx, packageId: string): Promise<SortFactsRow> {
  const res = await tx.query(
    `SELECT (SELECT count(*) FROM public.package_parcel l WHERE l.shop_fulfillment_id = sf.id AND l.voided_at IS NULL)::int AS of,
            o.order_number,
            o.delivery_type AS delivered_by,
            opd.window_start, opd.window_end,
            COALESCE((SELECT ds.any_time FROM public.delivery_slot ds WHERE ds.id = opd.slot_id), false) AS any_time
       FROM public.shop_fulfillment sf
       JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
      WHERE sf.id = $1`,
    [packageId],
  );
  return res.rows[0];
}
