// POST /commerce/v1/cart/items — add to the cart (increment).
//
// ⚠ changeId is REQUIRED here and only here: add is the one cart operation that is not idempotent,
// so without it a retry after an ambiguous failure would add the item twice (027 FR-018).
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, intField, jsonBody, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const productId = stringField(body?.productId);
  const quantity = intField(body?.quantity);
  const changeId = changeIdOf(body?.changeId);
  if (!body || productId === null || quantity === null || changeId === null) {
    return validationFailed(scope, "productId, quantity and changeId are required");
  }
  if (changeId === "") return validationFailed(scope, "changeId is required");
  return respond(scope, () => cartService.add(customer.id, productId, changeId, quantity));
});
