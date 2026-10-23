// Who is on duty, and how much work is waiting for nobody.
import { query, withTransaction } from "@effy/edge-shared";
import type { OnDutyDriver, UnassignedWorkSummary } from "@effy/shared-types";

import { dutyOverdueHours } from "../shared/config";
import { READY_TO_COLLECT, READY_TO_DELIVER } from "../drivers/sql";

interface OnDutyRow {
  driver_id: string;
  driver_name: string;
  zone_name: string | null;
  session_id: string;
  on_duty_since: Date;
  expected_end_at: Date | null;
  past_expected_end: boolean;
  overdue: boolean;
}

/** On duty with nothing to do is a first-class row. */
export async function listOnDuty(): Promise<OnDutyDriver[]> {
  const res = await query<OnDutyRow>(
    `SELECT d.id         AS driver_id,
            d.name       AS driver_name,
            z.name       AS zone_name,
            s.id         AS session_id,
            s.started_at AS on_duty_since,
            s.expected_end_at,
            -- ⚠ an overrun is VISIBLE, not alarming. A driver still working past their expected
            -- finish is ordinary; a driver who never said is NOT overrunning, which is why this is
            -- false rather than true when expected_end_at is NULL.
            (s.expected_end_at IS NOT NULL AND s.expected_end_at < now()) AS past_expected_end,
            (s.started_at < now() - make_interval(hours => $1::int)) AS overdue
       FROM public.driver_duty_session s
       JOIN public.driver d             ON d.id = s.driver_id
       -- ⚠ a driver's zone line is DERIVED from clearances now. "Every zone" when they hold an
       -- every-zone grant, the zone's name when they cover exactly one, otherwise a count. The old
       -- single-zone column could not express any of the three.
       LEFT JOIN LATERAL (
         SELECT CASE
                  WHEN bool_or(c.zone_id IS NULL) THEN 'Every zone'
                  WHEN count(DISTINCT cz.name) = 1 THEN min(cz.name)
                  WHEN count(DISTINCT cz.name) > 1 THEN count(DISTINCT cz.name)::text || ' zones'
                END AS name
           FROM public.driver_zone_capability c
           LEFT JOIN public.delivery_zone cz ON cz.id = c.zone_id
          WHERE c.driver_id = d.id AND (c.zone_id IS NULL OR cz.status = 'active')
       ) z ON TRUE
      WHERE s.ended_at IS NULL
      ORDER BY s.started_at ASC`,
    [dutyOverdueHours()],
  );

  return res.rows.map((r) => ({
    driverId: r.driver_id,
    driverName: r.driver_name,
    zone: r.zone_name,
    sessionId: r.session_id,
    onDutySince: r.on_duty_since.toISOString(),
    // null means the driver did not say; the console renders "unknown".
    expectedEndAt: r.expected_end_at ? r.expected_end_at.toISOString() : null,
    pastExpectedEnd: r.past_expected_end,
    overdue: r.overdue,
  }));
}

/** Work that is ready and has nobody to do it. */
export async function unassignedWork(): Promise<UnassignedWorkSummary> {
  const res = await query<{ collect: string; deliver: string; on_duty: string }>(
    `SELECT (SELECT count(*) FROM (${READY_TO_COLLECT}) c)::text AS collect,
            (SELECT count(*) FROM (${READY_TO_DELIVER}) v)::text AS deliver,
            (SELECT count(*) FROM public.driver d
              WHERE d.status = 'active'
                AND EXISTS (SELECT 1 FROM public.driver_duty_session s
                             WHERE s.driver_id = d.id AND s.ended_at IS NULL))::text AS on_duty`,
  );
  const r = res.rows[0];
  return {
    readyToCollect: Number(r?.collect ?? 0),
    readyToDeliver: Number(r?.deliver ?? 0),
    driversOnDuty: Number(r?.on_duty ?? 0),
  };
}

export type EndSessionOutcome = "ended" | "not_found" | "already_ended";

/** The driver becomes ineligible at once; goods already in a van are never silently discarded. */
export async function endSession(
  sessionId: string,
  write: (tx: import("pg").PoolClient, driverId: string) => Promise<void>,
): Promise<EndSessionOutcome> {
  return withTransaction(async (tx) => {
    const res = await tx.query<{ driver_id: string }>(
      `UPDATE public.driver_duty_session
          SET ended_at = now()
        WHERE id = $1 AND ended_at IS NULL
        RETURNING driver_id`,
      [sessionId],
    );
    const driverId = res.rows[0]?.driver_id;
    if (driverId) {
      await write(tx, driverId);
      return "ended";
    }
    const exists = await tx.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.driver_duty_session WHERE id = $1) AS ok`,
      [sessionId],
    );
    return exists.rows[0]?.ok ? "already_ended" : "not_found";
  });
}
