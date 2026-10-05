// POST /commerce/v1/cart/promo — apply a promotional code.
//
// ⚠ ROUTED FOR THE FIRST TIME BY 070 (FR-022). The rule and its tests have existed since 027 and
// both clients have always called this; the retired backend never registered the route, so every
// attempt answered 404. A refused code says WHICH reason, as its own problem type.
import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const code = stringField(jsonBody(event)?.code);
  if (code === null || code.trim() === "") return validationFailed(scope, "code is required");
  return respond(scope, () => cartService.applyPromo(customer.id, code));
});
