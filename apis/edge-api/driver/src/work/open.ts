// Has this round opened? (072) — the one place the driver service asks.
//
// ⚠ WORK IS NOW ASSIGNED THE MOMENT A DRIVER CAN TAKE IT, hours before it can be done. A 5–7 pm
// delivery is on a driver's phone at 2 pm. What stops them knocking on a door three hours early is
// THIS — not a disabled button. The app disables its controls too, but a control is a courtesy: an
// old build, a retried request or a second device would walk straight past it (FR-024).
//
// ⚠ ONE FUNCTION, CALLED BY EVERY ROUTE THAT PROGRESSES A ROUND. Seven routes each writing their own
// comparison is seven chances to get it wrong, and the eighth route would have none.
// `open.guard.test.ts` reads the service's routes from serverless.yml and fails naming any that
// moves a round without calling this.
//
// ⚠ THE OPENING TIME IS THE DATABASE'S, AND SO IS THE CLOCK. `public.round_opens_at` is the single
// definition the planner and the dispatch console also read, and it is compared to the database's
// `now()` — not this Lambda's clock, and never the phone's.

import { problem, type Queryable, type RequestScope } from "@effy/edge-shared";
import { formatMoment } from "@effy/shared-types";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

/** Raised when a driver acts on a round before it opens. Nothing has been written. */
export class RoundNotOpenError extends Error {
  constructor(readonly opensAt: string) {
    super("round_not_open");
    this.name = "RoundNotOpenError";
  }
}

const OPENS = `public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at)`;

/** ⚠ NULL means open (a delivery round with no window); so does any instant not in the future. */
const ROUND_OPENING = `
  SELECT ${OPENS} AS opens_at, COALESCE(${OPENS} > now(), false) AS closed
    FROM public.driver_round dr
   WHERE dr.id = $1
`;

/** The same, found from one of the round's stops — and only when the round is this driver's. */
const STOP_ROUND_OPENING = `
  SELECT ${OPENS} AS opens_at, COALESCE(${OPENS} > now(), false) AS closed
    FROM public.round_stop   rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE rs.id = $1
     AND dr.driver_id = $2
`;

function refuseIfClosed(row: { opens_at: Date | null; closed: boolean } | undefined): void {
  if (row?.closed && row.opens_at) throw new RoundNotOpenError(row.opens_at.toISOString());
}

/**
 * Refuse unless the round has opened.
 *
 * ⚠ CALL IT AFTER THE OWNERSHIP CHECK. A round that is not the caller's must go on answering exactly
 * as one that does not exist (FR-038, 052); "not open yet" for somebody else's round would tell the
 * caller the id is real. A round that is not found here is simply not refused — the caller's own
 * not-found answer is the one that stands.
 *
 * Pass the transaction the write runs on, so the check and the write see the same instant.
 */
export async function assertRoundOpen(db: Queryable, roundId: string): Promise<void> {
  const res = await db.query<{ opens_at: Date | null; closed: boolean }>(ROUND_OPENING, [roundId]);
  refuseIfClosed(res.rows[0]);
}

/**
 * The same, for a route that knows only a stop. Scoped to the driver, so it can be called BEFORE the
 * route's own lookup without becoming an oracle: a stop that is not theirs matches nothing here and
 * is not refused.
 */
export async function assertStopRoundOpen(db: Queryable, stopId: string, driverId: string): Promise<void> {
  const res = await db.query<{ opens_at: Date | null; closed: boolean }>(STOP_ROUND_OPENING, [stopId, driverId]);
  refuseIfClosed(res.rows[0]);
}

/**
 * The answer every gated route gives: 409, type `round_not_open`, with the instant (`opensAt`) and
 * the same moment in words (`opensLabel`, Melbourne time) as field issues — the carrier the off-duty
 * refusal uses for its package list, so the app reads both the same way. ⚠ It SAYS WHEN (FR-025);
 * "not yet" with no time is a dead end.
 */
export function roundNotOpenProblem(err: RoundNotOpenError, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  const label = formatMoment(err.opensAt, new Date());
  return problem(409, "round_not_open", "Not open yet", `This round opens ${label}.`, scope, [
    { field: "opensAt", message: err.opensAt },
    { field: "opensLabel", message: label },
  ]);
}
