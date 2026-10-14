// GET /storefront/v1/suggestions?q= — phrases and products for the text typed so far. Public.
//
// Under two characters answers empty lists (not an error: the field is still being typed in).
// Cached for a minute: the same few characters are typed by many shoppers.
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { badRequest, queryOf } from "../lib/request";
import { suggestService } from "../lib/wiring";
import { SUGGEST_MAX_CHARS } from "../suggest/service";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  const q = (queryOf(event).get("q") ?? "").trim();
  if (q.length > SUGGEST_MAX_CHARS) return badRequest("query_too_long", scope.requestId);

  try {
    return cacheable(json(200, await suggestService.suggest(q), scope), "suggestions");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: suggestions read failed");
    return unavailable(scope);
  }
});
