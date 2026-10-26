import type { ProductSearchResultDTO, ProductSort, StorefrontProductCardDTO } from "@effy/shared-types";

import { toCards, type ImageAddress } from "../lib/cards";
import { isUuid } from "../lib/request";
import { decodeCursor, encodeCursor, SORT_NEWEST, type Cursor } from "./cursor";
import type { SearchParams } from "./filters";
import { toBaseRanges, type RawRange } from "./ranges";
import type { SearchRepository, SearchRow } from "./repository";

export const SEARCH_LIMIT = 24;
const MAX_LIMIT = 50;

/** Refused, not reinterpreted (see `Cursor`). */
export class CursorSortMismatchError extends Error {
  constructor() {
    super("storefront: cursor was issued for a different sort");
    this.name = "CursorSortMismatchError";
  }
}

export interface SearchQuery {
  q: string;
  categoryKey: string;
  minPrice: string;
  maxPrice: string;
  saleOnly: boolean;
  brands: readonly string[];
  attributes: Readonly<Record<string, readonly string[]>>;
  /** `range.<key>` bounds as sent, in the facet's unit. */
  ranges: Readonly<Record<string, RawRange>>;
  sort: ProductSort;
  /** Empty for the first page. */
  cursor: string;
  limit: number;
}

export function cursorKeyFor(sort: ProductSort, row: SearchRow): string {
  switch (sort) {
    case "price_asc":
    case "price_desc":
      return row.price_amount;
    case "relevance":
      // Printing the driver's parsed real yields a value that casts back to the same real.
      return String(row.score);
    default:
      return row.created_at_key;
  }
}

export function createSearchService(repo: SearchRepository, imageAddress?: ImageAddress) {
  return {
    /** A malformed cursor restarts from page one; a different sort's cursor is `CursorSortMismatchError`. */
    async search(q: SearchQuery): Promise<ProductSearchResultDTO> {
      const limit = q.limit <= 0 || q.limit > MAX_LIMIT ? SEARCH_LIMIT : q.limit;

      // Relevance with no text is arbitrary: fall back and report it, so the sort control matches.
      const sort: ProductSort = q.sort === "relevance" && q.q === "" ? SORT_NEWEST : q.sort;

      let cursor: Cursor | null = null;
      if (q.cursor !== "") {
        const decoded = decodeCursor(q.cursor);
        if (decoded && decoded.sort !== sort) throw new CursorSortMismatchError();
        cursor = decoded;
      }

      const params: SearchParams = {
        q: q.q, categoryKey: q.categoryKey, minPrice: q.minPrice, maxPrice: q.maxPrice,
        saleOnly: q.saleOnly, brands: q.brands, attributes: q.attributes,
        ranges: await toBaseRanges(q.ranges, (keys) => repo.rangeUnits(keys)), sort, cursor,
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

      return { items: await toCards(rows, imageAddress), nextCursor, total, sort };
    },

    /** Keeps the caller's order and drops inactive and non-uuid ids, so a stale history entry cannot fail the rail. */
    async cardsByIds(ids: readonly string[]): Promise<StorefrontProductCardDTO[]> {
      const valid = ids.filter(isUuid);
      if (valid.length === 0) return [];
      const byId = new Map((await toCards(await repo.cardsByIds(valid), imageAddress)).map((c) => [c.id, c]));
      return valid.flatMap((id) => byId.get(id.toLowerCase()) ?? byId.get(id) ?? []);
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
