import type { UnitPriceDTO } from "./unit-price";
/**
 * Cart contracts. For a signed-in shopper the platform is authoritative: it stores variant and
 * quantity, re-reads price and availability on every read, and reports a price change itself. The
 * client keeps a non-authoritative mirror and adopts a response only when its `revision` is newer. A
 * guest's device cart is the whole truth, re-priced by `POST /v1/cart/preview` and merged at sign-in.
 *
 * Every write is idempotent: quantities are absolute, merge and reorder take the maximum. The one
 * exception, `POST /v1/cart/items`, increments and carries a `changeId` the platform dedupes. There is
 * no whole-cart replace, so a stale device cannot remove a line it never knew. Amounts are decimal
 * strings plus a `currency`; the cart has one total and no shop identity anywhere.
 */

/**
 * A whole number on the wire. A plain `number` becomes a Kotlin `Double` and sends `1.0`; this makes the
 * schema say `"integer"` (a Kotlin `Long`). Use it for every count, quantity, limit and revision.
 *
 * @asType integer
 */
export type WireInt = number;

/** A cart line, or a set-aside line — the same shape; re-priced against the catalog on every read. */
export interface CartLineDTO {
  id: string;
  productId: string;
  /** The variant this line buys; lines are keyed by it (two sizes of one product are two lines). */
  variantId: string;
  name: string;
  /** "Spiced / 500 g"; null for a product with no options. */
  variantLabel: string | null;
  /** Sold to adults only: show the 18+ label. */
  ageRestricted: boolean;
  imageUrl: string | null;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
  unitPriceAmount: string;
  quantity: WireInt;
  lineSubtotalAmount: string;
  available: boolean;
  /**
   * The price this line was added at, when it differs from `unitPriceAmount`, so the shopper is told what
   * it was. Null when unchanged. The shopper always pays `unitPriceAmount`.
   */
  priceChangedFrom?: string | null;
  /**
   * An opaque package grouping key: lines sharing it ship together as one package (one per fulfilling
   * shop). Not a shop id, name or location.
   */
  packageKey: string;
  /** What promotions take off this line, in cents as allocated; "0.00" when none. */
  discountAmount?: string;
  /** The comparison price of one unit after this line's discount; null without a pack size. */
  unitPrice: UnitPriceDTO | null;
}

/** A notice shown before checkout. `productId` is null for a cart-level notice (a code that stopped applying). */
export type CartNoticeKind =
  | "unavailable"
  | "price_changed"
  | "removed"
  | "quantity_clamped"
  | "cart_full"
  | "promo_no_longer_applies";

export interface CartNoticeDTO {
  productId: string | null;
  /** The line's variant, when the notice is about a line. */
  variantId?: string | null;
  kind: CartNoticeKind;
  /** Specifics where the kind alone is not enough. Never names or implies a shop. */
  detail: string | null;
}

/** What a discount takes off. Named, so the Kotlin generator emits `CartDiscountKind` rather than `Kind`. */
export type CartDiscountKind = "percentage" | "fixed";

/** The discount applying, recomputed on every read; never stored or client-sent. */
export interface CartDiscountDTO {
  code: string;
  kind: CartDiscountKind;
  /** Capped so the payable total never falls below zero. */
  amount: string;
  /** e.g. "20% off"; display only. */
  label: string;
}

/** A promotion applying to this cart, and what it takes off. */
export interface CartPromotionLineDTO {
  promotionId: string;
  /** The shopper's words (the headline, or the offer label when there is none). */
  headline: string;
  /** The code the shopper entered for it; null for an automatic promotion. */
  code: string | null;
  goodsAmount: string;
  /** Known once a delivery quote exists (checkout); "0.00" in the cart. */
  deliveryAmount: string;
}

/** Why a promotion the shopper could expect does not apply. Named for the Kotlin generator. */
export type CartPromotionNotAppliedReason =
  | "not_combined"
  | "below_minimum"
  | "below_quantity"
  | "wrong_time"
  | "wrong_delivery"
  | "sign_in";

export interface CartNotAppliedDTO {
  promotionId: string;
  headline: string;
  reason: CartPromotionNotAppliedReason;
  /** The sentence to show, composed server-side. */
  detail: string;
}

/** Why checkout is unavailable, when it is. */
export type CartBlockedReason = "empty" | "no_payable_items" | "below_minimum";

/** Whether the shopper may proceed and, if not, why, so the cart says it up front. The intent enforces it too. */
export interface CartCheckoutStateDTO {
  allowed: boolean;
  blockedReason: CartBlockedReason | null;
  /** Null when no minimum is in force; then nothing is shown. */
  minimumSubtotalAmount: string | null;
  /** How much more is needed to reach the minimum. Null unless `blockedReason` is "below_minimum". */
  remainingAmount: string | null;
}

/** The platform's ceilings, so the client can explain them. */
export interface CartLimitsDTO {
  maxLineQuantity: WireInt;
  maxDistinctItems: WireInt;
}

/** The full cart, returned by GET /v1/cart and by every mutation, so a client never guesses an outcome. */
export interface CartDTO {
  /** Bumped by every mutation; the mirror adopts a response only when this is newer, so a late reply cannot win. */
  revision: WireInt;
  lines: CartLineDTO[];
  /** Set aside for later: kept, shown, and counted in no total. */
  savedLines: CartLineDTO[];
  /** Payable, available lines only: unavailable items are never charged for. */
  itemSubtotalAmount: string;
  /** "0.00" when no code applies. */
  discountAmount: string;
  /** itemSubtotal − discount. */
  grandTotalAmount: string;
  currency: string;
  notices: CartNoticeDTO[];
  /** The entered code's line, for the code field. `promotions` lists every promotion applying. */
  discount: CartDiscountDTO | null;
  /** Every promotion applying, automatic and by code. */
  promotions: CartPromotionLineDTO[];
  /** Promotions the shopper might expect that do not apply, each with its sentence. */
  promotionsNotApplied?: CartNotAppliedDTO[];
  checkout: CartCheckoutStateDTO;
  limits: CartLimitsDTO;
}

/** One line of a client-supplied set (merge, preview). */
export interface CartLineInput {
  /** A line is a variant. */
  variantId: string;
  quantity: WireInt;
}

/**
 * POST /v1/cart/items: add or increment a line, the one non-idempotent cart write. `changeId` is required:
 * a UUIDv4 minted once per shopper action and reused by every retry, so a lost response cannot apply twice.
 */
export interface AddToCartRequest {
  /** The variant chosen; a product with no options has exactly one. */
  variantId: string;
  quantity: WireInt;
  changeId: string;
}

/**
 * PATCH /v1/cart/items/{variantId}: sets an absolute quantity (0 removes), so the client can debounce
 * taps safely. Idempotent; `changeId` is optional.
 */
export interface UpdateCartLineRequest {
  quantity: WireInt;
  changeId?: string;
}

/**
 * POST /v1/cart/merge: folds a device cart into the account cart at sign-in, taking the maximum quantity
 * per variant, so a repeat or retried merge leaves the same cart. Nothing from either side is dropped.
 */
export interface MergeCartRequest {
  lines: CartLineInput[];
  changeId?: string;
}

/** POST /v1/cart/reorder: puts a past order's items back, taking the maximum against the current cart. */
export interface ReorderRequest {
  orderId: string;
  changeId?: string;
}

/** Why an item from a past order could not be added back. */
export type ReorderSkipReason = "unavailable" | "removed" | "cart_full" | "clamped";

export interface ReorderSkippedDTO {
  productId: string;
  variantId: string;
  name: string | null;
  /** The label it was sold with. */
  variantLabel: string | null;
  reason: ReorderSkipReason;
}

/** The reorder outcome: the cart plus exactly what could not come back. Names no shop. */
export interface ReorderResultDTO {
  cart: CartDTO;
  skipped: ReorderSkippedDTO[];
}

/** POST /v1/cart/promo: applies a code. Signed-in only (a per-shopper cap needs identity). */
export interface ApplyPromoRequest {
  code: string;
}

/** POST /v1/cart/preview (public): re-prices a guest's device cart with notices and writes nothing. */
export interface CartPreviewRequest {
  lines: CartLineInput[];
}

/** GET /v1/cart/policy (public): the minimum and the ceilings, for a guest cart. */
export interface CartPolicyDTO {
  minimumSubtotalAmount: string;
  currency: string;
  maxLineQuantity: WireInt;
  maxDistinctItems: WireInt;
}
