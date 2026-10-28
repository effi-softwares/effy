/**
 * Points: store credit Effy gives and the customer spends. Two shapes: a customer sees a sentence; staff
 * also see the reason code, the internal note and who made the change (the customer shape has no field
 * for the note). Points are a way of paying, never a discount. Money is a decimal string; a point count
 * is an integer.
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

/** What staff call each reason (the customer's words are decided by the server, per entry). */
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

// Customer

/** GET /customer/v1/points */
export interface PointsBalanceDTO {
  points: WireInt
  valueAmount: string
  centsPerPoint: WireInt
  /** The soonest lot to expire; null when nothing is due. */
  nextExpiry: { points: WireInt; date: string } | null
}

/** One history line as the customer sees it. */
export interface PointsHistoryEntryDTO {
  id: string
  kind: PointsEntryKind
  /** Signed. */
  points: WireInt
  valueAmount: string
  /** The sentence to show, decided by the server from the reason. */
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

/** GET /customer/v1/points: the balance and a page of history in one answer (every points screen shows both). `?cursor=` pages it. */
export interface CustomerPointsDTO extends PointsBalanceDTO {
  history: PointsHistoryPageDTO
}

// Back-office

/** One history line as staff see it: the customer's line plus the facts behind it. */
export interface StaffPointsHistoryEntryDTO extends PointsHistoryEntryDTO {
  reason: string
  /** Internal, staff only. */
  note: string | null
  authorKind: "staff" | "system" | "customer"
  /** A staff member's name, "Customer", or the platform flow's name. */
  authorName: string
  orderId: string | null
  refundId: string | null
}

/** The staff history page, concrete rather than generic so the Kotlin generators can read it. */
export interface StaffPointsHistoryPageDTO {
  entries: StaffPointsHistoryEntryDTO[]
  nextCursor?: string
}

/** A row of back-office › Customers, a console list (103). */
export interface CustomerListItemDTO {
  id: string
  name: string
  email: string
  phone: string | null
  joinedAt: string
  points: WireInt
  orderCount: WireInt
  /** The latest paid order; null when there is none. */
  lastOrderAt: string | null
}

export type CustomerListDTO = import("./list").ListPage<CustomerListItemDTO>

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

// Orders

/** How an order was paid and what has come back, on customer and staff order reads. */
export interface OrderPaymentSplitDTO {
  pointsUsed: WireInt
  pointsAmount: string
  cardAmount: string
  pointsReturned: WireInt
  cardReturned: string
}

