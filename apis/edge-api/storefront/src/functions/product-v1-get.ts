// GET /storefront/v1/products/{id} — the product page. Public. An unknown, inactive or malformed
// id is 404: a shopper following a stale link is told the product is not there, not that the
// service is down.
import { json, notFound, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { catalogService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    const detail = await catalogService.productDetail(event.pathParameters?.id ?? "");
    return detail ? json(200, detail, scope) : notFound(scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: product detail failed");
    return unavailable(scope);
  }
});
