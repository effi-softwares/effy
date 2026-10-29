/**
 * Returning money. Two shapes: [RefundDTO] for staff and the smaller [CustomerRefundDTO], so a
 * provider's failure text never reaches a shopper's order page.
 */

import type { WireInt } from "./cart"

/**
 * How the amount was arrived at. `item` amounts are computed from the selected lines, never accepted
 * from a client; `goodwill` covers an untied amount (a late delivery) without borrowing a line.
 */
export type RefundKind =
  | "item"
  | "goodwill"
  /** Its own kind: the whole remaining amount including delivery, naming no lines ("Goodwill" would describe a gesture not made). */
  | "cancellation"
  /**
   * A refund the platform did not issue, made by hand in the provider's dashboard. Recorded, so the
   * order does not claim money it no longer holds. No lines and no Effy actor.
   */
  | "external"

/**
 * Why money was returned, in Effy's vocabulary (the provider's `requested_by_customer` covers all of
 * them). The provider's `fraudulent` is never sent: it block-lists the payer's card and email.
 */
export type RefundReason =
  | "item_not_supplied"
  | "item_unusable"
  | "order_cancelled"
  | "goodwill"
  /** Pairs with the `external` kind: money moved and nothing else is known. */
  | "external"

/** A refund's reason in words (the activity logs, 104). `courier_override` is the back-office move's compensation (081). */
export const REFUND_REASON_WORDS: Readonly<Record<RefundReason | "courier_override", string>> = {
  item_not_supplied: "Item not supplied",
  item_unusable: "Item damaged, spoiled or incorrect",
  order_cancelled: "Order cancelled",
  goodwill: "Goodwill",
  external: "Refunded outside Effy",
  courier_override: "Moved to courier delivery",
}

/** Five states, each a different answer to "did the money go?": `submitting`/`submitted` says whether a retry is safe, `failed`/`refused` whether retrying could help. */
export type RefundStatus =
  /** No answer from the provider yet; does not count toward what has been refunded. */
  | "submitting"
  /** The provider has it; the bank does not yet. */
  | "submitted"
  | "succeeded"
  /** The bank rejected it, possibly weeks later; the order must stop claiming money was returned. */
  | "failed"
  /** The provider would not accept the request. Terminal. */
  | "refused"

/** One refund, as staff see it. */
export interface RefundDTO {
  id: string
  kind: RefundKind
  amount: string
  reason: RefundReason
  status: RefundStatus
  /** The provider's own words, for staff only. */
  failureReason: string | null
  note: string | null
  /** Which lines it covered; empty for goodwill. */
  lines: RefundLineDTO[]
  /** Which pool the actor came from ([RefundActorKind]). */
  actorKind: RefundActorKind
  actorLabel: string | null
  createdAt: string
  settledAt: string | null
  /** Present only when part came back as points: the card part and the points. */
  cardAmount?: string
  pointsReturned?: WireInt
}

export interface RefundLineDTO {
  orderItemId: string
  productName: string
  quantity: WireInt
  amount: string
}

/** One refund as the customer sees it: three states, no failure text. */
export interface CustomerRefundDTO {
  amount: string
  state: "on_its_way" | "completed" | "there_was_a_problem"
  refundedAt: string | null
}

// Requests

export type RefundRequestStatus = "open" | "refunded" | "declined"

/** A customer's ask: no amount, no provider reference, no money moved. One statement, one outcome, not a thread. */
export interface RefundRequestDTO {
  id: string
  message: string
  status: RefundRequestStatus
  items: { orderItemId: string; productName: string; quantity: WireInt }[]
  outcomeNote: string | null
  createdAt: string
  decidedAt: string | null
}

// Proposals

/**
 * A refund the platform drafted from its own evidence (a pick shortfall). Not a refund until someone
 * issues it, and dismissable. Derived, never stored.
 */
export interface ProposedRefundDTO {
  orderItemId: string
  productName: string
  quantity: WireInt
  amount: string
  reason: RefundReason
}

// Write bodies

/** Carries no amount: it is computed from the lines, and a client-supplied one is rejected. */
export interface IssueItemRefundRequest {
  kind: "item"
  lines: { orderItemId: string; quantity: WireInt }[]
  reason: Exclude<RefundReason, "goodwill">
  note?: string
}

/** `note` is required (the database refuses goodwill without one). */
export interface IssueGoodwillRefundRequest {
  kind: "goodwill"
  amount: string
  note: string
}

export type IssueRefundRequest = IssueItemRefundRequest | IssueGoodwillRefundRequest

/** No destination field, ever: the refund goes to the order's payment method. */
export interface CreateRefundRequestBody {
  items: { orderItemId: string; quantity: WireInt }[]
  message: string
}

export interface CancelOrderBody {
  reason?: string
}

// A shop may refund its own portion

/**
 * Who issued a refund. `system` means nobody at Effy did it (the provider reported it unattributed), the
 * only kind allowed a null label.
 */
export type RefundActorKind = "back_office" | "customer" | "shop" | "system"

/**
 * What a shop manager sends to refund their own portion: lines, never an amount. A line outside the
 * caller's shop portion refuses the whole request rather than being dropped.
 */
export interface ShopRefundRequest {
  lines: { orderItemId: string; quantity: WireInt }[]
  reason: Extract<RefundReason, "item_not_supplied" | "item_unusable">
  note?: string
  /** Return the refunded units to this shop's stock. Defaults to false: inventing stock is worse than not returning it. */
  restock?: boolean
}
