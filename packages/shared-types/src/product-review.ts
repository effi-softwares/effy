/**
 * Product review — 067-product-approval-margin.
 *
 * The back-office half: the queue of things waiting on Effy, one item with its before/after, and the
 * decisions. Served by `apis/edge-api/catalog` behind the back-office authorizer.
 *
 * ⚠ THESE TYPES CARRY THE MARGIN, AND THE SHOP'S DO NOT. Nothing in this file may be returned by a
 * shop route: a shop sees its own price and the customer price (see `ProductDetailDTO`), never the
 * margin's kind or value (FR-039).
 *
 * Contract: specs/067-product-approval-margin/contracts/review-admin.md
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
  /** For a change this is the LIVE name — the one a reviewer would recognise. */
  productName: string;
  submittedAt: string;
  waitingHours: WireInt;
}

export interface ReviewQueueDTO {
  items: ReviewQueueItemDTO[];
  nextCursor: string | null;
}

/** A live product with no margin set (FR-008). It sells at its shop price until one is. */
export interface MarginNotSetItemDTO {
  productId: string;
  shopId: string;
  shopName: string;
  productName: string;
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
  /** True for an image this change ADDS; false for one the live product already has. */
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

export interface ReviewDetailRowDTO {
  label: string;
  value: string | null;
}

export interface ReviewItemDetailDTO {
  productId: string;
  kind: ReviewKind;
  /**
   * ⚠ ECHO THIS ON A DECISION. It is the item as the reviewer saw it; a decision carrying a stale
   * one is refused, so nothing is approved that nobody looked at. Opaque — never parse or reformat.
   */
  version: string;
  shop: { id: string; name: string; status: string };
  submittedAt: string;
  productName: string;
  /** Everything the shop entered: for a new product, the submission; for a change, the LIVE product. */
  details: ReviewDetailRowDTO[];
  /** Empty for a new product. For a change, ONLY what differs. */
  changes: ReviewFieldChangeDTO[];
  images: {
    current: ReviewImageDTO[];
    /** The proposed image set, or null when the change does not touch images. */
    proposed: ReviewImageDTO[] | null;
  };
  /** The shop price this decision would make live. */
  shopPriceAmount: string;
  shopCompareAtAmount: string | null;
  /** The margin the product carries NOW, or null if none has ever been set. */
  currentMargin: MarginDTO | null;
  /** True when approving requires a margin in the request (new product, shop price changed, or none set). */
  marginRequired: boolean;
}

export interface ApproveReviewRequest {
  version: string;
  /** Required when `marginRequired`; otherwise omit to keep the current margin. */
  margin?: MarginDTO | null;
}

export interface SendBackReviewRequest {
  version: string;
  /** 1 to 500 characters. Shown to the shop, attributed to Effy and never to a person. */
  reason: string;
}

export interface SetMarginRequest {
  margin: MarginDTO;
  /** The margin the reviewer saw. A mismatch is refused: someone else changed it meanwhile. */
  expectedCurrent: MarginDTO | null;
}

export interface ReviewDecisionDTO {
  productId: string;
  shopPriceAmount: string;
  customerPriceAmount: string;
  margin: MarginDTO | null;
}

export const REVIEW_REASON_MAX = 500;
