// Driver pushes, written to the notification outbox in the same transaction as the change.

import type { Queryable } from "@effy/edge-shared";

/**
 * "Run assigned": once per round and driver (deduped on both), so additions never repeat it and a
 * moved round tells the new driver. The payload is the round id and link only.
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
 * "Run removed" when a round is no longer theirs; "Run updated" when they are working it and its stops
 * changed (an unstarted round is not "updated"). One removed per round and driver; one updated per
 * change, keyed on `updated_at`.
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

export const OPENS_SOON_LEAD_MIN = 15;

/** "Run opens soon", once per round and driver; each pass runs it, so it lands 10–15 minutes ahead. */
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
