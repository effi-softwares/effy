// Duty and assignment visibility (056 US4): raw parameterized SQL, no ORM.
//
// ⚠ WHY THIS SCREEN EXISTS. Assignment on this platform is AUTOMATIC and driverless by design — 049
// settled "no dispatcher, no accept/decline", and that is the right model. But a design that decides
// on its own is only safe if a human can OBSERVE what it decided. Today nobody at Effy can see
// whether a single driver is on duty, and the only symptom of "nobody is working" is orders quietly
// not moving.
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
  run_id: string | null;
  run_type: OnDutyDriver["currentRunType"];
  completed_stops: string;
  total_stops: string;
  next_stop: string | null;
  overdue: boolean;
}

/**
 * Who is on duty, and what each of them is doing (FR-034, FR-035).
 *
 * Progress is counted from the run's own tasks rather than stored, so it cannot drift from the work.
 * ⚠ A driver on duty with NO run is a first-class row, not an omission: "on duty and idle while work
 * is waiting" is one of the two states this screen exists to expose.
 */
export async function listOnDuty(): Promise<OnDutyDriver[]> {
  const res = await query<OnDutyRow>(
    `WITH active_run AS (
       SELECT DISTINCT ON (r.driver_id)
              r.driver_id, r.id AS run_id, r.type AS run_type, r.assigned_at
         FROM public.driver_run r
        WHERE r.status IN ('assigned', 'active', 'checked_in')
        ORDER BY r.driver_id, r.assigned_at DESC
     ),
     stops AS (
       SELECT ct.run_id,
              count(*)                                                              AS total,
              count(*) FILTER (WHERE ct.status IN ('collected', 'short'))            AS done,
              min(sh.name) FILTER (WHERE ct.status IN ('assigned', 'en_route'))      AS next_label
         FROM public.collection_task ct
         LEFT JOIN public.shop sh ON sh.id = ct.shop_id
        GROUP BY ct.run_id
       UNION ALL
       SELECT dt.run_id,
              count(*),
              count(*) FILTER (WHERE dt.status IN ('delivered', 'failed')),
              min(ca.city) FILTER (WHERE dt.status NOT IN ('delivered', 'failed'))
         FROM public.delivery_task dt
         LEFT JOIN public.customer_address ca ON ca.id = dt.customer_address_id
        GROUP BY dt.run_id
     )
     SELECT d.id                        AS driver_id,
            d.name                      AS driver_name,
            z.name                      AS zone_name,
            s.id                        AS session_id,
            s.started_at                AS on_duty_since,
            ar.run_id,
            ar.run_type,
            COALESCE(st.done, 0)::text  AS completed_stops,
            COALESCE(st.total, 0)::text AS total_stops,
            st.next_label               AS next_stop,
            (s.started_at < now() - make_interval(hours => $1::int)) AS overdue
       FROM public.driver_duty_session s
       JOIN public.driver d           ON d.id = s.driver_id
       LEFT JOIN public.delivery_zone z ON z.id = d.delivery_zone_id
       LEFT JOIN active_run ar        ON ar.driver_id = d.id
       LEFT JOIN stops st             ON st.run_id = ar.run_id
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
    currentRunId: r.run_id,
    currentRunType: r.run_id ? r.run_type : null,
    completedStops: Number(r.completed_stops),
    totalStops: Number(r.total_stops),
    nextStop: r.next_stop,
    overdue: r.overdue,
  }));
}

/**
 * Work that is ready and has nobody to do it (FR-036).
 *
 * ⚠ USES THE ASSIGNMENT SWEEP'S OWN CANDIDATE PREDICATES (drivers/sql.ts), pinned by
 * assignment-parity.test.ts. If this screen derived "unassigned" its own way it would eventually
 * disagree with what the sweep actually sees, and it would be confidently wrong about the one
 * question it exists to answer.
 */
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

/**
 * End a duty session by hand (FR-037).
 *
 * ⚠ The driver becomes ineligible immediately, so the sweep returns their UN-STARTED work on its next
 * round. Anything already picked up becomes STRANDED and needs the release action — this operation
 * does not, and must not, silently discard goods in a van.
 */
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
