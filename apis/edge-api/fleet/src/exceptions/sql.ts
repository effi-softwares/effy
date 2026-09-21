// Delivery exceptions — the reader that went missing twice (064, US3).
//
// ⚠ 056 EXISTED BECAUSE THE DRIVER APP WAS RECORDING EXCEPTIONS NOBODY READ. Its own words: the app
// "has been recording exceptions for a reader that does not exist" — `public.delivery_failure` and
// `public.collection_task_issue` were both annotated "recorded for back-office follow-up", and a
// repo-wide search for a reader returned nothing. 056 built the reader; 063's teardown then dropped
// the tables from under it, leaving NEITHER a writer nor a reader. This is the third attempt and the
// first with both ends.

/**
 * Open and recently-resolved delivery exceptions.
 *
 * ⚠ `package_location` IS WHAT MAKES THE LIST TRIAGEABLE (FR-020). "Nobody was home" and "the goods
 * are still in a van" are different problems with different urgency, and a list that cannot tell
 * them apart is a list nobody can act on. It is DERIVED from the same custody facts as
 * `CUSTODY_BY_DRIVER` — a package is with the driver until a hub check-in or an arrival releases it.
 *
 * ⚠ The destination is a SUBURB, never a street address. A list screen does not need to name where a
 * customer lives, and 049 FR-013 keeps the driver domain free of detail it has no use for.
 */
export const LIST_EXCEPTIONS = `
  SELECT f.id                    AS exception_id,
         f.stop_id               AS stop_id,
         f.reason                AS reason,
         f.note                  AS note,
         f.failed_at             AS failed_at,
         f.resolved_at           AS resolved_at,
         d.id                    AS driver_id,
         d.name                  AS driver_name,
         o.order_number          AS order_number,
         o.delivery_address ->> 'city' AS destination_suburb,
         CASE
           WHEN EXISTS (
             SELECT 1
               FROM public.round_package rp
               JOIN public.round_stop    rs ON rs.id = rp.stop_id
               JOIN public.driver_round  dr ON dr.id = rs.round_id
              WHERE rs.id = f.stop_id
                AND rp.state = 'picked_up'
                AND NOT EXISTS (
                      SELECT 1 FROM public.package_arrival pa
                       WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id
                    )
           ) THEN 'with_driver'
           ELSE 'at_hub'
         END                     AS package_location
    FROM public.delivery_attempt_failure f
    JOIN public.driver     d ON d.id = f.driver_id
    JOIN public.round_stop rs ON rs.id = f.stop_id
    JOIN public."order"    o ON o.id = rs.order_id
   WHERE ($1::boolean IS TRUE OR f.resolved_at IS NULL)
   ORDER BY f.resolved_at NULLS FIRST, f.failed_at DESC
   LIMIT 200
`;

/**
 * Close one exception.
 *
 * ⚠ GUARDED ON `resolved_at IS NULL`, so resolving twice is a no-op rather than a silent re-stamp
 * with a later time and a different person's name. The record of WHO closed it and WHEN is the whole
 * value of the row after the fact.
 */
export const RESOLVE_EXCEPTION = `
  UPDATE public.delivery_attempt_failure
     SET resolved_at = now()
   WHERE id = $1
     AND resolved_at IS NULL
  RETURNING id, resolved_at
`;

/** Read one back — for the audit detail and the response after a resolve. */
export const EXCEPTION_BY_ID = `
  SELECT id, stop_id, reason, resolved_at FROM public.delivery_attempt_failure WHERE id = $1
`;
