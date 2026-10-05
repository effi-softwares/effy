// GET /commerce/v1/payment-methods — the shopper's kept cards, read live from the provider.
//
// ⚠ A provider failure is a 500, NEVER an empty list: "you have no cards" and "we could not ask"
// are different facts, and a client cannot tell them apart from a 200 with [] (051 FR-036).
import { json } from "@effy/edge-shared";

import { checkoutError } from "../checkout/respond";
import { customerRoute } from "../lib/route";
import { checkoutService } from "../lib/wiring";

export const handler = customerRoute(async ({ scope, customer }) => {
  try {
    return json(200, { paymentMethods: await checkoutService.listKeptCards(customer.id, new Date()) }, scope);
  } catch (err) {
    return checkoutError(scope, err, "list payment methods");
  }
});
