/**
 * 054-product-inventory — stock as an OPERATOR sees it.
 *
 * ⚠ NOTHING HERE EVER REACHES A CUSTOMER SURFACE. FR-015 forbids disclosing a unit count on any
 * browse surface and forbids disclosing shop identity anywhere at all; the single permitted
 * disclosure is the add-to-cart refusal (FR-015b), which rides the existing cart problem body and is
 * NOT modelled here. A shopper's whole experience of this feature is the VALUE of the `available`
 * flag they already receive — which is why this slice changes no customer DTO.
 *
 * Consumed by shop-web, back-office, and shop-mobile through the generated `contract-shop/` Kotlin.
 */

import type { WireInt } from "./cart"

/**
 * ⚠ EVERY COUNT ON THIS CONTRACT IS A `WireInt`, NOT A BARE `number`.
 *
 * 027's R13: Kotlin serialises a bare `number` field as `Double`, so the wire carried `1.0` where the
 * backend expected an integer, and every mobile cart write was silently rejected. The fix was made AT
 * THE CONTRACT — a `WireInt` alias carrying `@asType integer` — precisely so the generated Kotlin
 * cannot regress. The first draft of this file used bare `number` and the generator duly emitted
 * `Double` for `onHand`, `delta` and `threshold`; caught by reading the generated Kotlin back, which
 * is the only place that mistake is visible.
 *
 * Why a count moved. A CLOSED set, mirroring the CHECK on `public.stock_movement.reason` — the
 * database and this union are one contract, and a value in either that the other lacks is a defect.
 *
 * ⚠ There is deliberately NO `cancellation` or `refund` member. Neither capability exists on the
 * platform (order-flow gap register, Tier 2), and a value nothing can produce implies one that does.
 * The set grows when the slice that needs it lands.
 */
export type StockMovementReason =
  | "received"
  | "correction"
  | "damage"
  | "expiry"
  | "order_paid"
  | "pick_shortfall"
  | "tracking_enabled"
  | "tracking_disabled"

/**
 * WHO acted, kept separate from WHY (`reason`).
 *
 * ⚠ The separation is what makes FR-027 possible: a shop reading its own history must be able to see
 * plainly that back-office made a change, without back-office having to pick a reason that says so.
 * `system` is the paid-order path — the only actor with no person behind it.
 */
export type StockActorKind = "shop" | "back_office" | "system"

/** The reasons a human may choose. `order_paid` and `pick_shortfall` are written by the platform. */
export const OPERATOR_STOCK_REASONS = [
  "received",
  "correction",
  "damage",
  "expiry",
] as const satisfies readonly StockMovementReason[]

export type OperatorStockReason = (typeof OPERATOR_STOCK_REASONS)[number]

/** A product's stock, as one operator screen needs it. */
export interface ProductStockDTO {
  productId: string
  /** false = unlimited, and identical to how the product behaved before 054 existed (FR-002). */
  tracked: boolean
  /** null exactly when untracked — the database makes "tracked with no count" unrepresentable. */
  onHand: WireInt | null
  /** This product's own threshold, or null to fall back to the shop default. */
  threshold: WireInt | null
  /** Product threshold, else shop default, else null — null meaning nothing counts as low. */
  effectiveThreshold: WireInt | null
  /** tracked && onHand === 0. */
  outOfStock: boolean
  /**
   * tracked && effectiveThreshold !== null && onHand > 0 && onHand <= effectiveThreshold.
   * ⚠ Mutually exclusive with `outOfStock`: an empty shelf and a thin one are different problems
   * needing different actions, and collapsing them tells the operator nothing to act on.
   */
  low: boolean
}

export interface StockMovementDTO {
  id: string
  quantityDelta: WireInt
  quantityBefore: WireInt
  quantityAfter: WireInt
  reason: StockMovementReason
  actorKind: StockActorKind
  /** A display name where the platform holds one. ⚠ Never an email address (no PII in an audit read). */
  actorLabel: string | null
  /** The order that caused it, by its customer-facing reference. null for a human's own change. */
  orderNumber: string | null
  note: string | null
  createdAt: string
}

export interface ProductStockDetailDTO {
  stock: ProductStockDTO
  /** Newest first (FR-009). */
  movements: StockMovementDTO[]
}

export interface LowStockRowDTO {
  productId: string
  name: string
  sku: string | null
  onHand: WireInt
  effectiveThreshold: WireInt | null
  /** "out" sorts above "low" — an empty shelf is not the same problem as a thin one. */
  severity: "out" | "low"
  /**
   * ⚠ 057 (FR-018) — the product's default supplier, so the restock queue can group by who to order
   * from. BOTH ARE NULLABLE AND NULL IS A FIRST-CLASS STATE, not a gap: a shop that has never recorded
   * a supplier still gets a working restock list, with those products in their own "Unassigned"
   * bucket. That is what keeps this non-breaking for every product that existed before 057.
   */
  supplierId: string | null
  supplierName: string | null
}

export interface ShopStockSettingsDTO {
  /** null = no default, so nothing counts as low; zero stock is still reported as out (FR-005a). */
  defaultThreshold: WireInt | null
}

// ── Write bodies ────────────────────────────────────────────────────────────────────────────────
// Every body that MOVES a count carries a reason (FR-007). Turning tracking on or off supplies its
// own reason implicitly, so it does not ask for one.

export interface SetStockRequest {
  onHand: WireInt
  reason: OperatorStockReason
  note?: string
}

export interface AdjustStockRequest {
  /** Signed. Never zero — a movement that moves nothing is a record with no fact behind it. */
  delta: WireInt
  reason: OperatorStockReason
  note?: string
}

export interface SetTrackingRequest {
  tracked: boolean
  /** REQUIRED when enabling (FR-003), ignored when disabling. */
  onHand?: WireInt
}

export interface SetThresholdRequest {
  /** null clears this product's own threshold, falling back to the shop default. */
  threshold: WireInt | null
}

export interface SetShopStockSettingsRequest {
  /** null clears the shop default. */
  defaultThreshold: WireInt | null
}
