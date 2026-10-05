import type { APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";

import type { AuthedEvent } from "@effy/edge-shared";
import { json, notFound, refused } from "@effy/edge-shared";
import { NotCancellableError, RefundOrderNotFoundError, refundProblem } from "@effy/edge-shared/payments";

import { requireWriter } from "../lib/guard";
import { refundService } from "../lib/money";

/**
 * POST /orders/v1/orders/{orderId}/cancel — back-office cancels an order (055 FR-018).
 *
 * ⚠ STAFF HAVE NO "BEFORE PICKING" LIMIT: a phone call arrives after the customer's own control
 * has closed, and someone has to be able to honour it. What nobody can do is cancel after
 * collection — the goods have left the shop and somebody is carrying them.
 *
 * Write gate admin|manager; already cancelled answers 200.
 */
export const handler = async (event: AuthedEvent, context: Context): Promise<APIGatewayProxyStructuredResultV2> => {
  const guard = await requireWriter(event, context);
  if (!guard.ok) return guard.response;

  try {
    return json(200, await refundService.cancel({
      orderId: event.pathParameters?.orderId ?? "", customerId: null, actorKind: "back_office", actorSub: guard.sub,
    }), guard.scope);
  } catch (err) {
    if (err instanceof RefundOrderNotFoundError) return notFound(guard.scope);
    if (err instanceof NotCancellableError) {
      return refused(guard.scope, 400, "not_cancellable", "someone has already started preparing this order. Contact us and we'll see what we can do.");
    }
    return refundProblem(guard.scope, err, "back-office cancel");
  }
};
