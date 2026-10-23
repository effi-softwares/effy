// Has this round opened? Work reaches a driver hours early, and this is what stops a door being
// knocked on early (a disabled control is a courtesy). Every progressing route calls it
// (`open.guard.test.ts`). `public.round_opens_at` and the database's `now` decide.

import { problem, type Queryable, type RequestScope } from "@effy/edge-shared";
import { formatMoment } from "@effy/shared-types";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

/** Nothing has been written. */
export class RoundNotOpenError extends Error {
  constructor(readonly opensAt: string) {
    super("round_not_open");
    this.name = "RoundNotOpenError";
  }
}

const OPENS = `public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at)`;

/** Null means open (a delivery round with no window), as does any past instant. */
const ROUND_OPENING = `
  SELECT ${OPENS} AS opens_at, COALESCE(${OPENS} > now(), false) AS closed
    FROM public.driver_round dr
   WHERE dr.id = $1
`;

/** From one of the round's stops, and only when the round is this driver's. */
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
 * Call after the ownership check, so another driver's round still answers as missing. Not found is
 * not refused here. Pass the write's transaction, so check and write see the same instant.
 */
export async function assertRoundOpen(db: Queryable, roundId: string): Promise<void> {
  const res = await db.query<{ opens_at: Date | null; closed: boolean }>(ROUND_OPENING, [roundId]);
  refuseIfClosed(res.rows[0]);
}

/** For a route that knows only a stop; scoped to the driver, so it can run before the route's own lookup. */
export async function assertStopRoundOpen(db: Queryable, stopId: string, driverId: string): Promise<void> {
  const res = await db.query<{ opens_at: Date | null; closed: boolean }>(STOP_ROUND_OPENING, [stopId, driverId]);
  refuseIfClosed(res.rows[0]);
}

/**
 * 409 `round_not_open` with `opensAt` and `opensLabel` (Melbourne) as field issues, read like the
 * off-duty refusal. It always says when.
 */
export function roundNotOpenProblem(err: RoundNotOpenError, scope: RequestScope): APIGatewayProxyStructuredResultV2 {
  const label = formatMoment(err.opensAt, new Date());
  return problem(409, "round_not_open", "Not open yet", `This round opens ${label}.`, scope, [
    { field: "opensAt", message: err.opensAt },
    { field: "opensLabel", message: label },
  ]);
}
