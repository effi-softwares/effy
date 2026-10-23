import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { homeService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    return cacheable(json(200, await homeService.home(), scope), "listing");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: home read failed");
    return unavailable(scope);
  }
});
