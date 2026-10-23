// Every statement is scoped to the authenticated driver. No coordinate exists here.

/**
 * The drop, locked (`FOR UPDATE OF rs`) so two devices serialise; `delivery_proof_stop_uq` makes the
 * loser's write impossible. Scoped by `dr.driver_id`, so "not yours" and "no such drop" are one empty result.
 */
export const LOCK_DROP = `
  SELECT rs.id          AS stop_id,
         rs.status      AS stop_status,
         rs.order_id    AS order_id,
         dr.id          AS round_id,
         dr.kind        AS round_kind
    FROM public.round_stop   rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE rs.id = $1
     AND dr.driver_id = $2
     AND rs.kind = 'customer_drop'
   FOR UPDATE OF rs
`;

/** What a retry is answered with. */
export const EXISTING_PROOF = `
  SELECT id, method, media_key, note, captured_at
    FROM public.delivery_proof
   WHERE stop_id = $1
`;

/** A prior submission of the same driver action, wherever it landed. */
export const PROOF_BY_CHANGE = `
  SELECT id, stop_id, method, media_key, note, captured_at
    FROM public.delivery_proof
   WHERE change_id = $1
`;

export const INSERT_PROOF = `
  INSERT INTO public.delivery_proof
       (stop_id, method, media_key, note, captured_by_driver_id, captured_at, change_id)
  VALUES ($1, $2, $3, $4, $5, now(), $6)
  RETURNING id, captured_at
`;

export const DROP_PACKAGES = `
  SELECT rp.id                  AS round_package_id,
         rp.shop_fulfillment_id AS shop_fulfillment_id
    FROM public.round_package rp
   WHERE rp.stop_id = $1
     -- ⚠ The planner puts a delivery package on a round as 'assigned' and nothing at the hub changes
     -- that: reading 'picked_up' alone would match no package, and the order would never arrive.
     AND rp.state IN ('assigned', 'picked_up')
`;

export const MARK_PACKAGE_DELIVERED = `
  UPDATE public.round_package
     SET state = 'delivered', settled_at = now()
   WHERE id = $1
`;

/** Guarded by its current value: only `collected` → `delivered`, so a replay cannot advance anything else. */
export const MARK_FULFILLMENT_DELIVERED = `
  UPDATE public.shop_fulfillment
     SET status = 'delivered', state_changed_at = now(), updated_at = now()
   WHERE id = $1
     AND status = 'collected'
`;

/**
 * What order completeness reads (not the fulfilment status): skipping it leaves the order silently
 * incomplete. `ON CONFLICT DO NOTHING` on `package_arrival_package_uq` makes a replay a no-op.
 */
export const INSERT_ARRIVAL = `
  INSERT INTO public.package_arrival (shop_fulfillment_id, arrived_at, source, recorded_by_sub, note)
  VALUES ($1, now(), 'driver_proof', $2, NULL)
  ON CONFLICT (shop_fulfillment_id) DO NOTHING
`;

export const MARK_STOP_DONE = `
  UPDATE public.round_stop
     SET status = 'done', completed_at = now()
   WHERE id = $1
`;

/** `in_progress` on its first completed stop, as collection does. */
export const MARK_ROUND_IN_PROGRESS = `
  UPDATE public.driver_round
     SET status = 'in_progress', updated_at = now()
   WHERE id = $1
     AND status = 'planned'
`;

export const FAILURE_BY_CHANGE = `
  SELECT id, stop_id, reason, note, failed_at
    FROM public.delivery_attempt_failure
   WHERE change_id = $1
`;

/** Records the attempt only: the package stays with the driver, now "to return", and the round stays open. */
export const INSERT_FAILURE = `
  INSERT INTO public.delivery_attempt_failure
       (stop_id, reason, note, driver_id, failed_at, change_id)
  VALUES ($1, $2, $3, $4, now(), $5)
  RETURNING id, failed_at
`;

export const MARK_STOP_SKIPPED = `
  UPDATE public.round_stop
     SET status = 'skipped', completed_at = now()
   WHERE id = $1
`;
