// Proof of delivery and failed attempts (064). Raw parameterised SQL, every statement scoped to the
// authenticated driver (FR-038 carries over from 063).
//
// ⚠ NO COORDINATE IS SELECTED OR WRITTEN ANYWHERE HERE, and none exists to select (FR-028).

/**
 * The drop, locked, with everything the completion needs in one round trip.
 *
 * ⚠ `FOR UPDATE OF rs` — two devices can submit the same completion at the same instant (SC-007).
 * The row lock serialises them; `delivery_proof_stop_uq` is what makes the loser's write impossible
 * rather than merely unlucky.
 *
 * ⚠ Scoped by `dr.driver_id`, so "not yours" and "no such drop" are THE SAME QUERY returning no row.
 * They must stay indistinguishable or the route becomes an oracle for other drivers' work (052).
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

/** An already-proven drop's existing outcome — what a retry is answered with (FR-005). */
export const EXISTING_PROOF = `
  SELECT id, method, media_key, note, captured_at
    FROM public.delivery_proof
   WHERE stop_id = $1
`;

/** A prior submission of the SAME driver action, wherever it landed (idempotency, R10). */
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

/** Every package at this drop — the units whose fate the proof settles. */
export const DROP_PACKAGES = `
  SELECT rp.id                  AS round_package_id,
         rp.shop_fulfillment_id AS shop_fulfillment_id
    FROM public.round_package rp
   WHERE rp.stop_id = $1
     AND rp.state = 'picked_up'
`;

export const MARK_PACKAGE_DELIVERED = `
  UPDATE public.round_package
     SET state = 'delivered', settled_at = now()
   WHERE id = $1
`;

/**
 * ⚠ THE STATUS WRITE, GUARDED BY ITS CURRENT VALUE. A package can only go `collected` → `delivered`
 * here. Without the guard a replay could advance something that had already moved on.
 */
export const MARK_FULFILLMENT_DELIVERED = `
  UPDATE public.shop_fulfillment
     SET status = 'delivered', state_changed_at = now(), updated_at = now()
   WHERE id = $1
     AND status = 'collected'
`;

/**
 * ⚠ THE ROW ORDER COMPLETENESS ACTUALLY KEYS ON (research R3).
 *
 * `enqueueOrderDeliveredIfComplete` asks "does an unarrived package of this order exist?" against
 * `package_arrival` — NOT against `shop_fulfillment.status`. A proof that sets the status and skips
 * this insert leaves the order permanently incomplete: the shopper is never told it arrived, the
 * order never leaves their active list, and NOTHING FAILS anywhere.
 *
 * `source = 'driver_proof'` was already permitted by 053's CHECK — that slice anticipated this exact
 * caller and it has never existed until now.
 *
 * `ON CONFLICT DO NOTHING` on `package_arrival_package_uq` makes a replay a no-op rather than an
 * error, which is what lets the whole transaction be retried safely.
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

/** A round becomes `in_progress` on its first completed stop, exactly as 063's collect path does. */
export const MARK_ROUND_IN_PROGRESS = `
  UPDATE public.driver_round
     SET status = 'in_progress', updated_at = now()
   WHERE id = $1
     AND status = 'planned'
`;

// ── Failed attempts (US2) ───────────────────────────────────────────────────────────────────────

export const FAILURE_BY_CHANGE = `
  SELECT id, stop_id, reason, note, failed_at
    FROM public.delivery_attempt_failure
   WHERE change_id = $1
`;

/**
 * ⚠ RECORDS THE ATTEMPT AND NOTHING ELSE. The package is NOT released, NOT marked delivered and NOT
 * taken off the driver — they still physically have it (FR-011). The only writes a failure makes are
 * this row and the stop's own status.
 */
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
