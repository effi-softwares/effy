/**
 * Stock as an operator sees it, for shop-web and back-office. Nothing here reaches a customer surface: a
 * shopper only sees the `available` flag and the add-to-cart refusal.
 */

import type { WireInt } from "./cart"

/**
 * Why a count moved: a closed set mirroring the check on `public.stock_movement.reason`. Every count on
 * this contract is a `WireInt`.
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
  /** Returned on an item refund of an uncollected portion. */
  | "refund"

/** Every reason, in the order a filter offers them (the migration's CHECK holds the same set). */
export const STOCK_MOVEMENT_REASONS = [
  "received",
  "correction",
  "damage",
  "expiry",
  "order_paid",
  "pick_shortfall",
  "refund",
  "tracking_enabled",
  "tracking_disabled",
] as const satisfies readonly StockMovementReason[]

/** Who acted, kept apart from why (`reason`), so a shop sees plainly that back-office made a change. `system` is the paid-order path. */
export type StockActorKind = "shop" | "back_office" | "system"

/** The reasons a human may choose. `order_paid` and `pick_shortfall` are written by the platform. */
export const OPERATOR_STOCK_REASONS = [
  "received",
  "correction",
  "damage",
  "expiry",
] as const satisfies readonly StockMovementReason[]

export type OperatorStockReason = (typeof OPERATOR_STOCK_REASONS)[number]

/** A variant's stock, as an operator screen needs it. */
export interface ProductStockDTO {
  productId: string
  /** Stock is counted per variant. */
  variantId: string
  /** false = unlimited. */
  tracked: boolean
  /** null exactly when untracked (the database makes "tracked with no count" unrepresentable). */
  onHand: WireInt | null
  /** The variant's own threshold, or null to fall back to the shop default. */
  threshold: WireInt | null
  /** Own threshold, else shop default, else null (nothing counts as low). */
  effectiveThreshold: WireInt | null
  /** tracked && onHand === 0. */
  outOfStock: boolean
  /** tracked && effectiveThreshold !== null && onHand > 0 && onHand <= effectiveThreshold. Never also `outOfStock`. */
  low: boolean
}

export interface StockMovementDTO {
  id: string
  quantityDelta: WireInt
  quantityBefore: WireInt
  quantityAfter: WireInt
  reason: StockMovementReason
  actorKind: StockActorKind
  /** A display name where the platform holds one; never an email address. */
  actorLabel: string | null
  /** The order that caused it, by customer-facing reference; null for a person's own change. */
  orderNumber: string | null
  note: string | null
  createdAt: string
}

export interface ProductStockDetailDTO {
  stock: ProductStockDTO
  /** Newest first. */
  movements: StockMovementDTO[]
}

export interface LowStockRowDTO {
  productId: string
  variantId: string
  name: string
  /** "1 kg"; null for a product with no options. */
  variantLabel: string | null
  sku: string | null
  onHand: WireInt
  effectiveThreshold: WireInt | null
  /** "out" sorts above "low". */
  severity: "out" | "low"
}

export interface ShopStockSettingsDTO {
  /** null = no default (nothing counts as low); zero stock is still reported as out. */
  defaultThreshold: WireInt | null
}

// Write bodies. Every body that moves a count carries a reason; turning tracking on or off implies its own.

export interface SetStockRequest {
  onHand: WireInt
  reason: OperatorStockReason
  note?: string
}

export interface AdjustStockRequest {
  /** Signed and never zero. */
  delta: WireInt
  reason: OperatorStockReason
  note?: string
}

export interface SetTrackingRequest {
  tracked: boolean
  /** Required when enabling, ignored when disabling. */
  onHand?: WireInt
}

export interface SetThresholdRequest {
  /** null clears the variant's own threshold. */
  threshold: WireInt | null
}

export interface SetShopStockSettingsRequest {
  /** null clears the shop default. */
  defaultThreshold: WireInt | null
}
