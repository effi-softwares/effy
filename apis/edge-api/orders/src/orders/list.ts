import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import { ADMIN_ORDER_DELIVERY_FILTERS, ADMIN_ORDER_PROMISE_FILTERS, COURIER_VIEWS, type CourierView } from "@effy/shared-types";
import type { AdminOrderDeliveryFilter } from "@effy/shared-types";

/**
 * Back-office Orders as a console list (103). A ledger read newest first, so it pages by cursor: offset paging
 * would repeat orders as new ones arrive at the top. Every order is ordered by (sort, id), so two orders placed
 * in the same instant can never straddle a page edge and vanish (the defect the `created_at <` cursor had).
 */
export const ORDER_LIST = {
  mode: "keyset",
  sorts: {
    placed: { sql: "o.created_at", dir: "desc", type: "timestamptz" },
    total: { sql: "o.grand_total_amount", dir: "desc", type: "numeric" },
  },
  defaultSort: "placed",
  idSql: "o.id",
} as const satisfies ListOrder<"placed" | "total">;

/** The list's views (the select above it). `all` is the absence of a view. */
export const ORDER_VIEWS = ["driver", "handover", "arrival", "refund", "courier"] as const;
export type OrderListView = (typeof ORDER_VIEWS)[number];

/** Order states staff filter by; a pending payment is never on the list. */
export const ORDER_LIST_STATUSES = ["paid", "canceled", "failed"] as const;

export interface OrderListFilters {
  view: OrderListView;
  deliveryType: AdminOrderDeliveryFilter;
  promise: (typeof ADMIN_ORDER_PROMISE_FILTERS)[number];
  status: (typeof ORDER_LIST_STATUSES)[number];
  shopId: string;
  placedFrom: string;
  placedTo: string;
}

export const ORDER_LIST_SPEC: ListSpec<keyof typeof ORDER_LIST.sorts, OrderListFilters> = {
  ...ORDER_LIST,
  filters: {
    view: listFilter.oneOf(ORDER_VIEWS),
    deliveryType: listFilter.oneOf(ADMIN_ORDER_DELIVERY_FILTERS),
    promise: listFilter.oneOf(ADMIN_ORDER_PROMISE_FILTERS),
    status: listFilter.oneOf(ORDER_LIST_STATUSES),
    shopId: listFilter.uuid,
    placedFrom: listFilter.day,
    placedTo: listFilter.day,
  },
};

export type OrderListRequest = ListRequest<keyof typeof ORDER_LIST.sorts, OrderListFilters>;

/**
 * Courier parcels as a console list (103). A parcel's stage and due time are worked out in code, so the
 * service sorts in code too; these name what each sort compares.
 */
export const COURIER_LIST = {
  mode: "offset",
  sorts: {
    due: { sql: "at risk, then when it must leave", dir: "asc" },
    order: { sql: "order number", dir: "asc" },
  },
  defaultSort: "due",
  idSql: "fulfilment id",
} as const satisfies ListOrder<"due" | "order">;

export interface CourierListFilters {
  view: CourierView;
  /** A service's label ("Courier · Service"), as the parcels carry it. */
  service: string;
}

export const COURIER_LIST_SPEC: ListSpec<keyof typeof COURIER_LIST.sorts, CourierListFilters> = {
  ...COURIER_LIST,
  filters: { view: listFilter.oneOf(COURIER_VIEWS), service: listFilter.text },
};

export type CourierListRequest = ListRequest<keyof typeof COURIER_LIST.sorts, CourierListFilters>;
