/**
 * 057-shop-console-redesign — a restock in flight.
 *
 * ⚠ EVERY COUNT HERE IS A `WireInt`, NOT A BARE `number` (027's R13, restated by 054). A bare
 * `number` generates as Kotlin `Double`, the wire carries `24.0`, and a Go/`int` decode rejects it
 * silently. shop-mobile has no purchase-order screen today, but this contract is in the shared
 * package precisely so it can gain one without a wire fix first.
 *
 * ⚠ NO `total` FIELD ANYWHERE. The value of an order is SUMMED from its lines on read — 027's
 * counted-not-stored rule, the same reasoning 055 used to refuse a `refunded_amount` column: a
 * stored total and the lines it claims to summarise can disagree, and then nobody knows which the
 * shop actually owes the supplier.
 */

import type { WireInt } from "./cart"

/**
 * ⚠ `partially_received` IS NOT TERMINAL. A second delivery can complete the order, and treating it
 * as an end state is how an outstanding delivery stops being chased. Exactly two states are terminal
 * — `received` and `cancelled` — and only they carry a `closedAt`.
 */
export type PurchaseOrderStatus =
  /** Being built. Freely editable, freely deletable, the supplier has not been told. */
  | "draft"
  /** Sent to the supplier. Lines are frozen — see [PurchaseOrderDTO.linesEditable]. */
  | "submitted"
  /** Some goods arrived, some are outstanding. NOT terminal. */
  | "partially_received"
  /** Everything ordered has arrived. Terminal. */
  | "received"
  /**
   * ⚠ Distinct from deleting a draft, and deliberately so: a submitted order that is called off is a
   * fact the supplier also knows about. Deleting it would erase a conversation that happened.
   */
  | "cancelled"

export interface PurchaseOrderLineDTO {
  id: string
  productId: string
  productName: string
  sku: string | null
  orderedQuantity: WireInt
  /**
   * ⚠ CUMULATIVE ACROSS PARTIAL RECEIVES, and it may legitimately EXCEED `orderedQuantity` —
   * suppliers over-ship, and a UI that refuses to show 25 against an order of 24 forces the operator
   * to lie about what is on the shelf. Render the variance; never clamp it.
   */
  receivedQuantity: WireInt
  /** Per unit, GST-inclusive, in the order's currency. Null when the price was not agreed up front. */
  unitCost: string | null
}

export interface PurchaseOrderDTO {
  id: string
  reference: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  currency: string
  note: string | null
  lines: PurchaseOrderLineDTO[]
  /**
   * Derived server-side by summing `orderedQuantity × unitCost` over the lines. Null when any line
   * has no `unitCost` — a partial total is a wrong number, not a helpful one.
   */
  estimatedTotal: string | null
  /**
   * ⚠ SERVER-DERIVED, never inferred client-side from `status`. The rule ("only a draft is editable")
   * lives in one place, so a later state that also permits editing does not need every screen
   * changed — the same reason 052 moved the order stage into `stage.go`.
   */
  linesEditable: boolean
  createdAt: string
  submittedAt: string | null
  closedAt: string | null
}

/** Summary row for the purchase-order list. No lines — the list does not need them. */
export interface PurchaseOrderSummaryDTO {
  id: string
  reference: string
  supplierName: string
  status: PurchaseOrderStatus
  lineCount: WireInt
  estimatedTotal: string | null
  currency: string
  createdAt: string
  submittedAt: string | null
}

export interface CreatePurchaseOrderLineRequest {
  productId: string
  orderedQuantity: WireInt
  unitCost?: string | null
}

export interface CreatePurchaseOrderRequest {
  supplierId: string
  /** Optional — the service mints a per-shop sequential reference when absent. */
  reference?: string
  note?: string | null
  lines: CreatePurchaseOrderLineRequest[]
}

export interface UpdatePurchaseOrderRequest {
  note?: string | null
  lines?: CreatePurchaseOrderLineRequest[]
  /** The only transitions a client may request directly. Receiving goes through its own route. */
  status?: "submitted" | "cancelled"
}

/**
 * One line of a receive.
 *
 * ⚠ `receivedQuantity` IS THE NEW CUMULATIVE TOTAL, NOT A DELTA (FR-017e). 027 settled this for the
 * cart and 020 for the pick list, for the same reason each time: an absolute write is idempotent, so
 * a double-tap on a shop tablet with a flaky connection cannot book the same pallet twice. A delta
 * cannot be made safe without a dedupe key the operator has no way to supply.
 */
export interface ReceivePurchaseOrderLine {
  lineId: string
  receivedQuantity: WireInt
}

export interface ReceivePurchaseOrderRequest {
  lines: ReceivePurchaseOrderLine[]
  note?: string | null
}
