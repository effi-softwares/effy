// POST /orders/v1/orders/{orderId}/delivery-move — move an order to courier delivery with compensation, or back to Effy (081). Write = admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable, validationFailed } from "@effy/edge-shared";

import { deliveryMoveError, move } from "../delivery-move/service";
import { requireWriter } from "../lib/guard";

/**
 * ⚠ WRITE GATE: an ACTIVE staff record holding admin|manager, read from `admin.staff` — never from the
 * token. A customer-service agent can preview and read the history, never move (FR-021).
 *
 * ⚠ ONE TRANSACTION for the move and its compensation; a refund is recorded in it and submitted after.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(event.body ?? "");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return validationFailed(guard.scope, "a valid move request is required");
  }

  try {
    return json(200, await move(event.pathParameters?.orderId ?? "", body, guard.sub), guard.scope);
  } catch (err) {
    const refusal = deliveryMoveError(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err }, "orders: delivery move failed");
    return unavailable(guard.scope);
  }
};
