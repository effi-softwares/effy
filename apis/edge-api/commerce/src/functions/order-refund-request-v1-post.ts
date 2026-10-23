// A request only: it moves no money, and the answer must not read as a decision. Staff decide it.
import { ConnectionLimitError, conflict, json, notFound, unavailable, validationFailed } from "@effy/edge-shared";
import {
  MessageRequiredError, parseRefundLines, RefundOrderNotFoundError, RequestAlreadyOpenError,
} from "@effy/edge-shared/payments";

import { customerRoute, jsonBody, pathParam } from "../lib/route";
import { refundService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  // Lines are optional: "the whole thing arrived warm" must still be askable.
  const items = parseRefundLines(body?.items);
  if (!body || typeof body.message !== "string" || items === null) return validationFailed(scope, "say what went wrong");

  try {
    const requestId = await refundService.raiseRequest({ orderId: pathParam(event, "id"), customerId: customer.id, message: body.message, items });
    return json(201, { requestId }, scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof MessageRequiredError) return validationFailed(scope, "say what went wrong");
    if (err instanceof RequestAlreadyOpenError) return conflict(scope, "you've already told us about this order — we're looking into it");
    if (err instanceof RefundOrderNotFoundError) return notFound(scope);
    scope.log.error({ err }, "refunds: raise request failed");
    return unavailable(scope);
  }
});
