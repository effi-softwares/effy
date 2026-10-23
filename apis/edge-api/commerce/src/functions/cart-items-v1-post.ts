// changeId is required here only: add is the one cart operation that is not idempotent, so a
// retry without it would add the item twice.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, intField, jsonBody, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const variantId = stringField(body?.variantId);
  const quantity = intField(body?.quantity);
  const changeId = changeIdOf(body?.changeId);
  if (!body || variantId === null || quantity === null || changeId === null) {
    return validationFailed(scope, "variantId, quantity and changeId are required");
  }
  if (changeId === "") return validationFailed(scope, "changeId is required");
  return respond(scope, () => cartService.add(customer.id, variantId, changeId, quantity));
});
