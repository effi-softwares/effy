// POST /commerce/v1/checkout/quote — what delivery will cost and when it can arrive, for the
// shopper's current cart to one of their addresses. Reads only.
import { json, validationFailed } from "@effy/edge-shared";

import { checkoutError } from "../checkout/respond";
import { quoteForCheckout } from "../checkout/quote";
import { customerRoute, jsonBody, stringField } from "../lib/route";
import { quoteDeps } from "../lib/wiring";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  const addressId = stringField(body?.addressId);
  if (!body || addressId === null) return validationFailed(scope, "addressId is required");
  try {
    return json(200, await quoteForCheckout(quoteDeps, customer.id, addressId, new Date()), scope);
  } catch (err) {
    return checkoutError(scope, err, "quote");
  }
});
