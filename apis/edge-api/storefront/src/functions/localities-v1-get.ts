// GET /storefront/v1/localities?q= — the delivery-area typeahead (030). Public.
//
// Fewer than two characters is an empty list, not an error: the client asks as the shopper types.
// ⚠ A row is {name, state, postcode} and nothing else — no coordinates, no id, and no
// serviceability flag. The list must not hint the verdict.
import { json, pooled, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";
import { searchLocalities } from "@effy/edge-shared/delivery";

import { queryOf } from "../lib/request";

/** One comfortable phone sheet-height (030 R5). */
const LOCALITIES_LIMIT = 8;
const CACHE = { "cache-control": "public, max-age=86400" };

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  const q = (queryOf(event).get("q") ?? "").trim();

  // Counted in characters, not UTF-16 units.
  if ([...q].length < 2) {
    const res = json(200, { items: [] }, scope);
    return { ...res, headers: { ...res.headers, ...CACHE } };
  }

  try {
    const rows = await searchLocalities(pooled, q, LOCALITIES_LIMIT);
    const res = json(200, { items: rows.map((r) => ({ name: r.name, state: r.state, postcode: r.postcode })) }, scope);
    return { ...res, headers: { ...res.headers, ...CACHE } };
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: locality search failed");
    return unavailable(scope);
  }
});
