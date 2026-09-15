// GET /shop/v1/insights?range=today|7d|30d — the shop console's analytics (058, US3).
//
// ⚠ IT READS ONLY THE ROLLUPS (FR-026). Opening this screen must never start an aggregate over the
// shop's order history: at 500k orders a month that is the difference between a page that answers in
// milliseconds and one that gets slower every month it exists. A guard reads the repository and
// fails if it so much as names the order tables.
//
// ⚠ AWAITING PICK AND UNFULFILLED UNITS ARE NOT IN THIS PAYLOAD. They appear on this screen, but
// they are LIVE operational figures and the client takes them from /shop/v1/today — the same cache
// entry Today renders from, so the two screens cannot disagree (FR-006/FR-017).
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType } from "@effy/edge-shared";

import { readClock } from "../today/repository";
import { DEFAULT_TIMEZONE } from "../today/service";
import { gate, mapTodayError } from "../today/handler-support";
import { InvalidRangeError, parseRange, readInsights } from "../insights/service";

export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const g = await gate(event, scope);
  if ("deny" in g) return g.deny;

  try {
    const range = parseRange(event.queryStringParameters?.range);
    const clock = await readClock(g.actor.shopId);
    if (clock.timezone === null && clock.rawTimezone !== "") {
      // Recorded, not silently absorbed: every bucket boundary on this screen hangs off the zone.
      scope.log.warn(
        { shopId: g.actor.shopId, timezone: clock.rawTimezone },
        "insights: unrecognised shop timezone, using the platform default",
      );
    }
    const dto = await readInsights(
      { shopId: g.actor.shopId },
      range,
      clock.timezone ?? DEFAULT_TIMEZONE,
      clock.now,
    );
    return json(200, dto, scope);
  } catch (err) {
    if (err instanceof InvalidRangeError) {
      return problem(
        400,
        ProblemType.ValidationFailed,
        "Validation failed",
        "range must be one of today, 7d, 30d",
        scope,
        [{ field: "range", message: "must be one of today, 7d, 30d" }],
      );
    }
    return mapTodayError(err, scope);
  }
};
