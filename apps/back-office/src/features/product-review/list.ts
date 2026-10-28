import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/**
 * Product review's lists in the address (103), mirroring the catalog service's `review/list.ts`. The queue and
 * "margin not set" share one route, so the margin list's params are prefixed (`m.q`, `m.page`).
 */
export const reviewQueueList = defineListSearch({
  id: "review-queue",
  mode: "offset",
  sorts: ["waiting", "shop"] as const,
  defaultSort: "waiting",
  sortDir: { waiting: "asc", shop: "asc" },
  filters: {
    kind: searchFilter.oneOf(["new_product", "change"] as const),
    shopId: searchFilter.uuid,
  },
})

export const marginNotSetList = defineListSearch({
  id: "margin-not-set",
  mode: "offset",
  sorts: ["since", "shop", "name"] as const,
  defaultSort: "since",
  sortDir: { since: "asc", shop: "asc", name: "asc" },
  filters: { shopId: searchFilter.uuid },
  prefix: "m",
})

export const missingDetailsList = defineListSearch({
  id: "missing-details",
  mode: "offset",
  sorts: ["changed", "shop", "missing"] as const,
  defaultSort: "changed",
  sortDir: { changed: "desc", shop: "asc", missing: "desc" },
  filters: { shopId: searchFilter.uuid, categoryId: searchFilter.uuid },
})

/** Which list the review page shows. */
export const REVIEW_VIEWS = ["waiting", "margin"] as const
export type ReviewView = (typeof REVIEW_VIEWS)[number]

/** Every review list sits under `["product-review"]`, which the `review` and `products` live kinds invalidate. */
export const REVIEW_KEY = ["product-review"] as const
