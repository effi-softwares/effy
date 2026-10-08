import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { pointsService } from "../points/service";

/**
 * GET /customer/v1/points?cursor=&limit= — the caller's usable points, their value, the next expiry,
 * and a page of history, newest first (074 US1). Scoped to the caller's own record from the token.
 *
 * ⚠ ONE ROUTE FOR BOTH, deliberately: every points screen shows both, and the shared gateway was at
 * its route and integration ceilings when this shipped (see CustomerPointsDTO).
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) return problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid token for the customer audience is required", scope);
  const qs = event.queryStringParameters ?? {};
  const limit = Number.isFinite(Number(qs.limit)) ? Math.trunc(Number(qs.limit)) : 20;
  try {
    return json(200, await pointsService.overview(sub, qs.cursor || undefined, limit), scope);
  } catch (err) {
    // The same refusal vocabulary as every other customer read: barred / no record → one 403.
    return addressErrorResponse(err, scope);
  }
};
