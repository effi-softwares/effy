// ?ids=a,b,c hydrates a set in the caller's order; otherwise search with filters, a total and keyset
// paging. `brand` and `attr.<key>` may repeat (OR within one key, AND across keys); `range.<key>=<min>..<max>`
// filters a number attribute in its facet's unit.
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { cacheable } from "../lib/cache";
import { attributeFacets, badRequest, nonEmptyValues, queryOf, splitCsv, validPrice } from "../lib/request";
import { parseSort, SORT_NEWEST } from "../search/cursor";
import { rangeParams } from "../search/ranges";
import { CursorSortMismatchError } from "../search/service";
import { searchService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  const q = queryOf(event);

  try {
    const idsParam = (q.get("ids") ?? "").trim();
    if (idsParam !== "") {
      const items = await searchService.cardsByIds(splitCsv(idsParam));
      return cacheable(json(200, { items, nextCursor: null, total: items.length, sort: SORT_NEWEST }, scope), "listing");
    }

    const sort = parseSort(q.get("sort"));
    if (!sort) return badRequest("invalid_sort", scope.requestId);

    // A non-numeric price bound is the caller's error, not an outage.
    const minPrice = q.get("minPrice") ?? "";
    const maxPrice = q.get("maxPrice") ?? "";
    if (!validPrice(minPrice) || !validPrice(maxPrice)) return badRequest("invalid_price", scope.requestId);

    const ranges = rangeParams(q);
    if (ranges === "invalid") return badRequest("invalid_range", scope.requestId);

    const limit = Number.parseInt(q.get("limit") ?? "", 10);

    const result = await searchService.search({
      q: (q.get("q") ?? "").trim(),
      categoryKey: q.get("categoryKey") ?? "",
      minPrice,
      maxPrice,
      saleOnly: q.get("saleOnly") === "true",
      brands: nonEmptyValues(q.getAll("brand")) ?? [],
      attributes: attributeFacets(q) ?? {},
      ranges: ranges ?? {},
      sort,
      cursor: q.get("cursor") ?? "",
      limit: Number.isNaN(limit) ? 0 : limit,
    });
    return cacheable(json(200, result, scope), "listing");
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof CursorSortMismatchError) return badRequest("cursor_sort_mismatch", scope.requestId);
    scope.log.error({ err }, "storefront: search failed");
    return unavailable(scope);
  }
});
