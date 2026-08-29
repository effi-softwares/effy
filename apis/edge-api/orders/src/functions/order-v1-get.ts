import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, problem, unavailable } from "@effy/edge-shared";

import { requireStaff } from "../lib/guard";
import { NOT_FOUND, VALIDATION_FAILED } from "../lib/problems";
import { getOrder } from "../orders/service";

/**
 * GET /orders/v1/orders/{orderId} — the back-office order detail (053 US1).
 *
 * ⚠ NO OWNERSHIP SCOPING, and that is the difference between this and the customer's own
 * `GET /v1/orders/{id}` on the hot path. Staff read EVERY order; the gate is that they are staff.
 * The customer's route scopes to their own record and must keep doing so.
 */
export const handler = async (
  event: AuthedEvent,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireStaff(event, context);
  if (!guard.ok) return guard.response;

  const orderId = event.pathParameters?.orderId;
  if (!orderId) {
    return problem(400, VALIDATION_FAILED, "Missing order", "an order id is required", guard.scope);
  }

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return problem(404, NOT_FOUND, "No such order", "that order does not exist", guard.scope);
    }
    return json(200, order, guard.scope);
  } catch (err) {
    guard.scope.log.error({ err, orderId }, "orders: detail failed");
    return unavailable(guard.scope);
  }
};
