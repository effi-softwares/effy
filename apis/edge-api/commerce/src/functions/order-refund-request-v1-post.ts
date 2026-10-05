// POST /commerce/v1/orders/{id}/refund-requests — a shopper ASKS for a refund on their own order.
//
// ⚠ IT MOVES NO MONEY and its answer must not read as a decision: it says the ask was received,
// never that a refund is coming. A person decides it, through the staff refund route.
import { ConnectionLimitError, conflict, json, notFound, unavailable, validationFailed } from "@effy/edge-shared";
import {
  MessageRequiredError, parseRefundLines, RefundOrderNotFoundError, RequestAlreadyOpenError,
} from "@effy/edge-shared/payments";

import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { refundService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  // Naming the affected lines is OPTIONAL: "the whole thing arrived warm" must still be askable.
  const items = parseRefundLines(body?.items);
  if (!body || typeof body.message !== "string" || items === null) return validationFailed(scope, "say what went wrong");

  try {
    const requestId = await refundService.raiseRequest({ orderId: pathParam(event, "id"), customerId: customer.id, message: body.message, items });
    return json(201, { requestId }, scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof MessageRequiredError) return validationFailed(scope, "say what went wrong");
    // A sentence the shopper can act on: their ask is already with us.
    if (err instanceof RequestAlreadyOpenError) return conflict(scope, "you've already told us about this order — we're looking into it");
    if (err instanceof RefundOrderNotFoundError) return notFound(scope);
    scope.log.error({ err }, "refunds: raise request failed");
    return unavailable(scope);
  }
});
