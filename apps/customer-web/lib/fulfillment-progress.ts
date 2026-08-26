import type { OrderFulfillmentDTO, OrderShortfallDTO } from "@effy/shared-types"

/**
 * Shortfalls across the per-shop fulfilment portions (020 US5).
 *
 * Effy is a single brand with hidden fulfilment: the customer must never learn that their order was
 * split, how many places it was split across, or which places those were (FR-018, SC-009). That is
 * why this returns a FLAT item list and deliberately exposes no count, index, or per-portion
 * structure — a "2 of 3 ready" would disclose the fan-out just as surely as naming a shop would.
 *
 * Shortfalls arrive only on terminal portions (the backend omits them while picking), so an item
 * flagged unavailable and then found never reaches the customer (FR-018b, SC-017).
 *
 * ── ⚠ THE STAGE DERIVATION THAT USED TO LIVE HERE IS GONE (052 FR-008) ──────────────────────────
 *
 * This module also computed a four-value `ProgressStage` from the portions, with the same
 * "every portion must reach it" rule the server now applies in
 * `apis/core-api/internal/features/orders/stage.go`. It was not wrong — it was a SECOND
 * implementation of one rule, in a second language, and that is the shape of 029's banner target and
 * 033's `available` flag: both surfaces keep rendering something, so the divergence is silent.
 *
 * The stage is now SERVER-DERIVED and arrives as `OrderDTO.stage`. Render it; never recompute it.
 */
export function shortfallsFrom(
  portions: readonly OrderFulfillmentDTO[],
): OrderShortfallDTO[] {
  return portions.flatMap((f) => f.unavailableItems ?? [])
}
