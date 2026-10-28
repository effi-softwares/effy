import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import { BACKOFFICE_PRODUCT_TABS, STORAGES, type BackOfficeProductState, type Storage } from "@effy/shared-types";

/** Back-office Products as a console list (103): numbered pages, every shop's products, one row each. */
export const PRODUCT_LIST = {
  mode: "offset",
  sorts: {
    updated: { sql: "p.updated_at", dir: "desc" },
    name: { sql: "lower(p.name)", dir: "asc" },
    // The customer's "from" price (the listing summary); never-approved products have none and sort last.
    price: { sql: "p.list_price_amount", dir: "asc", nullsLast: true },
    shop: { sql: "lower(sh.name)", dir: "asc" },
  },
  defaultSort: "updated",
  idSql: "p.id",
} as const satisfies ListOrder<"updated" | "name" | "price" | "shop">;

const STATES = BACKOFFICE_PRODUCT_TABS.filter((t): t is BackOfficeProductState => t !== "all");

export interface ProductListFilters {
  state: BackOfficeProductState;
  shopId: string;
  categoryId: string;
  storage: Storage;
  margin: "set" | "not_set";
  missingDetails: boolean;
  lowStock: boolean;
}

export const PRODUCT_LIST_SPEC: ListSpec<keyof typeof PRODUCT_LIST.sorts, ProductListFilters> = {
  ...PRODUCT_LIST,
  filters: {
    state: listFilter.oneOf(STATES),
    shopId: listFilter.uuid,
    categoryId: listFilter.uuid,
    storage: listFilter.oneOf(STORAGES as readonly Storage[]),
    margin: listFilter.oneOf(["set", "not_set"] as const),
    missingDetails: listFilter.bool,
    lowStock: listFilter.bool,
  },
};

export type ProductListRequest = ListRequest<keyof typeof PRODUCT_LIST.sorts, ProductListFilters>;
