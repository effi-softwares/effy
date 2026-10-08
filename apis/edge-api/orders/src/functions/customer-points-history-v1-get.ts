import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { pointsProblem } from "../customers/respond";
import { customerService } from "../customers/service";
import { requireStaff } from "../lib/guard";

/**
 * GET /orders/v1/customers/{customerId}/points/history — every change, newest first, with the reason,
 * the internal note and who made it (074). Read = any active staff.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const qs = event.queryStringParameters ?? {};
  const limit = Number.isFinite(Number(qs.limit)) ? Math.trunc(Number(qs.limit)) : 25;
  try {
    return json(200, await customerService.history(event.pathParameters?.customerId ?? "", qs.cursor || undefined, limit), guard.scope);
  } catch (err) {
    return pointsProblem(guard.scope, err, "points history");
  }
};
