import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

import { SHOP_LIFECYCLE_STATUSES, type ShopLifecycleStatus } from "./types";

/** The shop register as a console list (103): its sorts and filters, declared once and parsed by the shared helper. */
export const SHOP_LIST = {
  mode: "offset",
  sorts: {
    code: { sql: "s.code", dir: "asc" },
    name: { sql: "lower(s.name)", dir: "asc" },
  },
  defaultSort: "code",
  idSql: "s.id",
} as const satisfies ListOrder<"code" | "name">;

type ShopSort = keyof typeof SHOP_LIST.sorts;
interface ShopFilters {
  status: ShopLifecycleStatus;
}

export const SHOP_LIST_SPEC: ListSpec<ShopSort, ShopFilters> = {
  ...SHOP_LIST,
  filters: { status: listFilter.oneOf(SHOP_LIFECYCLE_STATUSES) },
};

export type ShopListRequest = ListRequest<ShopSort, ShopFilters>;

/** A shop's history: an append-only ledger read newest first, so it pages by cursor (103). */
export const SHOP_HISTORY = {
  mode: "keyset",
  sorts: { at: { sql: "a.created_at", dir: "desc", type: "timestamptz" } },
  defaultSort: "at",
  idSql: "a.id",
} as const satisfies ListOrder<"at">;

export const SHOP_HISTORY_SPEC: ListSpec<"at", Record<never, never>> = { ...SHOP_HISTORY, filters: {} };
export type ShopHistoryRequest = ListRequest<"at", Record<never, never>>;
