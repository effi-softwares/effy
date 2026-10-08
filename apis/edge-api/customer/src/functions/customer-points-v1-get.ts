import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { pointsService } from "../points/service";

/**
 * GET /customer/v1/points — the caller's usable points, their money value and the next expiry (074 US1).
 * Scoped to the caller's own record from the token subject.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) return problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid token for the customer audience is required", scope);
  try {
    return json(200, await pointsService.balance(sub), scope);
  } catch (err) {
    // The same refusal vocabulary as every other customer read: barred / no record → one 403.
    return addressErrorResponse(err, scope);
  }
};
