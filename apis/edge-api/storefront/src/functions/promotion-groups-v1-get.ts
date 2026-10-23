// Everyone-audience promotions only; signed-in clients ask commerce for their own.
import { ConnectionLimitError, json, preamble, shopperHandler, unavailable } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { promotionService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    const keys = (event.queryStringParameters?.keys ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 12);
    return cacheable(json(200, { groups: await promotionService.groups(keys) }, scope), "listing");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: promotion groups read failed");
    return unavailable(scope);
  }
});
