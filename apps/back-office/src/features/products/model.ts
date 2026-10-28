import { BACKOFFICE_PRODUCT_TABS, STORAGES, type BackOfficeProductState } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

const STATES = BACKOFFICE_PRODUCT_TABS.filter((t): t is BackOfficeProductState => t !== "all")

/**
 * Catalogue › Products' view, carried by the URL so a link opens the same list for anyone (102 FR-007, 103).
 * Mirrors the catalog service's `PRODUCT_LIST_SPEC`; anything unknown in the URL is dropped, never an error.
 */
export const productsList = defineListSearch({
  id: "products",
  mode: "offset",
  sorts: ["updated", "name", "price", "shop"] as const,
  defaultSort: "updated",
  sortDir: { updated: "desc", name: "asc", price: "asc", shop: "asc" },
  filters: {
    state: searchFilter.oneOf(STATES),
    shopId: searchFilter.uuid,
    categoryId: searchFilter.uuid,
    storage: searchFilter.oneOf(STORAGES),
    margin: searchFilter.oneOf(["set", "not_set"] as const),
    missingDetails: searchFilter.flag,
    lowStock: searchFilter.flag,
  },
})
