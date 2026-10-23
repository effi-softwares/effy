// A provider failure is a 500, never an empty list: "no cards" and "could not ask" differ.
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
