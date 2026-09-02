import type { StockActorKind, StockMovementDTO, StockMovementReason } from "@effy/shared-types";

/**
 * The vocabulary for a stock movement, in ONE place (Principle II).
 *
 * ⚠ IT LIVES HERE BECAUSE TWO SURFACES NOW RENDER THE SAME ROWS: the Inventory section's full table
 * and the product rail's "Recent changes" summary. Two copies of a reason map is how the table comes
 * to say "Short at picking" while the rail beside it still says "pick_shortfall" — a divergence that
 * is silent, because both keep rendering something.
 */

const REASONS: Record<StockMovementReason, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
  order_paid: "Sold",
  pick_shortfall: "Short at picking",
  tracking_enabled: "Tracking turned on",
  tracking_disabled: "Tracking turned off",
};

/** ⚠ Falls back to the raw value rather than throwing: a reason the backend adds before this map
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
 * ⚠ IT SAYS WHEN SOMEONE OUTSIDE THE SHOP CHANGED THE SHOP'S NUMBERS. FR-027 requires that plainly:
 * a back-office correction that looked like the shop's own would leave an operator unable to explain
 * their own stock. A sale names its order, which is the only way a drop nobody at the shop made can
 * be reconciled.
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
 * One line for the rail: what moved, and by how much.
 *
 * ⚠ THE COUNT IS PART OF THE TITLE, not decoration. "Correction" alone tells an operator scanning the
 * rail nothing they can act on; "Correction −3" is the whole event.
 */
export function stockChangeTitle(movement: StockMovementDTO): string {
  return `${reasonLabel(movement)} ${formatDelta(movement.quantityDelta)}`;
}
