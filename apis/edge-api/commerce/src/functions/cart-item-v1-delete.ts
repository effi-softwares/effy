// DELETE /commerce/v1/cart/items/{productId}?changeId= — remove a line. Removing one already gone
// is not an error.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, pathParam, queryParam } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const changeId = changeIdOf(queryParam(event, "changeId"));
  if (changeId === null) return validationFailed(scope, "changeId must be a uuid");
  return respond(scope, () => cartService.remove(customer.id, pathParam(event, "productId"), changeId));
});
