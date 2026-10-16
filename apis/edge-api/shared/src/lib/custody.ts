// Who is physically holding a package, right now (064).
//
// ⚠ IN `@effy/edge-shared` BECAUSE TWO SERVICES ASK THE SAME QUESTION. `edge-api/fleet` answers it
// for the dispatcher's custody view; `edge-api/driver` answers it to stop a shift ending silently
// with goods still in the van (FR-018). One question, one definition — two copies would agree today
// and disagree the first time a handover mechanism changes, and the whole point of the query is that
// a package is never in nobody's hands.

import { IN_TRANSIT_SQL, TO_RETURN_SQL } from "../delivery/parcel-return";

/**
 * Every package currently in a driver's hands (064, FR-014 / FR-018).
 *
 * ⚠ DERIVED ON READ, NEVER STORED — 027's counted-not-stored rule, fifth application on this
 * platform. A custody table would be a second source of truth for a fact these rows already state
 * completely, and 063 found an FK that was "wrong in principle" by duplicating exactly that way.
 *
 * Custody is the gap between picking a package up and handing it on:
 *
 *   · COLLECTION — `picked_up` at a shop, until the round's `hub_checkin` releases it;
 *   · DELIVERY   — on a started drop, until a `package_arrival` releases it; or, after a FAILED drop,
 *                  until the parcel is returned to the hub (088).
 *
 * ⚠ 088 — THE DELIVERY HALF NEVER MATCHED ANYTHING. It read `picked_up`, and the planner puts a
 * delivery package on a round as `assigned` and nothing ever changes that until it is settled — the
 * same assumption EFY-GNYQ58 found in the proof path. So a parcel in a van after a failed drop was in
 * nobody's custody, and the go-off-duty check never noticed one.
 *
 * ⚠ FR-018 DEPENDS ON THIS BEING EXACT. 056 found that standing a driver down could strand physical
 * goods permanently and invisibly: `releaseIneligibleWork` correctly never yanks picked-up work, the
 * UNIQUE index then kept it claimed, and every sweep's `NOT EXISTS` skipped it forever with an order
 * attached to each package. This query is what makes that state visible — before a shift ends, not
 * after someone notices an order that never moved.
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
           -- 088 — on its way to a door, or back in the van after a failed drop.
        OR ${IN_TRANSIT_SQL}
        OR ${TO_RETURN_SQL}
         )
   ORDER BY d.name, held_since NULLS LAST, o.order_number
`;
