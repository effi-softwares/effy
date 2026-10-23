/**
 * Product review, the back-office half (catalog service): the queue, one item with its before and
 * after, and the decisions. These types carry Effy's margin, so nothing here is returned by a shop route.
 */

import type { WireInt } from "./cart";

export type ReviewKind = "new_product" | "change";

/** `value` is a decimal string as typed: "12.5" for 12.5%, or "2.00" for an amount. Never negative. */
export interface MarginDTO {
  kind: "percent" | "amount";
  value: string;
}

export interface ReviewQueueItemDTO {
  productId: string;
  kind: ReviewKind;
  shopId: string;
  shopName: string;
  /** For a change, the live name the reviewer recognises. */
  productName: string;
  submittedAt: string;
  waitingHours: WireInt;
}

export interface ReviewQueueDTO {
  items: ReviewQueueItemDTO[];
  nextCursor: string | null;
  /** How many items the filtered queue holds across pages (the rail's count). Optional for an older deploy. */
  total?: number;
}

/** A live product with no margin set. It sells at its shop price until one is. */
export interface MarginNotSetItemDTO {
  productId: string;
  shopId: string;
  shopName: string;
  productName: string;
  /** The lowest shop price among its active variants. */
  shopPriceAmount: string;
  status: string;
}

export interface MarginNotSetDTO {
  items: MarginNotSetItemDTO[];
  nextCursor: string | null;
}

export interface ReviewImageDTO {
  url: string;
  isPrimary: boolean;
  altText: string | null;
  /** True for an image this change adds; false for one the live product has. */
  isNew: boolean;
}

/** One detail a change alters, as a reviewer reads it: what it is now, and what it would become. */
export interface ReviewFieldChangeDTO {
  /** A stable key: a field name, or `attribute:<key>`. */
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

/**
 * One variant as the decision would make it live: the shop's prices and its prices under the current
 * margin, so the reviewer sees the selling price before deciding. The console's recomputation is a
 * preview; the server's arithmetic sells.
 */
export interface ReviewVariantDTO {
  id: string;
  label: string | null;
  /** Effy's code; null for a variant a pending change adds (it gets one on approval). */
  code: string | null;
  sku: string | null;
  gtin: string | null;
  shopPriceAmount: string;
  shopCompareAtAmount: string | null;
  /** Under `currentMargin` (the shop price when none is set). */
  customerPriceAmount: string;
  customerCompareAtAmount: string | null;
  weightGrams: WireInt;
  packQuantity: string | null;
  packUnit: string | null;
  state: "active" | "inactive" | "removed";
  /** For a change: whether this variant is new, dropped, changed or unchanged by it. */
  change: "added" | "removed" | "changed" | "unchanged";
}

export interface ReviewDetailRowDTO {
  label: string;
  value: string | null;
}

export interface ReviewItemDetailDTO {
  productId: string;
  kind: ReviewKind;
  /** Echo this on a decision: a stale one is refused, so nothing is approved that nobody saw. Opaque. */
  version: string;
  shop: { id: string; name: string; status: string };
  submittedAt: string;
  productName: string;
  /** What the shop entered: for a new product the submission, for a change the live product. */
  details: ReviewDetailRowDTO[];
  /** Empty for a new product; for a change, only what differs. */
  changes: ReviewFieldChangeDTO[];
  images: {
    current: ReviewImageDTO[];
    /** The proposed image set, or null when the change does not touch images. */
    proposed: ReviewImageDTO[] | null;
  };
  /** Every variant the decision would make live (removed live variants listed as `removed`); field changes are also in `changes` as `variant:<id>:<field>`. */
  variants: ReviewVariantDTO[];
  /** The margin the product carries now, or null if never set. */
  currentMargin: MarginDTO | null;
  /** True when approving requires a margin in the request (new product, a shop price changed, or none set). */
  marginRequired: boolean;
}

export interface ApproveReviewRequest {
  version: string;
  /** Required when `marginRequired`; otherwise omit to keep the current margin. */
  margin?: MarginDTO | null;
}

export interface SendBackReviewRequest {
  version: string;
  /** 1 to 500 characters, shown to the shop as from Effy, never a person. */
  reason: string;
}

export interface SetMarginRequest {
  margin: MarginDTO;
  /** The margin the reviewer saw; a mismatch is refused (someone changed it meanwhile). */
  expectedCurrent: MarginDTO | null;
}

export interface ReviewDecisionDTO {
  productId: string;
  margin: MarginDTO | null;
  /** Every live variant's prices after the decision. */
  variants: { id: string; label: string | null; shopPriceAmount: string; customerPriceAmount: string }[];
}

export const REVIEW_REASON_MAX = 500;
