import type { StockActorKind, StockMovementDTO, StockMovementReason } from "@effy/shared-types"

const REASONS: Record<StockMovementReason, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
  order_paid: "Sold",
  pick_shortfall: "Short at picking",
  refund: "Returned on a refund",
  tracking_enabled: "Tracking turned on",
  tracking_disabled: "Tracking turned off",
}

export function reasonLabel(movement: StockMovementDTO): string {
  return REASONS[movement.reason] ?? movement.reason
}

const ACTORS: Record<StockActorKind, string> = {
  shop: "",
  back_office: "Effy support",
  system: "Automatic",
}

export function actorLabel(movement: StockMovementDTO): string {
  if (movement.actorKind === "system") {
    return movement.orderNumber ? `Order ${movement.orderNumber}` : ACTORS.system
  }
  if (movement.actorKind === "back_office") {
    return movement.actorLabel ? `${movement.actorLabel} (Effy support)` : ACTORS.back_office
  }
  return movement.actorLabel ?? "—"
}

export function formatDelta(delta: number): string {
  if (delta === 0) return "0"
  return delta > 0 ? `+${delta}` : String(delta)
}

export function stockChangeTitle(movement: StockMovementDTO): string {
  return `${reasonLabel(movement)} ${formatDelta(movement.quantityDelta)}`
}
