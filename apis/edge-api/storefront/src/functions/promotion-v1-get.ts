// GET /storefront/v1/promotions/{id} — one advertised promotion in full. Public.
//
// ⚠ NOT cacheable, unlike the reads beside it: the answer depends on the moment (expiry, exhaustion
// by other shoppers), and a cached "live" response for a promotion that has since ended is exactly
// what this route exists to prevent. A promotion that exists but is not advertised is 404.
import { json, notFound, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { promotionService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    const promo = await promotionService.promotion(event.pathParameters?.id ?? "");
    return promo ? json(200, promo, scope) : notFound(scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: promotion read failed");
    return unavailable(scope);
  }
});
