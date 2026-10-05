// Service layer for search: paging, sort fallback, the cursor contract. No HTTP, no SQL.
import type { ProductSearchResultDTO, ProductSort, StorefrontProductCardDTO } from "@effy/shared-types";

import { toCards, type Presign } from "../lib/cards";
import { isUuid } from "../lib/request";
import { decodeCursor, encodeCursor, SORT_NEWEST, type Cursor } from "./cursor";
import type { SearchParams } from "./filters";
import type { SearchRepository, SearchRow } from "./repository";

export const SEARCH_LIMIT = 24;
const MAX_LIMIT = 50;

/**
 * A caller paging with a cursor issued under a different ordering. Refused, not reinterpreted —
 * see `Cursor` for why reinterpreting corrupts the result set silently.
 */
export class CursorSortMismatchError extends Error {
  constructor() {
    super("storefront: cursor was issued for a different sort");
    this.name = "CursorSortMismatchError";
  }
}

/** The search request (019 US4, 025 US1). */
export interface SearchQuery {
  q: string;
  categoryKey: string;
  minPrice: string;
  maxPrice: string;
  saleOnly: boolean;
  brands: readonly string[];
  attributes: Readonly<Record<string, readonly string[]>>;
  sort: ProductSort;
  /** The opaque token the client echoed back; empty for the first page. */
  cursor: string;
  limit: number;
}

/** The keyset position's sort-column value for `row`, as text. */
export function cursorKeyFor(sort: ProductSort, row: SearchRow): string {
  switch (sort) {
    case "price_asc":
    case "price_desc":
      return row.price_amount; // already text — money never round-trips through a float
    case "relevance":
      // The driver parsed the database's own text form of the real; printing it back yields a
      // value that casts to the same real.
      return String(row.score);
    default:
      return row.created_at_key;
  }
}

export function createSearchService(repo: SearchRepository, presign?: Presign) {
  return {
    /**
     * One page plus the total across all pages. A malformed cursor restarts from the first page; a
     * cursor from a different sort is `CursorSortMismatchError` (the handler 400s).
     */
    async search(q: SearchQuery): Promise<ProductSearchResultDTO> {
      // Out of range falls back to the default rather than clamping — the long-standing behaviour.
      const limit = q.limit <= 0 || q.limit > MAX_LIMIT ? SEARCH_LIMIT : q.limit;

      // Relevance orders by trigram similarity to the query text; with no text every row scores
      // identically and the order would be arbitrary. Fall back and REPORT it, so the client's
      // sort control reflects what the server actually did.
      const sort: ProductSort = q.sort === "relevance" && q.q === "" ? SORT_NEWEST : q.sort;

      let cursor: Cursor | null = null;
      if (q.cursor !== "") {
        const decoded = decodeCursor(q.cursor);
        if (decoded && decoded.sort !== sort) throw new CursorSortMismatchError();
        cursor = decoded; // malformed → null → first page
      }

      const params: SearchParams = {
        q: q.q, categoryKey: q.categoryKey, minPrice: q.minPrice, maxPrice: q.maxPrice,
        saleOnly: q.saleOnly, brands: q.brands, attributes: q.attributes, sort, cursor,
        limit: limit + 1,
      };

      const [fetched, total] = await Promise.all([repo.searchCards(params), repo.countCards(params)]);

      let rows = fetched;
      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const last = rows[limit - 1]!;
        rows = rows.slice(0, limit);
        nextCursor = encodeCursor({ sort, key: cursorKeyFor(sort, last), id: last.id });
      }

      return { items: await toCards(rows, presign), nextCursor, total, sort };
    },

    /**
     * Hydrate a recently-viewed id list, preserving the caller's order and dropping ids that are
     * no longer active. An id that is not a uuid can match nothing, so it is dropped before the
     * database is asked — a stale or mangled entry in a device's history must not fail the rail.
     */
    async cardsByIds(ids: readonly string[]): Promise<StorefrontProductCardDTO[]> {
      const valid = ids.filter(isUuid);
      if (valid.length === 0) return [];
      const byId = new Map((await toCards(await repo.cardsByIds(valid), presign)).map((c) => [c.id, c]));
      return valid.flatMap((id) => byId.get(id.toLowerCase()) ?? byId.get(id) ?? []);
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
