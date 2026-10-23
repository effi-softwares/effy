// Called on return from the payment provider; settles a payment whose webhook never arrived.
import { json, validationFailed } from "@effy/edge-shared";

import { checkoutError } from "../checkout/respond";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { checkoutService } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const orderId = stringField(body?.orderId);
  if (!body || orderId === null) return validationFailed(scope, "orderId is required");
  try {
    return json(200, await checkoutService.confirm(scope, customer.id, orderId), scope);
  } catch (err) {
    return checkoutError(scope, err, "confirm");
  }
});
