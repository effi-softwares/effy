import type { OrderFulfillmentDTO, OrderShortfallDTO } from "@effy/shared-types"

/**
 * Shortfalls across the per-shop portions, as one flat item list with no count, index or per-portion
 * structure: the customer must never learn the order was split ("2 of 3 ready" discloses that). They
 * arrive only on terminal portions, so an item flagged and then found never reaches the customer. The
 * order's stage is server-derived (`OrderDTO.stage`): render it, never recompute it.
 */
export function shortfallsFrom(
  portions: readonly OrderFulfillmentDTO[],
): OrderShortfallDTO[] {
  return portions.flatMap((f) => f.unavailableItems ?? [])
}
