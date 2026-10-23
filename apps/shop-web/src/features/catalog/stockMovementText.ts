import type { StockActorKind, StockMovementDTO, StockMovementReason } from "@effy/shared-types";

/**
 * The vocabulary for a stock movement, in one place (Principle II).
 *
 * It lives here because two surfaces now render the same rows: the Inventory tab's full table
 * and the Activity sheet's change log. Two copies of a reason map is how the table comes to say
 * "Short at picking" while the sheet still says "pick_shortfall" — a divergence that
 * is silent, because both keep rendering something.
 */

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
};

/** Falls back to the raw value rather than throwing: a reason the backend adds before this map
 *  learns it must degrade to something legible, never to a blank cell or a crash (tolerant reader). */
export function reasonLabel(movement: StockMovementDTO): string {
  return REASONS[movement.reason] ?? movement.reason;
}

const ACTORS: Record<StockActorKind, string> = {
  shop: "",
  back_office: "Effy support",
  system: "Automatic",
};

/**
 * Says when someone outside the shop changed its numbers, so a back-office correction never looks like
 * the shop's own; a sale names its order, so a drop nobody at the shop made can be reconciled.
 */
export function actorLabel(movement: StockMovementDTO): string {
  if (movement.actorKind === "system") {
    return movement.orderNumber ? `Order ${movement.orderNumber}` : ACTORS.system;
  }
  if (movement.actorKind === "back_office") {
    return movement.actorLabel ? `${movement.actorLabel} (Effy support)` : ACTORS.back_office;
  }
  return movement.actorLabel ?? "—";
}

/** A signed number, so an increase and a reduction are told apart at a glance without colour. */
export function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * One change-log line: what moved, and by how much.
 *
 * The count is part of the title, not decoration. "Correction" alone tells an operator scanning the
 * log nothing they can act on; "Correction −3" is the whole event.
 */
export function stockChangeTitle(movement: StockMovementDTO): string {
  return `${reasonLabel(movement)} ${formatDelta(movement.quantityDelta)}`;
}
