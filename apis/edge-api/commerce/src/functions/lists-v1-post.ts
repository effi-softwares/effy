// POST /commerce/v1/lists — create a named list, optionally placing one product in it at once.
import { json } from "@effy/edge-shared";

import { isUuid } from "../lib/ids";
import { customerRoute, jsonBody } from "../lib/route";
import { savedService } from "../lib/wiring";
import { badBody, savedError } from "../saved/respond";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  const body = jsonBody(event);
  if (!body || (body.name !== undefined && typeof body.name !== "string")) return badBody(scope, "invalid_body");
  const productId = body.productId;
  if (productId !== undefined && productId !== null) {
    if (typeof productId !== "string") return badBody(scope, "invalid_body");
    if (!isUuid(productId)) return badBody(scope, "invalid_product_id");
  }
  try {
    const list = await savedService.createList(customer.id, (body.name as string | undefined) ?? "", (productId as string | null | undefined) ?? null);
    return json(201, list, scope);
  } catch (err) {
    return savedError(scope, err, "create list");
  }
});
