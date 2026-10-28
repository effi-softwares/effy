import { ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_PROMISE_FILTERS } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/**
 * Back-office Orders' view, in the address (103). Mirrors the orders service's `ORDER_LIST_SPEC`: a keyset
 * list, newest first, so a reload past page 1 starts again from the newest.
 */
export const ORDER_LIST_VIEWS = ["driver", "handover", "arrival", "refund", "courier"] as const
export type OrderListView = "all" | (typeof ORDER_LIST_VIEWS)[number]

export const ORDER_LIST_STATUSES = ["paid", "canceled", "failed"] as const
export const ORDER_STATUS_LABEL: Record<(typeof ORDER_LIST_STATUSES)[number], string> = {
  paid: "Paid",
  canceled: "Cancelled",
  failed: "Payment failed",
}

export const ordersList = defineListSearch({
  id: "orders",
  mode: "keyset",
  sorts: ["placed", "total"] as const,
  defaultSort: "placed",
  sortDir: { placed: "desc", total: "desc" },
  filters: {
    view: searchFilter.oneOf(ORDER_LIST_VIEWS),
    deliveryType: searchFilter.oneOf(ADMIN_ORDER_DELIVERY_FILTERS),
    promise: searchFilter.oneOf(ADMIN_ORDER_PROMISE_FILTERS),
    status: searchFilter.oneOf(ORDER_LIST_STATUSES),
    shopId: searchFilter.uuid,
    placedFrom: searchFilter.day,
    placedTo: searchFilter.day,
  },
})

/** Under `["orders"]`, which the `orders` live kind invalidates (071). */
export const ORDERS_LIST_KEY = ["orders"] as const
