// POST /commerce/v1/cart/items/{productId}/set-aside?changeId= — move a line to "saved for later".
// It leaves the payable totals immediately.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { changeIdOf, customerRoute, pathParam, queryParam } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const changeId = changeIdOf(queryParam(event, "changeId"));
  if (changeId === null) return validationFailed(scope, "changeId must be a uuid");
  return respond(scope, () => cartService.setAside(customer.id, pathParam(event, "productId"), changeId));
});
