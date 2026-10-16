// Pushes to a driver about their work (driver backlog D1). Written into the notification outbox in
// the SAME transaction as the change, so a push is never sent for work that did not commit; the
// notifications worker drains it within a minute.

import type { Queryable } from "@effy/edge-shared";

/**
 * "Run assigned" — a round has become this driver's: the planner made it, or dispatch moved it to
 * them. ⚠ ONE PER ROUND AND DRIVER: the dedupe key is the round and the driver's sub, so the planner
 * adding to a round every five minutes never repeats it, while a round moved to another driver tells
 * the new one. Before this nothing produced a driver push at all — a driver with the app closed
 * learned of new work only by opening it.
 *
 * The payload carries the round id and its link, never an address or an order (Principle VII).
 */
export async function enqueueRunAssigned(tx: Queryable, roundId: string): Promise<void> {
  await tx.query(
    `INSERT INTO public.notification_request
         (recipient_sub, audience, type, channel, payload, dedupe_key)
     SELECT d.cognito_sub, 'driver', 'run_assigned', 'push',
            jsonb_build_object('entityId', dr.id::text, 'deepLink', 'effy://run/' || dr.id::text),
            'run_assigned:push:' || d.cognito_sub || ':' || dr.id::text
       FROM public.driver_round dr
       JOIN public.driver d ON d.id = dr.driver_id
      WHERE dr.id = $1
        AND dr.status IN ('planned', 'in_progress')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [roundId],
  );
}

/**
 * A round changed under a driver (backlog D2): "Run removed" when it is no longer theirs — ended, or
 * moved to someone else — and "Run updated" when they are working it and its stops changed.
 *
 * ⚠ A ROUND NOT YET BEGUN IS NOT "UPDATED". It fills up and is re-planned for hours before it opens,
 * and a push per change would be noise about something nobody has started (072 FR-018's rule for
 * the change note). Withdrawal is told whatever the round's state: work the driver expected is gone.
 *
 * One "removed" per round and driver; one "updated" per change — the key carries the round's
 * `updated_at`, which every writer moves, so two edits in one transaction are one push.
 */
export async function enqueueRoundChanged(tx: Queryable, roundId: string, driverId: string): Promise<void> {
  await tx.query(
    `INSERT INTO public.notification_request
         (recipient_sub, audience, type, channel, payload, dedupe_key)
     SELECT d.cognito_sub, 'driver', w.type, 'push',
            jsonb_build_object('entityId', dr.id::text, 'deepLink', 'effy://run/' || dr.id::text),
            w.type || ':push:' || d.cognito_sub || ':' || dr.id::text ||
              CASE WHEN w.type = 'run_changed'
                   THEN ':' || (extract(epoch FROM dr.updated_at) * 1000)::bigint::text ELSE '' END
       FROM public.driver_round dr
       JOIN public.driver d ON d.id = $2
      CROSS JOIN LATERAL (
        SELECT CASE WHEN dr.status = 'cancelled' OR dr.driver_id IS DISTINCT FROM d.id THEN 'run_withdrawn'
                    WHEN dr.status = 'in_progress' THEN 'run_changed' END AS type
      ) w
      WHERE dr.id = $1
        AND w.type IS NOT NULL
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [roundId, driverId],
  );
}

/** How long before a round opens its driver is told it is about to (backlog D2). */
export const OPENS_SOON_LEAD_MIN = 15;

/**
 * "Run opens soon" for every round that opens within [OPENS_SOON_LEAD_MIN] of [now] (backlog D2).
 * Run by each planning pass (every five minutes), so the push lands 10–15 minutes ahead; once per
 * round and driver. The opening is `round_opens_at`'s — the one definition (072).
 */
export async function enqueueRoundsOpeningSoon(tx: Queryable, now: Date): Promise<void> {
  await tx.query(
    `INSERT INTO public.notification_request
         (recipient_sub, audience, type, channel, payload, dedupe_key)
     SELECT d.cognito_sub, 'driver', 'run_opens_soon', 'push',
            jsonb_build_object('entityId', r.id::text, 'deepLink', 'effy://run/' || r.id::text),
            'run_opens_soon:push:' || d.cognito_sub || ':' || r.id::text
       FROM (
         SELECT dr.id, dr.driver_id,
                public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens
           FROM public.driver_round dr
          WHERE dr.status = 'planned'
       ) r
       JOIN public.driver d ON d.id = r.driver_id
      WHERE r.opens > $1::timestamptz
        AND r.opens <= $1::timestamptz + make_interval(mins => $2)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [now.toISOString(), OPENS_SOON_LEAD_MIN],
  );
}
