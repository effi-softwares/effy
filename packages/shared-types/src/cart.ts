/**
 * Cart contracts — 019-customer-commerce-flow, rewritten by 027-customer-cart-sync.
 *
 * ── The model in force (027 research R0/R1) ─────────────────────────────────────────────────────
 *
 * For a signed-in shopper the PLATFORM is authoritative. The server stores only product + quantity;
 * price and availability are re-read from `public.product` at every read, and the platform reports a
 * price change itself (it records the price a line was added at — 019 could not do this, which is why
 * `priceChangedFrom` sat here unpopulated for two slices). The client keeps a durable NON-authoritative
 * mirror so interaction is instant, and adopts a response only when its `revision` is newer.
 *
 * A guest has no server cart: their device cart is the whole truth, re-priced through
 * `POST /v1/cart/preview` (which writes nothing) and folded into the account cart at sign-in.
 *
 * ⚠ EVERY WRITE IS IDEMPOTENT BY CONSTRUCTION. Quantities are absolute, never deltas; merge and
 * reorder are union-with-MAXIMUM, never additive. The one exception is `POST /v1/cart/items`, which
 * must increment (tapping "Add" twice means two) — so it carries a `changeId` the platform dedupes.
 * 019's whole-cart `PUT /v1/cart` replace is DELETED: no client should hold an operation able to
 * remove a line it has never heard of, which is what makes a week-stale device structurally harmless.
 *
 * Amounts are decimal strings + a `currency` (019 R9). The cart is ONE unified Effy cart with a single
 * total and NO shop identity, anywhere, in any string (FR-016, FR-062).
 *
 * Data design: specs/027-customer-cart-sync/data-model.md ·
 * API: specs/027-customer-cart-sync/contracts/cart-api.contract.md
 */

/**
 * A whole number on the wire.
 *
 * ⚠ THIS ALIAS IS LOAD-BEARING, and it exists because a plain `number` broke every mobile cart write.
 *
 * TypeScript `number` becomes JSON Schema `"number"`, which the Kotlin generator renders as `Double` —
 * so `kotlinx.serialization` sent `"quantity":1.0`, and Go's `encoding/json` **cannot** unmarshal `1.0`
 * into an `int`. Every `POST /v1/cart/items` and `PATCH /v1/cart/items/{id}` from customer-mobile
 * therefore failed to bind and answered 422. `customer-web` was unaffected: JavaScript serialises an
 * integer as `1`, with no decimal point.
 *
 * `@asType integer` makes the schema say `"integer"`, which generates a Kotlin `Long` and puts a whole
 * number on the wire. Use it for EVERY count, quantity, limit and revision in this contract — the
 * response direction was always fine (kotlinx accepts `3` for a Double), so the asymmetry hid it.
 *
 * See specs/027-customer-cart-sync/research.md R13.
 *
 * @asType integer
 */
export type WireInt = number;

/** A cart line, or a set-aside line — the same shape; re-priced against the catalog on every read. */
export interface CartLineDTO {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceAmount: string;
  quantity: WireInt;
  lineSubtotalAmount: string;
  available: boolean;
  /**
   * The price this line was added at, when it differs from `unitPriceAmount` — so the shopper is told
   * what it *was* rather than being surprised at payment (FR-023). Null when unchanged, and null for a
   * line added before the platform recorded add-time prices (a pre-migration row must not fabricate a
   * change). The shopper always pays `unitPriceAmount`, in both directions.
   */
  priceChangedFrom?: string | null;
  /**
   * OPAQUE package grouping key (021). Items sharing a packageKey ship together as one anonymous
   * "package" (one per fulfilling shop). It is NOT a shop id, name, or location — a meaningless-to-the-
   * customer token that lets the cart show the split (021 FR-005a) while revealing no shop (SC-006).
   */
  packageKey: string;
}

/**
 * A notice the cart surfaces before checkout. `productId` is null for a cart-level notice (a
 * promotional code that stopped applying) — a widening of 019's shape, inert for existing readers,
 * which match on `kind` and `productId` together.
 */
export type CartNoticeKind =
  | "unavailable"
  | "price_changed"
  | "removed"
  | "quantity_clamped"
  | "cart_full"
  | "promo_no_longer_applies";

export const CART_NOTICE_KINDS: readonly CartNoticeKind[] = [
  "unavailable",
  "price_changed",
  "removed",
  "quantity_clamped",
  "cart_full",
  "promo_no_longer_applies",
];

export interface CartNoticeDTO {
  productId: string | null;
  kind: CartNoticeKind;
  /** Human-readable specifics where the kind alone is not enough. NEVER names or implies a shop. */
  detail: string | null;
}

/**
 * What a discount takes off. A NAMED type on purpose: an inline `"percentage" | "fixed"` union makes the
 * Kotlin generator emit a class called `Kind`, which is the same generic-name trap that produced 019's
 * bare `Line` class. Named here, it generates `CartDiscountKind`.
 */
export type CartDiscountKind = "percentage" | "fixed";

/** The discount currently applying, recomputed on every read — never a stored or client-sent amount. */
export interface CartDiscountDTO {
  code: string;
  kind: CartDiscountKind;
  /** The computed reduction, capped so the payable total can never fall below zero. */
  amount: string;
  /** e.g. "20% off" — display only, and shop-free. */
  label: string;
}

/** Why checkout is unavailable, when it is. */
export type CartBlockedReason = "empty" | "no_payable_items" | "below_minimum";

/**
 * Whether the shopper may proceed, and if not, why — so the cart can say it up front instead of
 * letting them walk into a refusal at payment (FR-054). Also enforced server-side at intent (FR-056).
 */
export interface CartCheckoutStateDTO {
  allowed: boolean;
  blockedReason: CartBlockedReason | null;
  /** Null when no minimum is in force; then nothing is shown at all (FR-057). */
  minimumSubtotalAmount: string | null;
  /** How much more is needed to reach the minimum. Null unless `blockedReason` is "below_minimum". */
  remainingAmount: string | null;
}

/** The platform's ceilings, sent so the client can explain them rather than guess them (FR-037/038). */
export interface CartLimitsDTO {
  maxLineQuantity: WireInt;
  maxDistinctItems: WireInt;
}

/**
 * The full cart — returned by GET /v1/cart AND by every mutating response, so a client never has to
 * guess the outcome of a change or issue a follow-up read (FR-007).
 */
export interface CartDTO {
  /**
   * Monotonic, bumped by every mutation. The client mirror adopts a response only when this exceeds
   * what it holds, which is how an out-of-order reply cannot overwrite a newer cart (FR-009).
   */
  revision: WireInt;
  lines: CartLineDTO[];
  /** Set aside for later: kept, shown honestly, and counted in NO total (FR-028…FR-031). */
  savedLines: CartLineDTO[];
  /** Payable, available lines only — unavailable items are never charged for (FR-022). */
  itemSubtotalAmount: string;
  /** "0.00" when no code applies. */
  discountAmount: string;
  /** Always "0.00" here: delivery is priced at the delivery step, once a destination exists (FR-063). */
  deliveryFeeAmount: string;
  /** itemSubtotal − discount. */
  grandTotalAmount: string;
  currency: string;
  notices: CartNoticeDTO[];
  discount: CartDiscountDTO | null;
  checkout: CartCheckoutStateDTO;
  limits: CartLimitsDTO;
}

/** One line of a client-supplied set (merge, preview). */
export interface CartLineInput {
  productId: string;
  quantity: WireInt;
}

/**
 * POST /v1/cart/items — add or INCREMENT a line.
 *
 * ⚠ The only non-idempotent cart write, because "Add to cart" twice must mean two. `changeId` is
 * therefore REQUIRED: a client-generated UUIDv4 minted once per shopper action and reused by every
 * retry of it, so a request that arrived without its response reaching the client cannot apply twice
 * (FR-018).
 */
export interface AddToCartRequest {
  productId: string;
  quantity: WireInt;
  changeId: string;
}

/**
 * PATCH /v1/cart/items/{productId} — set an ABSOLUTE line quantity; 0 removes.
 *
 * Absolute, not a delta, which is what lets the client debounce ten taps into one request and drop the
 * intermediate values safely (FR-016). Idempotent, so `changeId` is optional; clients send it anyway
 * so the queue has no special cases.
 */
export interface UpdateCartLineRequest {
  quantity: WireInt;
  changeId?: string;
}

/**
 * POST /v1/cart/merge — fold a device cart into the account cart at sign-in.
 *
 * ⚠ UNION WITH MAXIMUM QUANTITY per product. This is NOT 019's original `/v1/cart/merge`, which SUMMED
 * quantities and was removed on 2026-07-23 after it tripled carts. Taking the maximum makes the
 * operation idempotent AND commutative: signing in twice, or retrying an interrupted merge, leaves
 * exactly the same cart (FR-011, FR-012). Nothing from either side is dropped.
 */
export interface MergeCartRequest {
  lines: CartLineInput[];
  changeId?: string;
}

/**
 * POST /v1/cart/reorder — put a past order's items back in the cart (FR-034).
 * Union-with-maximum against the current cart, so a double tap cannot double quantities.
 */
export interface ReorderRequest {
  orderId: string;
  changeId?: string;
}

/** Why an item from a past order could not be added back. */
export type ReorderSkipReason = "unavailable" | "removed" | "cart_full" | "clamped";

export interface ReorderSkippedDTO {
  productId: string;
  name: string | null;
  reason: ReorderSkipReason;
}

/**
 * The reorder outcome: the resulting cart plus exactly what could not come back, so the shopper is
 * told rather than left to notice (FR-035). The report names no shop.
 */
export interface ReorderResultDTO {
  cart: CartDTO;
  skipped: ReorderSkippedDTO[];
}

/** POST /v1/cart/promo — apply a promotional code. Signed-in only (a per-shopper cap needs identity). */
export interface ApplyPromoRequest {
  code: string;
}

/**
 * POST /v1/cart/preview — PUBLIC. Re-price a guest's device cart with full notices and write nothing,
 * so a restored guest cart shows current prices and availability too (FR-004 applies to guests).
 */
export interface CartPreviewRequest {
  lines: CartLineInput[];
}

/**
 * GET /v1/cart/policy — PUBLIC. The minimum and the ceilings, so a guest cart can gate and explain
 * honestly without a server cart to read them from.
 */
export interface CartPolicyDTO {
  minimumSubtotalAmount: string;
  currency: string;
  maxLineQuantity: WireInt;
  maxDistinctItems: WireInt;
}
