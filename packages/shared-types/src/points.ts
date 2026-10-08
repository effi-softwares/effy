/**
 * 074-customer-points — store credit Effy gives and the customer spends.
 *
 * ⚠ TWO AUDIENCES, TWO SHAPES, as 055 drew them for refunds. A customer sees a points line as a
 * sentence ("Sorry your order was late"); staff also see the reason code, the internal NOTE and who
 * made the change. The note must never reach a customer, so the customer shape has no field it could be
 * put in.
 *
 * ⚠ POINTS ARE A WAY OF PAYING, NEVER A DISCOUNT (FR-018). Every money field below is a decimal string
 * like the rest of the platform's wire; a point count is an integer.
 */

import type { WireInt } from "./cart"

/** Every kind of change to a balance. Credits are positive, debits negative. */
export type PointsEntryKind =
  | "staff_credit"
  | "auto_credit"
  | "returned"
  | "staff_debit"
  | "spent"
  | "expired"
  | "forfeited"

/** Reasons back-office may credit for, in the order the console lists them. */
export const POINTS_CREDIT_REASONS = ["late_delivery", "missing_item", "quality_issue", "goodwill", "correction", "other"] as const
export type PointsCreditReason = (typeof POINTS_CREDIT_REASONS)[number]

/** Reasons back-office may debit for. */
export const POINTS_DEBIT_REASONS = ["credited_in_error", "correction", "other"] as const
export type PointsDebitReason = (typeof POINTS_DEBIT_REASONS)[number]

/** What staff call each reason. (The customer's words are decided by the server, per entry.) */
export const POINTS_REASON_LABELS: Readonly<Record<string, string>> = {
  late_delivery: "Late delivery",
  missing_item: "Missing item",
  quality_issue: "Quality issue",
  goodwill: "Goodwill",
  correction: "Correction",
  other: "Other",
  credited_in_error: "Credited in error",
  courier_override_compensation: "Courier delivery compensation",
  spent: "Spent on an order",
  returned: "Returned by a refund",
  expired: "Expired",
  forfeited: "Account closed",
}

// ── Customer ────────────────────────────────────────────────────────────────────────────────────────

/** GET /customer/v1/points */
export interface PointsBalanceDTO {
  points: WireInt
  valueAmount: string
  centsPerPoint: WireInt
  /** The soonest lot to expire; null when nothing is due. */
  nextExpiry: { points: WireInt; date: string } | null
}

/** One history line as the CUSTOMER sees it. */
export interface PointsHistoryEntryDTO {
  id: string
  kind: PointsEntryKind
  /** Signed. */
  points: WireInt
  valueAmount: string
  /** The sentence to show — decided by the server from the reason. */
  words: string
  orderNumber: string | null
  /** Credits only: the last date these points can be used (yyyy-mm-dd, Melbourne). */
  expiresOn: string | null
  at: string
}

export interface PointsHistoryPageDTO {
  entries: PointsHistoryEntryDTO[]
  /** Absent on the last page. */
  nextCursor?: string
}

/**
 * GET /customer/v1/points — the balance AND a page of history, in one answer.
 *
 * ⚠ ONE ROUTE ON PURPOSE. Every screen that shows points shows both, so two routes would be two round
 * trips for one screen — and the shared gateway's route and integration ceilings (300 each) were
 * reached the day this shipped. `?cursor=` pages the history; the balance is always current.
 */
export interface CustomerPointsDTO extends PointsBalanceDTO {
  history: PointsHistoryPageDTO
}

// ── Back-office ─────────────────────────────────────────────────────────────────────────────────────

/** One history line as STAFF see it: the customer's line plus the facts behind it. */
export interface StaffPointsHistoryEntryDTO extends PointsHistoryEntryDTO {
  reason: string
  /** ⚠ Internal. Staff only. */
  note: string | null
  authorKind: "staff" | "system" | "customer"
  /** A staff member's name, "Customer", or the platform flow's name. */
  authorName: string
  orderId: string | null
  refundId: string | null
}

/** The staff history page. Concrete, not generic, so the Kotlin generators can read every shape. */
export interface StaffPointsHistoryPageDTO {
  entries: StaffPointsHistoryEntryDTO[]
  nextCursor?: string
}

export interface CustomerSearchResultDTO {
  id: string
  name: string
  email: string
  points: WireInt
  orderCount: WireInt
}

export interface CustomerPointsSummaryDTO {
  usable: WireInt
  valueAmount: string
  /** Points set aside by a checkout in progress. */
  held: WireInt
  nextExpiry: { points: WireInt; date: string } | null
}

export interface CustomerDetailDTO {
  id: string
  name: string
  email: string
  points: CustomerPointsSummaryDTO
  recentOrders: { id: string; orderNumber: string; placedAt: string | null; total: string }[]
}

/** POST /orders/v1/customers/{id}/points/credit */
export interface PointsCreditRequest {
  points: WireInt
  reason: PointsCreditReason
  note?: string
  orderId?: string
}

/** POST /orders/v1/customers/{id}/points/debit */
export interface PointsDebitRequest {
  points: WireInt
  reason: PointsDebitReason
  note?: string
}

/** The answer to a credit or a debit. */
export interface PointsChangeResultDTO {
  entryId: string
  usable: WireInt
}

/** GET / PUT /orders/v1/points/settings */
export interface PointsSettingsDTO {
  centsPerPoint: WireInt
  expiryMonths: WireInt
  csaCreditLimitPoints: WireInt
  warningDays: WireInt
  holdMinutes: WireInt
  /** GET only: the recorded changes, newest first. */
  history?: { field: string; oldValue: string; newValue: string; changedBy: string; changedAt: string }[]
}

// ── Orders ──────────────────────────────────────────────────────────────────────────────────────────

/** How an order was paid and what has come back — on customer and staff order reads. */
export interface OrderPaymentSplitDTO {
  pointsUsed: WireInt
  pointsAmount: string
  cardAmount: string
  pointsReturned: WireInt
  cardReturned: string
}

/** Refusal codes a points change or a points checkout can answer with. */
export type PointsRefusalCode =
  | "points_invalid"
  | "reason_invalid"
  | "note_required"
  | "over_agent_limit"
  | "order_not_found"
  | "insufficient_points"
  | "points_balance_changed"
  | "points_exceed_total"
  | "points_card_remainder_too_small"
  | "refund_not_splittable"
