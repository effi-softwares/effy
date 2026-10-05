// GET /commerce/v1/lists[?productId=] — every list the shopper has, default first. With a
// productId, each list also says whether it contains that product (the list chooser).
import { json } from "@effy/edge-shared";

import { isUuid } from "../lib/ids";
import { customerRoute, queryParam } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, savedError } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const productId = queryParam(event, "productId");
  if (productId !== "" && !isUuid(productId)) return badBody(scope, "invalid_product_id");
  try {
    return json(200, await savedService.lists(customer.id, productId === "" ? null : productId), scope);
  } catch (err) {
    return savedError(scope, err, "lists");
  }
});
