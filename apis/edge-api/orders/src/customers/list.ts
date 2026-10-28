import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

/** Back-office › Customers as a console list (103): newest first, numbered pages with an exact total. */
export const CUSTOMER_LIST = {
  mode: "offset",
  sorts: {
    joined: { sql: "c.created_at", dir: "desc" },
    lastOrder: { sql: "o.last_order_at", dir: "desc", nullsLast: true },
    orders: { sql: "COALESCE(o.order_count, 0)", dir: "desc" },
    email: { sql: "c.email", dir: "asc" },
  },
  defaultSort: "joined",
  idSql: "c.id",
} as const satisfies ListOrder<"joined" | "lastOrder" | "orders" | "email">;

export interface CustomerListFilters {
  hasOrdered: boolean;
  joinedFrom: string;
  joinedTo: string;
}

export const CUSTOMER_LIST_SPEC: ListSpec<keyof typeof CUSTOMER_LIST.sorts, CustomerListFilters> = {
  ...CUSTOMER_LIST,
  filters: { hasOrdered: listFilter.bool, joinedFrom: listFilter.day, joinedTo: listFilter.day },
};

export type CustomerListRequest = ListRequest<keyof typeof CUSTOMER_LIST.sorts, CustomerListFilters>;
