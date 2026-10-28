import type { ShopLifecycleStatus } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** The shop register's view: what is in the address (103). Mirrors the admin service's `SHOP_LIST_SPEC`. */
export const SHOP_STATUSES = ["active", "suspended", "disabled"] as const satisfies readonly ShopLifecycleStatus[]
export type ShopView = "all" | ShopLifecycleStatus

export const shopsList = defineListSearch({
  id: "shops",
  mode: "offset",
  sorts: ["code", "name"] as const,
  defaultSort: "code",
  sortDir: { code: "asc", name: "asc" },
  filters: { status: searchFilter.oneOf(SHOP_STATUSES) },
})

/** Key root for the register's list and counts (shops change rarely; no live kind). */
export const SHOPS_LIST_KEY = ["back-office", "shops"] as const
