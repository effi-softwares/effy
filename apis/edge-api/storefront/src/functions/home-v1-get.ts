// GET /storefront/v1/home — the merchandised Home: banners + product rails. Public.
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { homeService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    return json(200, await homeService.home(), scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: home read failed");
    return unavailable(scope);
  }
});
