import { validationFailed } from "@effy/edge-shared";

import { respond } from "../cart/respond";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { cartService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const code = stringField(jsonBody(event)?.code);
  if (code === null || code.trim() === "") return validationFailed(scope, "code is required");
  return respond(scope, () => cartService.applyPromo(customer.id, code));
});
