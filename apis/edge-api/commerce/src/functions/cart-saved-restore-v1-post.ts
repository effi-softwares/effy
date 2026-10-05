// POST /commerce/v1/cart/saved/{productId}/restore?changeId= — move a set-aside line back into the
// payable cart. Refused if the product cannot be bought right now, exactly like an add.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, pathParam, queryParam } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const changeId = changeIdOf(queryParam(event, "changeId"));
  if (changeId === null) return validationFailed(scope, "changeId must be a uuid");
  return respond(scope, () => cartService.restoreSaved(customer.id, pathParam(event, "productId"), changeId));
});
