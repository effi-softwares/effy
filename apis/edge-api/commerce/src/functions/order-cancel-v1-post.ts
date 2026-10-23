// A full refund, allowed until a shop starts preparing; decided under the order's row lock.
import { json, notFound, refused } from "@effy/edge-shared";
import { NotCancellableError, RefundOrderNotFoundError, refundProblem } from "@effy/edge-shared/payments";

import { customerRoute, pathParam } from "../lib/route";
import { refundService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  try {
    // Already cancelled answers 200: a double-tap must not look like a failure.
    return json(200, await refundService.cancel({
      orderId: pathParam(event, "id"), customerId: customer.id, actorKind: "customer", actorSub: customer.id,
    }), scope);
  } catch (err) {
    if (err instanceof RefundOrderNotFoundError) return notFound(scope);
    if (err instanceof NotCancellableError) {
      // Must not say "never": staff can still cancel it.
      return refused(scope, 400, "not_cancellable", "someone has already started preparing this order. Contact us and we'll see what we can do.");
    }
    return refundProblem(scope, err, "customer cancel");
  }
});
