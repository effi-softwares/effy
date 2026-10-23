// Who is physically holding a package now: one definition for fleet's custody view and the driver's off-duty check.

import { IN_TRANSIT_SQL, TO_RETURN_SQL } from "../delivery/parcel-return";

/**
 * Every package in a driver's hands, derived on read. Custody runs from pick-up to hand-on:
 *  · collection: `picked_up` at a shop, until the round's `hub_checkin`;
 *  · delivery: on a started drop until a `package_arrival`, or after a failed drop until returned.
 * Delivery packages stay `assigned` (the planner never changes that), so this is what makes goods
 * stranded in a van visible before a shift ends.
 */
export const CUSTODY_BY_DRIVER = `
  SELECT d.id                   AS driver_id,
         d.name                 AS driver_name,
         rp.shop_fulfillment_id AS package_id,
         o.order_number         AS order_number,
         s.name                 AS shop_name,
         dr.kind                AS round_kind,
         COALESCE(rp.settled_at, rs.completed_at, rp.created_at) AS held_since,
         ${TO_RETURN_SQL}       AS to_return
    FROM public.round_package rp
    JOIN public.round_stop    rs ON rs.id = rp.stop_id
    JOIN public.driver_round  dr ON dr.id = rs.round_id
    JOIN public.driver         d ON d.id = dr.driver_id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order"        o ON o.id = sf.order_id
    JOIN public.shop           s ON s.id = sf.shop_id
   WHERE ($1::uuid IS NULL OR d.id = $1::uuid)
     AND (
           -- Collected from a shop, not yet checked in at the hub.
           (dr.kind = 'collection'
            AND rp.state = 'picked_up'
            AND NOT EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id)
            AND NOT EXISTS (SELECT 1 FROM public.package_arrival pa WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id))
           -- On its way to a door, or back in the van after a failed drop.
        OR ${IN_TRANSIT_SQL}
        OR ${TO_RETURN_SQL}
         )
   ORDER BY d.name, held_since NULLS LAST, o.order_number
`;
