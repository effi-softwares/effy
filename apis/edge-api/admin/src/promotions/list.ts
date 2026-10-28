import { listFilter, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

import { PROMOTION_STATES, type PromotionState } from "./promotion-repository";

/** Promotions as a console list (103): recently changed first, numbered pages with an exact total. Columns are `y`'s. */
export const PROMOTION_LIST = {
  mode: "offset",
  sorts: {
    updated: { sql: "y.updated_at", dir: "desc" },
    name: { sql: "lower(y.name)", dir: "asc" },
    // A promotion with no start or end date sorts after those with one.
    start: { sql: "y.starts_at", dir: "desc", nullsLast: true },
    end: { sql: "y.ends_at", dir: "asc", nullsLast: true },
    used: { sql: "y.uses::int", dir: "desc" },
  },
  defaultSort: "updated",
  idSql: "y.id",
} as const satisfies ListOrder<"updated" | "name" | "start" | "end" | "used">;

export interface PromotionListFilters {
  state: PromotionState;
  kind: "cart" | "item" | "bxgy" | "delivery";
  trigger: "automatic" | "code";
  groupId: string;
}

export const PROMOTION_LIST_SPEC: ListSpec<keyof typeof PROMOTION_LIST.sorts, PromotionListFilters> = {
  ...PROMOTION_LIST,
  filters: {
    state: listFilter.oneOf(PROMOTION_STATES),
    kind: listFilter.oneOf(["cart", "item", "bxgy", "delivery"] as const),
    trigger: listFilter.oneOf(["automatic", "code"] as const),
    groupId: listFilter.uuid,
  },
};
export type PromotionListRequest = ListRequest<keyof typeof PROMOTION_LIST.sorts, PromotionListFilters>;

/** A promotion's single-use codes (103): in the order they were made. */
export const CODE_LIST = {
  mode: "offset",
  sorts: { created: { sql: "y.created_at", dir: "asc" }, code: { sql: "y.code", dir: "asc" } },
  defaultSort: "created",
  idSql: "y.code",
  idType: "text",
} as const satisfies ListOrder<"created" | "code">;

export const CODE_LIST_SPEC: ListSpec<keyof typeof CODE_LIST.sorts, { state: "unused" | "held" | "used" }> = {
  ...CODE_LIST,
  filters: { state: listFilter.oneOf(["unused", "held", "used"] as const) },
};
export type CodeListRequest = ListRequest<keyof typeof CODE_LIST.sorts, { state: "unused" | "held" | "used" }>;

/** The customers a promotion is for (103). */
export const CUSTOMER_LIST = {
  mode: "offset",
  sorts: { email: { sql: "c.email", dir: "asc" } },
  defaultSort: "email",
  idSql: "c.id",
} as const satisfies ListOrder<"email">;

export const CUSTOMER_LIST_SPEC: ListSpec<"email", Record<never, never>> = { ...CUSTOMER_LIST, filters: {} };
export type CustomerListRequest = ListRequest<"email", Record<never, never>>;
