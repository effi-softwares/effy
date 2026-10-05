// GET /storefront/v1/products — two modes on one route. Public.
//
//   ?ids=a,b,c           hydrate a specific set (recently viewed), preserving the caller's order.
//   ?q=&categoryKey=…    search/browse with filters, an ordering, a total, and keyset paging.
//
// `brand` and `attr.<key>` may repeat (OR within one, AND across).
import { json, preamble, shopperHandler, unavailable, ConnectionLimitError } from "@effy/edge-shared";

import { attributeFacets, badRequest, nonEmptyValues, queryOf, splitCsv, validPrice } from "../lib/request";
import { parseSort, SORT_NEWEST } from "../search/cursor";
import { CursorSortMismatchError } from "../search/service";
import { searchService } from "../lib/wiring";

export const handler = shopperHandler(async (event, context) => {
  const scope = preamble(event, context);
  const q = queryOf(event);

  try {
    const idsParam = (q.get("ids") ?? "").trim();
    if (idsParam !== "") {
      const items = await searchService.cardsByIds(splitCsv(idsParam));
      // An id-hydration is a fixed set: nothing more to page, and the total is the set itself.
      return json(200, { items, nextCursor: null, total: items.length, sort: SORT_NEWEST }, scope);
    }

    const sort = parseSort(q.get("sort"));
    if (!sort) return badRequest("invalid_sort", scope.requestId);

    // A price bound that is not a number is the caller's error, not an outage (070 FR-025).
    const minPrice = q.get("minPrice") ?? "";
    const maxPrice = q.get("maxPrice") ?? "";
    if (!validPrice(minPrice) || !validPrice(maxPrice)) return badRequest("invalid_price", scope.requestId);

    const limit = Number.parseInt(q.get("limit") ?? "", 10);

    const result = await searchService.search({
      q: (q.get("q") ?? "").trim(),
      categoryKey: q.get("categoryKey") ?? "",
      minPrice,
      maxPrice,
      saleOnly: q.get("saleOnly") === "true",
      brands: nonEmptyValues(q.getAll("brand")) ?? [],
      attributes: attributeFacets(q) ?? {},
      sort,
      cursor: q.get("cursor") ?? "",
      limit: Number.isNaN(limit) ? 0 : limit,
    });
    return json(200, result, scope);
  } catch (err) {
    if (err instanceof ConnectionLimitError) throw err;
    if (err instanceof CursorSortMismatchError) return badRequest("cursor_sort_mismatch", scope.requestId);
    scope.log.error({ err }, "storefront: search failed");
    return unavailable(scope);
  }
});
