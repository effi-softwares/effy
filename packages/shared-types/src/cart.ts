/**
 * Cart contracts — 019-customer-commerce-flow.
 *
 * The server cart (the hybrid model's server half, R8): the server stores only product + quantity;
 * price/availability are re-read from public.product at every read (authoritative), and the client
 * compares against its device-local snapshot to surface changes. Amounts are decimal strings + a
 * currency (R9). The cart is ONE unified Effy cart with a single total and NO shop identity (FR-016).
 *
 * Data design: see specs/019-customer-commerce-flow/data-model.md §3.
 */

/** A cart line (re-priced against the catalog on every read). */
export interface CartLineDTO {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceAmount: string;
  quantity: number;
  lineSubtotalAmount: string;
  available: boolean;
  /** When the authoritative price differs from what the client last saw, the prior amount (UX only). */
  priceChangedFrom?: string | null;
}

/** A cart-level notice surfaced at read/checkout (an item went away or changed price). */
export type CartNoticeKind = "unavailable" | "price_changed";
export const CART_NOTICE_KINDS: readonly CartNoticeKind[] = ["unavailable", "price_changed"];

export interface CartNoticeDTO {
  productId: string;
  kind: CartNoticeKind;
}

/** The full cart (GET /v1/cart and every mutating response). */
export interface CartDTO {
  lines: CartLineDTO[];
  itemSubtotalAmount: string;
  deliveryFeeAmount: string;
  grandTotalAmount: string;
  currency: string;
  notices: CartNoticeDTO[];
}

/** POST /v1/cart/items — add or increment a line. */
export interface AddToCartRequest {
  productId: string;
  quantity: number;
}

/** PATCH /v1/cart/items/{productId} — set a line quantity (0 removes). */
export interface UpdateCartLineRequest {
  quantity: number;
}

/** POST /v1/cart/merge — merge a device-local guest cart on sign-in (sums qty per product). */
export interface MergeCartRequest {
  lines: { productId: string; quantity: number }[];
}
