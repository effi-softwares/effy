// Sets an absolute quantity, so a repeat is harmless; zero or less removes the line.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, intField, jsonBody, pathParam } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const quantity = intField(body?.quantity);
  const changeId = changeIdOf(body?.changeId);
  if (!body || quantity === null || changeId === null) return validationFailed(scope, "quantity is required");
  return respond(scope, () => cartService.setQty(customer.id, pathParam(event, "variantId"), changeId, quantity));
});
