// Driver notifications, written through the one writer in the same transaction as the change (109).

import type { Queryable } from "@effy/edge-shared";
import { notify } from "@effy/edge-shared/notifications";

/**
 * "Run assigned": once per round and driver (deduped on both), so additions never repeat it and a moved round tells
 * the new driver. It is about the round, and a tap opens it.
 */
export async function enqueueRunAssigned(tx: Queryable, roundId: string): Promise<void> {
  const driver = (
    await tx.query<{ sub: string }>(
      `SELECT d.cognito_sub AS sub
         FROM public.driver_round dr
         JOIN public.driver d ON d.id = dr.driver_id
        WHERE dr.id = $1
          AND dr.status IN ('planned', 'in_progress')`,
      [roundId],
    )
  ).rows;
  await notify(tx, { type: "run_assigned", recipients: driver, subject: { entityId: roundId }, dedupeScope: roundId, channels: ["push"] });
}

/**
 * "Run removed" when a round is no longer theirs; "Run updated" when they are working it and its stops changed (an
 * unstarted round is not "updated"). One removed per round and driver; one updated per change, keyed on `updated_at`.
 */
export async function enqueueRoundChanged(tx: Queryable, roundId: string, driverId: string): Promise<void> {
  const row = (
    await tx.query<{ sub: string; type: "run_withdrawn" | "run_changed" | null; changed_ms: string }>(
      `SELECT d.cognito_sub AS sub,
              CASE WHEN dr.status = 'cancelled' OR dr.driver_id IS DISTINCT FROM d.id THEN 'run_withdrawn'
                   WHEN dr.status = 'in_progress' THEN 'run_changed' END AS type,
              (extract(epoch FROM dr.updated_at) * 1000)::bigint::text AS changed_ms
         FROM public.driver_round dr
         JOIN public.driver d ON d.id = $2
        WHERE dr.id = $1`,
      [roundId, driverId],
    )
  ).rows[0];
  if (!row?.type) return;
  await notify(tx, {
    type: row.type,
    recipients: [{ sub: row.sub }],
    subject: { entityId: roundId },
    dedupeScope: row.type === "run_changed" ? `${roundId}:${row.changed_ms}` : roundId,
    channels: ["push"],
  });
}

export const OPENS_SOON_LEAD_MIN = 15;

/**
 * "Run opens soon", once per round and driver; each pass runs it, so it lands 10–15 minutes ahead. It expires when the
 * round opens: telling a driver afterwards would be wrong.
 */
export async function enqueueRoundsOpeningSoon(tx: Queryable, now: Date): Promise<void> {
  const due = (
    await tx.query<{ round_id: string; sub: string; opens: Date }>(
      `SELECT r.id::text AS round_id, d.cognito_sub AS sub, r.opens
         FROM (
           SELECT dr.id, dr.driver_id,
                  public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens
             FROM public.driver_round dr
            WHERE dr.status = 'planned'
         ) r
         JOIN public.driver d ON d.id = r.driver_id
        WHERE r.opens > $1::timestamptz
          AND r.opens <= $1::timestamptz + make_interval(mins => $2)`,
      [now.toISOString(), OPENS_SOON_LEAD_MIN],
    )
  ).rows;
  for (const r of due) {
    await notify(tx, {
      type: "run_opens_soon", recipients: [{ sub: r.sub }], subject: { entityId: r.round_id },
      dedupeScope: r.round_id, channels: ["push"], expiresAt: new Date(r.opens),
    });
  }
}
