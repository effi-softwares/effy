/**
 * 055-refunds-cancellation — returning money.
 *
 * ⚠ TWO AUDIENCES, TWO SHAPES, DELIBERATELY. [RefundDTO] is what STAFF see; [CustomerRefundDTO] is
 * smaller and is not a subset by accident. A customer cannot act on the difference between "we have
 * not heard from the provider" and "the provider has it", and whether a refund was *refused* rather
 * than *failed* is our problem, not theirs. Collapsing the two shapes into one would put a payment
 * provider's failure text on a shopper's order page.
 */

import type { WireInt } from "./cart"

/**
 * How the amount was arrived at.
 *
 * ⚠ `item` amounts are COMPUTED from the selected order lines and are never accepted from a client —
 * if a caller could send an amount beside a line selection the two could disagree, and the record
 * would then claim a refund covered items it did not. `goodwill` exists so the honest case for an
 * untied amount (a late delivery) does not have to borrow a line and put a false statement in the
 * audit trail.
 */
export type RefundKind =
  | "item"
  | "goodwill"
  /**
   * ⚠ ITS OWN KIND, not a goodwill refund with a telling note. Cancelling returns the WHOLE remaining
   * amount including delivery, and names no lines — so structurally it looks like goodwill. But the
   * kind is what staff read, and "Goodwill" describes a gesture the business did not make.
   */
  | "cancellation"
  /**
   * ⚠ A refund THE PLATFORM DID NOT ISSUE — returned by hand in the payment provider's own dashboard,
   * which is a real thing that happens during an incident. It is recorded rather than discarded
   * (FR-010): dropping it would leave the order claiming money it no longer holds, the ceiling wrong,
   * and the same money refundable a second time. It has no lines and no Effy actor, because the
   * platform genuinely does not know either.
   */
  | "external"

/**
 * Why money was returned — ⚠ EFFY'S vocabulary, not the payment provider's.
 *
 * The provider offers three values describing a payments concern; the business needs to tell "never
 * supplied" from "arrived unusable" from "cancelled" from "goodwill", all of which map to its
 * `requested_by_customer`. Storing only theirs would make our own reporting answer "why do we refund?"
 * with "because customers asked".
 *
 * ⚠ The provider's `fraudulent` is NEVER sent: its documentation states it adds the payer's card and
 * email to a block list — a consequence for a person beyond this order, decided in a console with no
 * review step.
 */
export type RefundReason =
  | "item_not_supplied"
  | "item_unusable"
  | "order_cancelled"
  | "goodwill"
  /** Pairs with the `external` kind: the platform knows money moved and nothing else about why. */
  | "external"

/**
 * ⚠ FIVE states, because each is a different answer to the only question anyone asks about a refund:
 * **did the money go?** (FR-005f)
 *
 * Collapsing `submitting`/`submitted` loses whether a retry is safe; collapsing `failed`/`refused`
 * loses whether retrying could ever help.
 */
export type RefundStatus =
  /** We have no answer from the provider yet. No money is on its way, and this does NOT count toward
   *  what has been refunded (FR-005e). */
  | "submitting"
  /** The provider has it; the bank does not yet. */
  | "submitted"
  | "succeeded"
  /** ⚠ The bank rejected it — possibly WEEKS later. The order must stop claiming money was returned. */
  | "failed"
  /** The provider would not accept the request at all. Terminal: retrying a decision cannot change it. */
  | "refused"

/** One refund, as STAFF see it. */
export interface RefundDTO {
  id: string
  kind: RefundKind
  amount: string
  reason: RefundReason
  status: RefundStatus
  /** ⚠ The provider's own words, for staff only. NEVER shown to a customer. */
  failureReason: string | null
  note: string | null
  /** Which lines it covered. Empty for a goodwill refund — it names none. */
  lines: RefundLineDTO[]
  actorLabel: string | null
  createdAt: string
  settledAt: string | null
}

export interface RefundLineDTO {
  orderItemId: string
  productName: string
  quantity: WireInt
  amount: string
}

/**
 * One refund, as the CUSTOMER sees it.
 *
 * ⚠ THREE states, not five, and no failure text. "Your bank rejected the refund" invites a shopper to
 * argue with a message they cannot act on, and the difference between `submitting` and `submitted` is
 * a fact about our integration.
 */
export interface CustomerRefundDTO {
  amount: string
  state: "on_its_way" | "completed" | "there_was_a_problem"
  refundedAt: string | null
}

// ── Requests (US3) ──────────────────────────────────────────────────────────────────────────────

export type RefundRequestStatus = "open" | "refunded" | "declined"

/**
 * A customer's ask.
 *
 * ⚠ IT IS NOT A REFUND. It carries no amount and no provider reference, and it moves no money
 * (FR-005r). It replaces "email support and hope" — today "Get help" opens a generic feedback form
 * with no order reference attached. ⚠ Deliberately NOT a message thread: one statement, one outcome.
 */
export interface RefundRequestDTO {
  id: string
  message: string
  status: RefundRequestStatus
  items: { orderItemId: string; productName: string; quantity: WireInt }[]
  outcomeNote: string | null
  createdAt: string
  decidedAt: string | null
}

// ── Proposals (FR-004a) ─────────────────────────────────────────────────────────────────────────

/**
 * A refund the platform has drafted from evidence it already holds — today, a pick shortfall.
 *
 * ⚠ NOT A REFUND UNTIL SOMEONE ISSUES IT, and dismissable. The platform has its own staff's evidence
 * that a customer paid for something they did not receive, so making them ask for it is the failure
 * G3 describes — but a payment triggered by a warehouse tap has no second pair of eyes.
 *
 * ⚠ DERIVED, never stored: a proposal is a view of a shortfall, and storing it means it can go stale
 * when a picker corrects a quantity.
 */
export interface ProposedRefundDTO {
  orderItemId: string
  productName: string
  quantity: WireInt
  amount: string
  reason: RefundReason
}

// ── Write bodies ────────────────────────────────────────────────────────────────────────────────

/** ⚠ Carries NO amount. The amount is computed from the lines and a client-supplied one is REJECTED. */
export interface IssueItemRefundRequest {
  kind: "item"
  lines: { orderItemId: string; quantity: WireInt }[]
  reason: Exclude<RefundReason, "goodwill">
  note?: string
}

/** ⚠ `note` is REQUIRED — the database refuses a goodwill refund without one (FR-003c). */
export interface IssueGoodwillRefundRequest {
  kind: "goodwill"
  amount: string
  note: string
}

export type IssueRefundRequest = IssueItemRefundRequest | IssueGoodwillRefundRequest

/**
 * ⚠ NO DESTINATION FIELD, AND THERE MUST NEVER BE ONE. The refund goes to the payment method on the
 * order (FR-006). A request that could name where the money goes would be a way to redirect somebody
 * else's (A4).
 */
export interface CreateRefundRequestBody {
  items: { orderItemId: string; quantity: WireInt }[]
  message: string
}

export interface DeclineRefundRequestBody {
  outcomeNote: string
}

export interface DismissProposalBody {
  orderItemId: string
  reason: string
}

export interface CancelOrderBody {
  reason?: string
}
