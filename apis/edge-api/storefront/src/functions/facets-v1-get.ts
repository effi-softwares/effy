// The products route's filters without paging, so the counts match the grid.
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { attributeFacets, badRequest, nonEmptyValues, queryOf, validPrice } from "../lib/request";
import { facetService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  const q = queryOf(event);

  const minPrice = q.get("minPrice") ?? "";
  const maxPrice = q.get("maxPrice") ?? "";
  if (!validPrice(minPrice) || !validPrice(maxPrice)) return badRequest("invalid_price", scope.requestId);

  try {
    const facets = await facetService.facets({
      q: (q.get("q") ?? "").trim(),
      categoryKey: q.get("categoryKey") ?? "",
      minPrice,
      maxPrice,
      saleOnly: q.get("saleOnly") === "true",
      brands: nonEmptyValues(q.getAll("brand")) ?? [],
      attributes: attributeFacets(q) ?? {},
    });
    return cacheable(json(200, facets, scope), "listing");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    scope.log.error({ err }, "storefront: facets read failed");
    return unavailable(scope);
  }
});
