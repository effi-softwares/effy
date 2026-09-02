import type { LowStockRowDTO } from "@effy/shared-types"

import type { FulfillmentSummary } from "@/features/fulfillment/model"

/**
 * The dashboard's numbers, DERIVED from the two reads the console already makes (T018, FR-006).
 *
 * ⚠ NO NEW ENDPOINT, AND THAT IS A DESIGN DECISION RATHER THAN A SHORTCUT. The order queue and the
 * restock list are both already fetched, cached and polled by TanStack Query under their own keys; a
 * `/shop/v1/dashboard` summary would be a THIRD source for facts the client already holds, free to
 * disagree with the screens it is summarising. 052 deleted `summarizeFulfillment` for exactly that —
 * two implementations of one rule, on two surfaces, diverging silently. The dashboard reads the same
 * cache the queue reads, so a count here and the rows there cannot drift apart.
 *
 * ⚠ AND EVERY FIGURE IS COUNTED, NEVER STORED (027's rule, applied a fourth time).
 */
export interface DashboardCounts {
  /** Portions that need a human to start or continue picking. */
  toPick: number
  /** Picked and waiting for a driver. Done for this shop, not yet gone. */
  readyForPickup: number
  /**
   * ⚠ Portions past their promised ready-by time, or close enough to be at risk. The server decides
   * this — `atRisk` is on the wire (020 FR-001a) — because "close enough" depends on the collection
   * schedule, which the client does not know.
   */
  atRisk: number
  /** Tracked products at or below their threshold, plus everything at zero. */
  needsRestock: number
  /** The subset of the above that is actually out of stock — unbuyable right now. */
  outOfStock: number
}

/** States that still need something from this shop. Anything else is finished or not ours. */
const NEEDS_PICKING: ReadonlySet<string> = new Set(["pending", "received", "picking"])

export function countsFrom(
  orders: readonly FulfillmentSummary[],
  lowStock: readonly LowStockRowDTO[],
): DashboardCounts {
  return {
    toPick: orders.filter((o) => NEEDS_PICKING.has(o.status)).length,
    readyForPickup: orders.filter((o) => o.status === "ready_for_pickup").length,
    atRisk: orders.filter((o) => o.atRisk).length,
    needsRestock: lowStock.length,
    outOfStock: lowStock.filter((r) => r.severity === "out").length,
  }
}

/**
 * One row of the needs-attention list — a thing a person can go and act on right now (FR-007).
 *
 * ⚠ IT IS A UNION OF TWO KINDS ON PURPOSE. An operator opening the console asks "what needs me?",
 * not "show me orders" and separately "show me stock". Splitting them into two lists makes the person
 * do the merge, which is the job the screen exists to do.
 */
export type AttentionItem =
  | {
      kind: "order"
      id: string
      title: string
      detail: string
      /** Rendered with emphasis — weight and an icon, never a hue (Principle V). */
      urgent: boolean
    }
  | {
      kind: "product"
      id: string
      title: string
      detail: string
      urgent: boolean
    }

/**
 * ⚠ ORDERS BEFORE STOCK, AND AT-RISK BEFORE EVERYTHING. An empty shelf costs a sale; a late order
 * has already been paid for and has a customer waiting on it. Within orders the server's own
 * ordering is preserved (promise, then arrival — 020 FR-001b) rather than re-sorted here, for the
 * same reason the queue never re-sorts: a list that reshuffles under a working hand is how the wrong
 * thing gets picked.
 */
export function attentionFrom(
  orders: readonly FulfillmentSummary[],
  lowStock: readonly LowStockRowDTO[],
  limit = 6,
): AttentionItem[] {
  const waiting = orders.filter((o) => NEEDS_PICKING.has(o.status))
  const orderItems: AttentionItem[] = [
    ...waiting.filter((o) => o.atRisk),
    ...waiting.filter((o) => !o.atRisk),
  ].map((o) => ({
    kind: "order",
    id: o.id,
    title: o.orderNumber,
    detail: o.atRisk
      ? `At risk · ${o.gatheredCount}/${o.itemCount} picked`
      : `${o.gatheredCount}/${o.itemCount} picked`,
    urgent: o.atRisk,
  }))

  const stockItems: AttentionItem[] = [
    ...lowStock.filter((r) => r.severity === "out"),
    ...lowStock.filter((r) => r.severity !== "out"),
  ].map((r) => ({
    kind: "product",
    id: r.productId,
    title: r.name,
    detail: r.severity === "out" ? "Out of stock" : `Low · ${r.onHand} left`,
    urgent: r.severity === "out",
  }))

  return [...orderItems, ...stockItems].slice(0, limit)
}
