// GET /orders/v1/orders/{orderId}/delivery-move?to=courier|effy — what moving the order would do (081). Read = any active staff.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable, validationFailed } from "@effy/edge-shared";

import { deliveryMoveError, parseTo, preview } from "../delivery-move/service";
import { requireStaff } from "../lib/guard";

export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;
  const to = parseTo(event.queryStringParameters?.to);
  if (!to) return validationFailed(guard.scope, "to must be courier or effy");
  try {
    return json(200, await preview(event.pathParameters?.orderId ?? "", to), guard.scope);
  } catch (err) {
    const refusal = deliveryMoveError(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err }, "orders: delivery-move preview failed");
    return unavailable(guard.scope);
  }
};
