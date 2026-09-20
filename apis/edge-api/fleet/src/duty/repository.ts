// Duty visibility (056 US4): raw parameterized SQL, no ORM.
//
// ⚠ WHY THIS SCREEN EXISTS, AND WHY IT SURVIVED THE TEARDOWN. It was built to make an automatic
// assignment decision observable — a design that decides on its own is only safe if a human can see
// what it decided. The deciding half is gone; the observing half is not only still correct but is now
// the only place at Effy that can answer "is anybody working, and how much is piling up".
//
// ⚠ WHAT IT NO LONGER SHOWS: per-driver run progress (which run, how many stops done, next stop).
// Those columns read `driver_run` / `collection_task` / `delivery_task`, which the work-model teardown
// dropped. They are not stubbed to zero — a progress bar that is always empty is worse than no
// progress bar, because it reads as "this driver is doing nothing" rather than "nothing here knows".
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

/**
 * Who is on duty, and since when (FR-034, FR-035).
 *
 * ⚠ A driver on duty with nothing to do is a first-class row, not an omission — "on duty and idle
 * while work is waiting" is one of the two states this screen exists to expose, and after the
 * teardown it is the state EVERY on-duty driver is in.
 */
export async function listOnDuty(): Promise<OnDutyDriver[]> {
  const res = await query<OnDutyRow>(
    `SELECT d.id         AS driver_id,
            d.name       AS driver_name,
            z.name       AS zone_name,
            s.id         AS session_id,
            s.started_at AS on_duty_since,
            s.expected_end_at,
            -- ⚠ 061: an overrun is VISIBLE, not alarming. A driver still working past their expected
            -- finish is ordinary; a driver who never said is NOT overrunning, which is why this is
            -- false rather than true when expected_end_at is NULL.
            (s.expected_end_at IS NOT NULL AND s.expected_end_at < now()) AS past_expected_end,
            (s.started_at < now() - make_interval(hours => $1::int)) AS overdue
       FROM public.driver_duty_session s
       JOIN public.driver d             ON d.id = s.driver_id
       LEFT JOIN public.delivery_zone z ON z.id = d.delivery_zone_id
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
    // ⚠ null means the driver did not say. The console renders "unknown" — never a default (FR-033).
    expectedEndAt: r.expected_end_at ? r.expected_end_at.toISOString() : null,
    pastExpectedEnd: r.past_expected_end,
    overdue: r.overdue,
  }));
}

/**
 * Work that is ready and has nobody to do it (FR-036).
 *
 * ⚠ THIS USED TO BE PINNED TO THE SWEEP'S OWN CANDIDATE PREDICATES so the screen could not disagree
 * with what the sweep actually saw. There is no sweep, so there is nothing to agree with, and the
 * predicates in drivers/sql.ts now mean the plain backlog — see the comments there. Until dispatch is
 * rebuilt these numbers only ever grow, which is the point of showing them.
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
 * ⚠ The driver becomes ineligible immediately. With the work model gone this ends a session and
 * nothing else; when dispatch is rebuilt, whatever it does with a stood-down driver's claimed work is
 * that slice's decision to make, and the rule 056 established still holds — goods already in a van are
 * never silently discarded.
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
