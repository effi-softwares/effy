// Not cacheable: expiry and exhaustion change by the moment. An unadvertised promotion is 404.
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
