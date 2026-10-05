// DELETE /commerce/v1/cart?changeId= — empty the payable cart. Set-aside lines survive.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, queryParam } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const changeId = changeIdOf(queryParam(event, "changeId"));
  if (changeId === null) return validationFailed(scope, "changeId must be a uuid");
  return respond(scope, () => cartService.clear(customer.id, changeId));
});
