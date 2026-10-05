// DELETE /commerce/v1/payment-methods/{id} — remove a kept card. 404 for both "no such card" and
// "not yours": telling them apart would reveal whether a payment-method id exists.
import { noContent } from "@effy/edge-shared";

import { checkoutError } from "../checkout/respond";
import { customerRoute, pathParam } from "../lib/route";
import { checkoutService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  try {
    await checkoutService.removeKeptCard(customer.id, pathParam(event, "id"));
    return noContent(scope);
  } catch (err) {
    return checkoutError(scope, err, "detach payment method");
  }
});
