/**
 * Domain types and refusal vocabulary for stock (054). No HTTP, no SQL.
 *
 * The wire DTOs live in `@effy/shared-types` (Principle II) — this file holds only what the service
 * reasons about internally, plus the errors the handlers map to problem responses.
 */

import type { StockMovementReason } from "@effy/shared-types";

/** Who is acting. Resolved by the gate, never read from a request body. */
export interface Actor {
  sub: string;
  /**
   * ⚠ Resolved from the platform's own record — the caller's active shop for a shop actor, or the
   * shop named in the path for a back-office actor. NEVER taken from a shop route's client input:
   * that would make every shop's stock writable by any shop operator who could guess an id.
   */
  shopId: string;
  kind: "shop" | "back_office";
}

/**
 * ⚠ `notFound` covers BOTH "no such product" and "that product is another shop's".
 *
 * Distinguishing them would make this route an oracle for which product ids exist and who owns them,
 * which is the disclosure 007 has refused since the shop audience was built and 052 re-established
 * for the receipt resend. The two refusals must be byte-identical, not merely similar — a difference
 * in wording is a difference an attacker can read.
 */
export type StockErrorKind = "not_found" | "validation" | "conflict";

export class StockError extends Error {
  constructor(
    readonly kind: StockErrorKind,
    message: string,
    /** Per-field detail for a validation refusal, so the console can point at the input. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "StockError";
  }
}

export const notFound = (): StockError =>
  new StockError("not_found", "no such product");

/** The state of one product's stock, before mapping to a DTO. */
export interface StockRow {
  productId: string;
  shopId: string;
  tracked: boolean;
  onHand: number | null;
  threshold: number | null;
  shopDefaultThreshold: number | null;
}

export interface MovementRow {
  id: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: StockMovementReason;
  actorKind: "shop" | "back_office" | "system";
  actorLabel: string | null;
  orderNumber: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * The threshold actually in force: the product's own if set, else the shop's default, else none.
 *
 * ⚠ `null` means NOTHING counts as running low — it does NOT mean zero. A zero default would make
 * every product permanently "low", which is the same as no signal at all. A product at zero is still
 * reported, as `out`, by a separate rule (FR-005a).
 */
export function effectiveThreshold(row: Pick<StockRow, "threshold" | "shopDefaultThreshold">): number | null {
  return row.threshold ?? row.shopDefaultThreshold ?? null;
}
