// The products route's filters without paging, so the counts match the grid.
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { attributeFacets, badRequest, nonEmptyValues, queryOf, validPrice } from "../lib/request";
import { facetService } from "../lib/wiring";
import { rangeParams } from "../search/ranges";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  const q = queryOf(event);

  const minPrice = q.get("minPrice") ?? "";
  const maxPrice = q.get("maxPrice") ?? "";
  if (!validPrice(minPrice) || !validPrice(maxPrice)) return badRequest("invalid_price", scope.requestId);
  const ranges = rangeParams(q);
  if (ranges === "invalid") return badRequest("invalid_range", scope.requestId);

  try {
    const facets = await facetService.facets({
      q: (q.get("q") ?? "").trim(),
      categoryKey: q.get("categoryKey") ?? "",
      minPrice,
      maxPrice,
      saleOnly: q.get("saleOnly") === "true",
      brands: nonEmptyValues(q.getAll("brand")) ?? [],
      attributes: attributeFacets(q) ?? {},
      ranges: ranges ?? {},
    });
    return cacheable(json(200, facets, scope), "listing");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: facets read failed");
    return unavailable(scope);
  }
});
