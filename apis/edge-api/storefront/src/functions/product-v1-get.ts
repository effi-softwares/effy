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
