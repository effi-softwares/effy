import { listFilter, type ListOrder, type ListSpec } from "@effy/edge-shared";

import {
  ATTENTIONS,
  DELIVERED_BY_FILTERS,
  ORDER_TABS,
  PAYMENT_STATES,
  RANGES,
  type Attention,
  type DeliveredByFilter,
  type OrderTab,
  type PaymentState,
  type Range,
  type SortKey,
} from "./types";

/** The shop's orders as a console list (103): parsed by the shared helper, so paging, sort and search behave as every list's. */
export const SHOP_ORDER_LIST = {
  mode: "offset",
  // Columns of the list's `filtered` CTE; every sort ends in its id (the helper adds it).
  sorts: {
    placed: { sql: "placed_at", dir: "desc" },
    number: { sql: "order_number", dir: "asc" },
    customer: { sql: "lower(customer_name)", dir: "asc" },
    items: { sql: "item_count", dir: "desc" },
    total: { sql: "total", dir: "desc" },
  },
  defaultSort: "placed",
  idSql: "id",
} as const satisfies ListOrder<SortKey>;

export interface ShopOrderFilters {
  tab: OrderTab;
  attention: Attention;
  payment: PaymentState | "any";
  deliveredBy: DeliveredByFilter;
  range: Range;
}

export const SHOP_ORDER_LIST_SPEC: ListSpec<SortKey, ShopOrderFilters> = {
  ...SHOP_ORDER_LIST,
  filters: {
    tab: listFilter.oneOf(ORDER_TABS),
    attention: listFilter.oneOf(ATTENTIONS),
    payment: listFilter.oneOf([...PAYMENT_STATES, "any"] as const),
    deliveredBy: listFilter.oneOf(DELIVERED_BY_FILTERS),
    range: listFilter.oneOf(RANGES),
  },
};

