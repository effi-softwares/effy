// Console lists (103): ONE request shape and ONE response envelope for every back-office and shop-web list.
// The server side is `@effy/edge-shared` `parseListQuery`; the client side is `@effy/web-kit/data-table`.
// Contract: specs/103-console-data-tables/contracts/list-contract.md.

/** Rows per page a list offers. Anything else asked for is answered at the default. */
export const LIST_PAGE_SIZES = [25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: ListPageSize = 25;

/** The deepest row an offset list pages to; past it, narrowing the search is the tool. */
export const LIST_MAX_OFFSET = 10_000;
/** A keyset list counts at most this many matches; more is said as "10,000+". */
export const LIST_COUNT_CAP = 10_000;
/** The longest search text a list accepts. */
export const LIST_MAX_SEARCH = 100;

export type SortDir = "asc" | "desc";

/** The parameters every list understands, beside its own filters (flat query params on the wire). */
export interface ListQueryParams {
  q?: string;
  sort?: string;
  dir?: SortDir;
  /** Offset lists: 1-based. */
  page?: number;
  /** Keyset lists: opaque, from the previous page's `nextCursor`. */
  cursor?: string;
  pageSize?: ListPageSize;
}

export interface ListPage<T> {
  items: T[];
  pageSize: number;
  /** Matching records; with `totalCapped`, a floor ("10,000+"). */
  total: number;
  totalCapped: boolean;
  /** Offset lists: the page returned - lower than asked when the ask was past the end. Keyset lists: null. */
  page: number | null;
  /** Keyset lists: the next page's cursor, null on the last page. Offset lists: null. */
  nextCursor: string | null;
  /** Filter parameters dropped because their value no longer exists, so the list can say so. */
  ignored: string[];
}

/** A list's view counts for the current non-view filters (`?views=only`). */
export interface ListViews<V extends string = string> {
  views: Record<V, number>;
}

/** Sentence for a list asked to page past `LIST_MAX_OFFSET`. */
export const LIST_TOO_DEEP_SENTENCE = "Narrow the search to see further.";

/** Sentence for a capped set (promotion groups, skins, …) that is full. `n` is its limit. */
export const listFullSentence = (n: number): string => `This list is full (${n}). Remove one before adding another.`;
/** The limit on a set staff create and the console shows whole (103 FR-024). */
export const CAPPED_SET_LIMIT = 500;
