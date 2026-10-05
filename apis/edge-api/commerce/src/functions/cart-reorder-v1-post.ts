// POST /commerce/v1/cart/reorder — put a past order's items back in the cart at CURRENT prices.
// Anything that could not be added is named in `skipped`. Someone else's order is 404, never 403.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, jsonBody, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const orderId = stringField(body?.orderId);
  const changeId = changeIdOf(body?.changeId);
  if (!body || orderId === null || changeId === null) return validationFailed(scope, "orderId is required");
  return respond(scope, () => cartService.reorder(customer.id, orderId, changeId));
});
