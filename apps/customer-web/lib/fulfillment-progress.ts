import type { OrderFulfillmentDTO, OrderShortfallDTO } from "@effy/shared-types"

/**
 * Aggregate the per-shop fulfilment portions into ONE customer-facing progress view (020 US5).
 *
 * Effy is a single brand with hidden fulfilment: the customer must never learn that their order was
 * split, how many places it was split across, or which places those were (FR-018, SC-009). That is
 * why this collapses the portions to a single label and a flat item list, and why it deliberately
 * exposes NO count, index, or per-portion structure — a "2 of 3 ready" would disclose the fan-out
 * just as surely as naming a shop would.
 *
 * Shortfalls arrive only on terminal portions (the backend omits them while picking), so an item
 * flagged unavailable and then found never reaches the customer (FR-018b, SC-017).
 */
export type ProgressStage = "confirmed" | "preparing" | "ready"

export interface FulfillmentProgress {
  stage: ProgressStage
  /** Flattened across portions — never grouped, because grouping would leak the split. */
  shortfalls: OrderShortfallDTO[]
}

const TERMINAL = new Set(["ready_for_pickup", "collected"])

export function summarizeFulfillment(
  portions: readonly OrderFulfillmentDTO[],
): FulfillmentProgress | null {
  if (portions.length === 0) return null

  const done = portions.filter((f) => TERMINAL.has(f.status)).length
  const started = portions.filter((f) => f.status === "picking").length

  // "ready" requires EVERY portion to be done. A partially-ready multi-shop order must not claim
  // completion — that would be misleading about what is actually on its way (US5 scenario 3).
  const stage: ProgressStage =
    done === portions.length ? "ready" : done > 0 || started > 0 ? "preparing" : "confirmed"

  return { stage, shortfalls: portions.flatMap((f) => f.unavailableItems ?? []) }
}

export const PROGRESS_LABEL: Record<ProgressStage, string> = {
  confirmed: "Confirmed — we'll start preparing your order shortly.",
  preparing: "Being prepared — we're gathering your items now.",
  ready: "Ready — your order is prepared and on its way to you.",
}
