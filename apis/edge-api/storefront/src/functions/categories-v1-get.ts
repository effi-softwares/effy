// GET /storefront/v1/categories — the active category tree with counts and images. Public.
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { catalogService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  try {
    return json(200, await catalogService.categories(), scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: categories read failed");
    return unavailable(scope);
  }
});
