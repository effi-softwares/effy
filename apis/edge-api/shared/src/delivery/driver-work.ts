import type { Queryable } from "../lib/db";

/** Taking a package off a driver's round: one implementation for fleet's Unassign and back-office's move to courier. */

/** The planner's pass lock, blocking and transaction-scoped; taken first by anything changing driver work outside a pass. */
export const PLANNER_PASS_LOCK = `SELECT pg_advisory_xact_lock(72063001)`;

export interface OpenAssignment {
  id: string;
  stop_id: string;
  round_id: string;
  round_status: string;
}

/** Removes one `round_package`, then an emptied stop, then an emptied unstarted round. A round under way continues. */
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
