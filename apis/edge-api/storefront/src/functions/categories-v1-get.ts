import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { catalogService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    return cacheable(json(200, await catalogService.categories(), scope), "listing");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: categories read failed");
    return unavailable(scope);
  }
});
