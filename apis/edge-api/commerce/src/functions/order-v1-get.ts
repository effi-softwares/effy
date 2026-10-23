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
