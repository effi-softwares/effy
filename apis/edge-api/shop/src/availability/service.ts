// Availability (099): parse the query and read one page. The switch itself is the existing variant
// state route (products/service.ts `setVariantState`) — one writer of a size's state.
import { AVAILABILITY_FILTERS, type AvailabilityFilter } from "@effy/shared-types";

import { readAvailability, type AvailabilityPage } from "./repository";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export interface AvailabilityQuery {
  q: string | null;
  filter: AvailabilityFilter;
  offset: number;
  limit: number;
}

/** Lenient, like the orders list: an unknown value is the default, never a 400. */
export function parseAvailabilityQuery(qs: Record<string, string | undefined> | null): AvailabilityQuery {
  const p = qs ?? {};
  const q = (p.q ?? "").trim().slice(0, 100);
  const filter = (AVAILABILITY_FILTERS as readonly string[]).includes(p.filter ?? "") ? (p.filter as AvailabilityFilter) : "all";
  const offset = Number.parseInt(p.after ?? "0", 10);
  const limit = Number.parseInt(p.limit ?? String(DEFAULT_LIMIT), 10);
  return {
    q: q === "" ? null : q,
    filter,
    offset: Number.isFinite(offset) && offset > 0 ? Math.min(offset, 100_000) : 0,
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
  };
}

export function listAvailability(actor: { shopId: string }, q: AvailabilityQuery): Promise<AvailabilityPage> {
  return readAvailability(actor.shopId, q.q, q.filter, q.offset, q.limit);
}
