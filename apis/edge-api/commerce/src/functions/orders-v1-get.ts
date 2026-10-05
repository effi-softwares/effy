// GET /commerce/v1/orders — the shopper's order history, newest first.
import { ConnectionLimitError, internal, json } from "@effy/edge-shared";

import { customerRoute } from "../lib/route";
import { ordersService } from "../lib/wiring";

export const handler = customerRoute(async ({ scope, customer }) => {
  try {
    return json(200, await ordersService.list(customer.id), scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "orders: list failed");
    return internal(scope);
  }
});
