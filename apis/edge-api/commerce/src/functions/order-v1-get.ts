// GET /commerce/v1/orders/{id} — one order's receipt. 404 for an order that does not exist AND for
// one that is not this shopper's: telling them apart would confirm an order id.
import { ConnectionLimitError, internal, json, notFound } from "@effy/edge-shared";

import { customerRoute, pathParam } from "../lib/route";
import { ordersService } from "../lib/wiring";
import { OrderNotFoundError } from "../orders/service";

export const handler = customerRoute(async ({ event, scope, customer }) => {
  try {
    return json(200, await ordersService.get(scope, customer.id, pathParam(event, "id")), scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof OrderNotFoundError) return notFound(scope);
    scope.log.error({ err }, "orders: get failed");
    return internal(scope);
  }
});
