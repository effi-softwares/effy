import { listFilter, type FilterParser, type ListOrder, type ListRequest, type ListSpec } from "@effy/edge-shared";

import { PRODUCT_STATUSES, type ProductStatus, type ShopReviewState } from "./types";

/** The lowest shop price among active variants ("From"). */
export const SHOP_FROM_PRICE = `(SELECT min(v.shop_price_amount) FROM public.product_variant v
                           WHERE v.product_id = p.id AND v.state = 'active')`;

/** The shop's catalogue as a console list (103): newest first, numbered pages with an exact total. */
export const SHOP_PRODUCT_LIST = {
  mode: "offset",
  sorts: {
    recent: { sql: "p.created_at", dir: "desc" },
    name: { sql: "lower(p.name)", dir: "asc" },
    // A product with no active size has no price and sorts last either way.
    price: { sql: SHOP_FROM_PRICE, dir: "asc", nullsLast: true },
  },
  defaultSort: "recent",
  idSql: "p.id",
} as const satisfies ListOrder<"recent" | "name" | "price">;

const REVIEW_STATES = [
  "draft",
  "in_review",
  "sent_back",
  "live",
  "live_change_pending",
  "live_change_sent_back",
] as const satisfies readonly ShopReviewState[];

const money: FilterParser<string> = (raw) => (/^\d+(\.\d{1,2})?$/.test(raw.trim()) ? raw.trim() : undefined);

export interface ShopProductFilters {
  missing: boolean;
  category: string;
  section: string;
  status: ProductStatus;
  reviewState: ShopReviewState;
  priceMin: string;
  priceMax: string;
}

export const SHOP_PRODUCT_LIST_SPEC: ListSpec<keyof typeof SHOP_PRODUCT_LIST.sorts, ShopProductFilters> = {
  ...SHOP_PRODUCT_LIST,
  filters: {
    missing: listFilter.bool,
    category: listFilter.uuid,
    section: listFilter.uuid,
    status: listFilter.oneOf(PRODUCT_STATUSES),
    reviewState: listFilter.oneOf(REVIEW_STATES),
    priceMin: money,
    priceMax: money,
  },
};

export type ShopProductListRequest = ListRequest<keyof typeof SHOP_PRODUCT_LIST.sorts, ShopProductFilters>;
