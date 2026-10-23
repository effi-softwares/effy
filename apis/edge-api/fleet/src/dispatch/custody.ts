// Derived from the round rows; nothing is stored.

import { query } from "@effy/edge-shared";

/**
 * The longest unbroken custody now, in hours, for the `DriverPackagesHeldHours` alarm. Emitted from the
 * scheduled planner, so it is measured whether or not anyone opens a screen. 0 when nothing is held.
 */
export async function maxCustodyHours(): Promise<number> {
  const res = await query<{ hours: string | null }>(
    `SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (now() - rp.settled_at)) / 3600), 0) AS hours
       FROM public.round_package rp
       JOIN public.round_stop   rs ON rs.id = rp.stop_id
       JOIN public.driver_round dr ON dr.id = rs.round_id
      WHERE rp.state = 'picked_up'
        AND rp.settled_at IS NOT NULL
        AND NOT (dr.kind = 'collection'
                 AND EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id))
        AND NOT EXISTS (
              SELECT 1 FROM public.package_arrival pa
               WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id
            )`,
  );
  return Number(res.rows[0]?.hours ?? 0);
}
