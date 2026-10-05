// POST /commerce/v1/orders/{id}/cancel — a shopper calls off their own order and gets everything
// back, delivery included. Allowed only until a shop starts preparing it; decided under the order's
// row lock, never from what the client last saw.
import { json, notFound, refused } from "@effy/edge-shared";
import { NotCancellableError, RefundOrderNotFoundError, refundProblem } from "@effy/edge-shared/payments";

import { customerRoute, pathParam } from "../lib/route";
import { refundService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  try {
    // ⚠ Already cancelled answers 200: a double-tap must not look like a failure.
    return json(200, await refundService.cancel({
      orderId: pathParam(event, "id"), customerId: customer.id, actorKind: "customer", actorSub: customer.id,
    }), scope);
  } catch (err) {
    // ⚠ Identical for "no such order" and "not yours": the ownership term is in the lookup itself.
    if (err instanceof RefundOrderNotFoundError) return notFound(scope);
    if (err instanceof NotCancellableError) {
      // ⚠ Must not say it can NEVER be cancelled — staff still can, and a shopper told otherwise
      // will not get in touch.
      return refused(scope, 400, "not_cancellable", "someone has already started preparing this order. Contact us and we'll see what we can do.");
    }
    return refundProblem(scope, err, "customer cancel");
  }
});
