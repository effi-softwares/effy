// Reads only the rollups, never the order tables (a guard checks). Awaiting pick and unfulfilled
// units come from /shop/v1/today, the cache entry Today renders from, so the screens agree.
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
      // Every bucket boundary depends on the zone.
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
