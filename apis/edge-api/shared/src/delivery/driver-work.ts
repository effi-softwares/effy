import type { Queryable } from "../lib/db";

/**
 * Taking a package off a driver's round — 073's Unassign, shared since 081.
 *
 * ⚠ ONE IMPLEMENTATION. Fleet's "Unassign" and back-office's move of an order to courier (081) both
 * take a package off a round. Before 081 this lived in the fleet service; a second copy in the orders
 * service would be the "two implementations of one rule" shape 072 found three defects through. Both
 * now call this, inside their own transaction.
 */

/**
 * ⚠ THE PLANNER'S PASS LOCK — blocking, transaction-scoped. Anything that changes driver work outside
 * a planning pass takes it FIRST (before any row lock), so it waits a moment for a pass rather than
 * racing one. Same key as the pass's own `pg_try_advisory_xact_lock`.
 */
export const PLANNER_PASS_LOCK = `SELECT pg_advisory_xact_lock(72063001)`;

/** One open assignment of a package, as `removeAssignment` needs it. */
export interface OpenAssignment {
  id: string;
  stop_id: string;
  round_id: string;
  round_status: string;
}

/**
 * Remove one `round_package`, then its stop if nothing is left on it, then the round if it had not
 * begun and is now empty. A round under way keeps going with what it has.
 */
export async function removeAssignment(tx: Queryable, current: OpenAssignment): Promise<void> {
  await tx.query(`DELETE FROM public.round_package WHERE id = $1`, [current.id]);
  await tx.query(
    `DELETE FROM public.round_stop rs
      WHERE rs.id = $1 AND NOT EXISTS (SELECT 1 FROM public.round_package rp WHERE rp.stop_id = rs.id)`,
    [current.stop_id],
  );
  await tx.query(
    `UPDATE public.driver_round dr SET status = 'cancelled', updated_at = now()
      WHERE dr.id = $1 AND dr.status = 'planned'
        AND NOT EXISTS (SELECT 1 FROM public.round_stop rs JOIN public.round_package rp ON rp.stop_id = rs.id
                         WHERE rs.round_id = dr.id)`,
    [current.round_id],
  );
  await tx.query(`UPDATE public.driver_round SET updated_at = now() WHERE id = $1`, [current.round_id]);
}
