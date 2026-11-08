// The catch-up notice (110 R11, FR-031): a driver whose work was assigned while no phone of theirs could be told gets
// one notice pinned to the top of their inbox the first time they register a phone that day - "You have 2 runs today".
//
// "No phone could be told" = a `run_assigned` push from today ended `no_device` (seen in dev on 2026-11-07). The count
// is the runs dated today on Effy's clock that are still theirs. Inbox only (they are holding the phone), at most once
// per driver per day (the dedupe scope is the Effy date), pinned until the end of that day.
import { OPERATING_TZ } from "@effy/shared-types";
import type { Queryable } from "@effy/edge-shared";
import { notify } from "@effy/edge-shared/notifications";

export interface CatchUpResult {
  /** 0 when nothing was missed, nothing is left, or the notice was already given today. */
  created: number;
  runs: number;
}

export async function catchUpNotice(tx: Queryable, driverSub: string, tz: string = OPERATING_TZ): Promise<CatchUpResult> {
  const { rows } = await tx.query<{ day: string; ends: Date; missed: boolean; runs: number }>(
    `WITH today AS (SELECT (now() AT TIME ZONE $2)::date AS day)
     SELECT to_char(t.day, 'YYYY-MM-DD') AS day,
            ((t.day + 1)::timestamp AT TIME ZONE $2) AS ends,
            EXISTS (
              SELECT 1 FROM public.notification n
                JOIN public.notification_delivery d ON d.notification_id = n.id AND d.channel = 'push'
               WHERE n.recipient_sub = $1 AND n.audience = 'driver' AND n.type = 'run_assigned'
                 AND (n.created_at AT TIME ZONE $2)::date = t.day
                 AND d.status = 'no_device'
            ) AS missed,
            (SELECT count(*)::int FROM public.driver_round r
               JOIN public.driver dr ON dr.id = r.driver_id
              WHERE dr.cognito_sub = $1 AND dr.status = 'active'
                AND r.status IN ('planned', 'in_progress')
                AND (r.deadline_at AT TIME ZONE $2)::date = t.day) AS runs
       FROM today t`,
    [driverSub, tz],
  );
  const row = rows[0];
  if (!row || !row.missed || row.runs === 0) return { created: 0, runs: row?.runs ?? 0 };
  const created = await notify(tx, {
    type: "driver_runs_today",
    recipients: [{ sub: driverSub }],
    subject: { entityId: row.day, count: row.runs },
    dedupeScope: row.day,
    channels: [],
    pinnedUntil: new Date(row.ends),
  });
  return { created, runs: row.runs };
}
