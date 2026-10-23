// For both "no such card" and "not yours", so a card id's existence is not revealed.
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
