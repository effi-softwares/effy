// POST /orders/v1/orders/{orderId}/delivery-window — give an Effy order another window or day, with no time if staff choose the Any time window (085). Write = admin/manager.
import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, unavailable, validationFailed } from "@effy/edge-shared";

import { changeWindow, deliveryMoveError } from "../delivery-move/service";
import { requireWriter } from "../lib/guard";

/**
 * ⚠ WRITE GATE: an ACTIVE staff record holding admin|manager, read from `admin.staff` — never from the
 * token. The same gate as moving an order between Effy and courier (081).
 *
 * ⚠ ONE TRANSACTION, through `changeEffyWindow` — the same window rule and lock as checkout's hold.
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
    return validationFailed(guard.scope, "a valid request is required");
  }

  try {
    return json(200, await changeWindow(event.pathParameters?.orderId ?? "", body, guard.sub), guard.scope);
  } catch (err) {
    const refusal = deliveryMoveError(err, guard.scope);
    if (refusal) return refusal;
    guard.scope.log.error({ err }, "orders: delivery window change failed");
    return unavailable(guard.scope);
  }
};
