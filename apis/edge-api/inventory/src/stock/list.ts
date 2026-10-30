import { listFilter, parseListQuery, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";
import { STOCK_MOVEMENT_REASONS, type StockMovementReason } from "@effy/shared-types";

/**
 * The restock list as a console list (103): least stock first (so everything out of stock leads), numbered
 * pages with an exact total. Shared by the shop's route and back-office's.
 */
export const LOW_STOCK_LIST = {
  mode: "offset",
  sorts: {
    onHand: { sql: "v.stock_on_hand", dir: "asc" },
    name: { sql: "lower(p.name)", dir: "asc" },
  },
  defaultSort: "onHand",
  idSql: "v.id",
} as const satisfies ListOrder<"onHand" | "name">;

export const LOW_STOCK_SEVERITIES = ["out", "low"] as const;
export type LowStockFilters = { severity: (typeof LOW_STOCK_SEVERITIES)[number] };

export const LOW_STOCK_LIST_SPEC: ListSpec<"onHand" | "name", LowStockFilters> = {
  ...LOW_STOCK_LIST,
  filters: { severity: listFilter.oneOf(LOW_STOCK_SEVERITIES) },
};

export type LowStockListRequest = ListRequest<"onHand" | "name", LowStockFilters>;

/** A variant's stock movements (103): newest first, by cursor - an append-only history with no end. */
export const MOVEMENT_LIST = {
  mode: "keyset",
  sorts: { at: { sql: "m.created_at", dir: "desc", type: "timestamptz" } },
  defaultSort: "at",
  idSql: "m.id",
} as const satisfies ListOrder<"at">;

export type MovementFilters = { reason: StockMovementReason };

export const MOVEMENT_LIST_SPEC: ListSpec<"at", MovementFilters> = {
  ...MOVEMENT_LIST,
  filters: { reason: listFilter.oneOf(STOCK_MOVEMENT_REASONS) },
};

export type MovementListRequest = ListRequest<"at", MovementFilters>;

/** The first page, newest first: what the stock read (and every write's answer) embeds. */
export const FIRST_MOVEMENTS: MovementListRequest = parseListQuery(null, MOVEMENT_LIST_SPEC);
