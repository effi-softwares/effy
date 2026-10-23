// How long packages have been in drivers' hands (064). Derived from the round rows; nothing is stored.

import { query } from "@effy/edge-shared";

/**
 * The longest unbroken custody right now, in hours — the `DriverPackagesHeldHours` alarm's input.
 *
 * ⚠ IT IS EMITTED FROM THE SCHEDULED PLANNER, NOT FROM THE CUSTODY READ. An on-demand read only
 * happens when a dispatcher opens a screen, so an alarm fed by it would be silent exactly when
 * nobody is looking — which is the situation it exists to catch. The planner already wakes every few
 * minutes and already emits EMF, so the measurement rides along with something that runs whether or
 * not anyone is watching.
 *
 * Returns 0 when no package is held, which is the healthy state and not an absence.
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
