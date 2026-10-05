// PATCH /commerce/v1/cart/items/{productId} — set an ABSOLUTE quantity; zero or less removes the
// line. Safe to repeat: setting 3 twice is 3.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, intField, jsonBody, pathParam, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const quantity = intField(body?.quantity);
  const changeId = changeIdOf(body?.changeId);
  if (!body || quantity === null || changeId === null) return validationFailed(scope, "quantity is required");
  return respond(scope, () => cartService.setQty(customer.id, pathParam(event, "productId"), changeId, quantity));
});
