import { TO_RETURN_SQL } from "@effy/edge-shared/delivery";

/**
 * Open and recently resolved. `package_location` (with the driver until a hub check-in or arrival,
 * as `CUSTODY_BY_DRIVER`) makes the list triageable. The destination is a suburb, never a street.
 */
export const LIST_EXCEPTIONS = `
  SELECT f.id                    AS exception_id,
         f.stop_id               AS stop_id,
         f.reason                AS reason,
         f.note                  AS note,
         f.failed_at             AS failed_at,
         f.resolved_at           AS resolved_at,
         f.resolution_outcome    AS resolution_outcome,
         f.resolution_note       AS resolution_note,
         d.id                    AS driver_id,
         d.name                  AS driver_name,
         o.order_number          AS order_number,
         o.delivery_address ->> 'city' AS destination_suburb,
         -- ⚠ FROM THE ONE CUSTODY DEFINITION. This read rp.state = 'picked_up', a state no
         -- delivery package is ever in, so every failed parcel said "at hub" while it was in a van.
         CASE
           WHEN EXISTS (
             SELECT 1
               FROM public.round_package rp
               JOIN public.round_stop    rs ON rs.id = rp.stop_id
               JOIN public.driver_round  dr ON dr.id = rs.round_id
              WHERE rs.id = f.stop_id
                AND ${TO_RETURN_SQL}
           ) THEN 'with_driver'
           ELSE 'at_hub'
         END                     AS package_location,
         rs.round_id             AS round_id,
         (SELECT max(pr.returned_at)
            FROM public.round_package rp
            JOIN public.parcel_return pr ON pr.id = rp.return_id
           WHERE rp.stop_id = f.stop_id) AS returned_at
    FROM public.delivery_attempt_failure f
    JOIN public.driver     d ON d.id = f.driver_id
    JOIN public.round_stop rs ON rs.id = f.stop_id
    JOIN public."order"    o ON o.id = rs.order_id
   WHERE ($1::boolean IS TRUE OR f.resolved_at IS NULL)
   ORDER BY f.resolved_at NULLS FIRST, f.failed_at DESC
   LIMIT 200
`;

/** Guarded on `resolved_at IS NULL`, so resolving twice never re-stamps who and when. */
export const RESOLVE_EXCEPTION = `
  UPDATE public.delivery_attempt_failure
     SET resolved_at = now(),
         resolution_outcome = $2,
         resolution_note = $3
   WHERE id = $1
     AND resolved_at IS NULL
  RETURNING id, resolved_at
`;

export const EXCEPTION_BY_ID = `
  SELECT id, stop_id, reason, resolved_at FROM public.delivery_attempt_failure WHERE id = $1
`;
