import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, preamble, problem, ProblemType, subject } from "@effy/edge-shared";

import { addressErrorResponse } from "../addresses/http";
import { pointsService } from "../points/service";

/** GET /customer/v1/points/history?cursor=&limit= — every change to the caller's points, newest first (074 US1). */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const scope = preamble(event, context);
  const sub = subject(event);
  if (!sub) return problem(401, ProblemType.Unauthenticated, "Authentication required", "a valid token for the customer audience is required", scope);
  const qs = event.queryStringParameters ?? {};
  const limit = Number.isFinite(Number(qs.limit)) ? Math.trunc(Number(qs.limit)) : 20;
  try {
    return json(200, await pointsService.history(sub, qs.cursor || undefined, limit), scope);
  } catch (err) {
    return addressErrorResponse(err, scope);
  }
};
