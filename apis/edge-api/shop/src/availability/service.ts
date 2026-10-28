// Availability (099): read one page. The switch itself is the existing variant state route
// (products/service.ts `setVariantState`) — one writer of a size's state.
import type { AvailabilityFilter } from "@effy/shared-types";

import type { AvailabilityListRequest } from "./list";
import { readAvailability, type AvailabilityRow } from "./repository";

/**
 * The repository's order is by name, then each product's sizes in their own order: a total order, so "name"
 * keeps it (a stable sort) and "stock" sorts by count over it. Uncounted sizes sort after every counted one.
 */
function compare(sort: AvailabilityListRequest["sort"], a: AvailabilityRow, b: AvailabilityRow): number {
  if (sort !== "stock") return 0;
  const x = a.stock.tracked ? (a.stock.onHand ?? 0) : Number.POSITIVE_INFINITY;
  const y = b.stock.tracked ? (b.stock.onHand ?? 0) : Number.POSITIVE_INFINITY;
  return x === y ? 0 : x < y ? -1 : 1;
}

/** One page of the shop's sizes (103): numbered, with an exact total, and every view's count. */
export async function listAvailability(actor: { shopId: string }, req: AvailabilityListRequest) {
  const filter: AvailabilityFilter = req.filters.filter ?? "needs_look";
  const { rows, counts } = await readAvailability(actor.shopId, req.q, filter);
  const ordered = req.dir === "desc" ? [...rows].reverse() : rows;
  const sorted = req.sort === "stock" ? [...ordered].sort((a, b) => (req.dir === "desc" ? -1 : 1) * compare(req.sort, a, b)) : ordered;
  const total = sorted.length;
  const page = Math.min(req.page, Math.max(1, Math.ceil(total / req.pageSize)));
  const start = (page - 1) * req.pageSize;
  return { rows: sorted.slice(start, start + req.pageSize), total, page, counts };
}
