import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

/**
 * Product review's three lists as console lists (103): the queue, products with no margin, products missing
 * a required detail. Numbered pages with an exact total; each sorts on a whitelisted expression and its id.
 */

export const REVIEW_QUEUE = {
  mode: "offset",
  sorts: {
    // "Waiting for": oldest submission first, so neither kind goes unwatched.
    waiting: { sql: "q.submitted_at", dir: "asc" },
    shop: { sql: "lower(q.shop_name)", dir: "asc" },
  },
  defaultSort: "waiting",
  // A product is in the queue once at most (new, or a change), but the kind keeps the key unique regardless.
  idSql: "(q.product_id::text || q.kind)",
} as const satisfies ListOrder<"waiting" | "shop">;

export interface ReviewQueueFilters {
  kind: "new_product" | "change";
  shopId: string;
}

export const REVIEW_QUEUE_SPEC: ListSpec<keyof typeof REVIEW_QUEUE.sorts, ReviewQueueFilters> = {
  ...REVIEW_QUEUE,
  filters: { kind: listFilter.oneOf(["new_product", "change"] as const), shopId: listFilter.uuid },
};
export type ReviewQueueRequest = ListRequest<keyof typeof REVIEW_QUEUE.sorts, ReviewQueueFilters>;

export const MARGIN_NOT_SET = {
  mode: "offset",
  sorts: {
    // Since it went on sale without one: the longest first.
    since: { sql: "p.approved_at", dir: "asc" },
    shop: { sql: "lower(s.name)", dir: "asc" },
    name: { sql: "lower(p.name)", dir: "asc" },
  },
  defaultSort: "since",
  idSql: "p.id",
} as const satisfies ListOrder<"since" | "shop" | "name">;

export interface ShopOnlyFilters {
  shopId: string;
}

export const MARGIN_NOT_SET_SPEC: ListSpec<keyof typeof MARGIN_NOT_SET.sorts, ShopOnlyFilters> = {
  ...MARGIN_NOT_SET,
  filters: { shopId: listFilter.uuid },
};
export type MarginNotSetRequest = ListRequest<keyof typeof MARGIN_NOT_SET.sorts, ShopOnlyFilters>;

export const MISSING_DETAILS = {
  mode: "offset",
  sorts: {
    changed: { sql: "p.updated_at", dir: "desc" },
    shop: { sql: "lower(s.name)", dir: "asc" },
    missing: { sql: "cardinality(m.missing)", dir: "desc" },
  },
  defaultSort: "changed",
  idSql: "p.id",
} as const satisfies ListOrder<"changed" | "shop" | "missing">;

export interface MissingDetailsFilters {
  shopId: string;
  categoryId: string;
}

export const MISSING_DETAILS_SPEC: ListSpec<keyof typeof MISSING_DETAILS.sorts, MissingDetailsFilters> = {
  ...MISSING_DETAILS,
  filters: { shopId: listFilter.uuid, categoryId: listFilter.uuid },
};
export type MissingDetailsRequest = ListRequest<keyof typeof MISSING_DETAILS.sorts, MissingDetailsFilters>;
