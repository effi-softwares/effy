import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json } from "@effy/edge-shared";

import { pointsProblem } from "../customers/respond";
import { customerService } from "../customers/service";
import { requireStaff } from "../lib/guard";

/** GET /orders/v1/customers/{customerId} — who they are, their points, their last orders (074). Read = any active staff. */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  try {
    return json(200, await customerService.detail(event.pathParameters?.customerId ?? ""), guard.scope);
  } catch (err) {
    return pointsProblem(guard.scope, err, "customer detail");
  }
};
