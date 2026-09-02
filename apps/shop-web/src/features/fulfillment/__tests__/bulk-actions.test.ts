import { describe, expect, it } from "vitest"

import { bulkCandidates, summarise } from "../bulk"
import type { FulfillmentSummary } from "../model"

/**
 * US2 (T024) — bulk state-advance.
 *
 * ⚠ THE SUMMARY IS THE POINT. 033 shipped a bulk control that reported "0 items added to your cart"
 * while every item had failed for a reason the shopper was never shown — the count was true and
 * useless. These pin that a bulk run names what refused, and never claims success for work that did
 * not happen.
 */

function row(over: Partial<FulfillmentSummary> = {}): FulfillmentSummary {
  return {
    id: "f1",
    orderNumber: "EFY-1",
    placedAt: "2026-09-02T00:00:00Z",
    status: "received",
    stateChangedAt: "2026-09-02T00:01:00Z",
    itemCount: 2,
    gatheredCount: 0,
    unavailableCount: 0,
    promise: { serviceLevel: "standard", readyBy: "2026-09-02T02:00:00Z" },
    atRisk: false,
    ...over,
  }
}

describe("bulkCandidates", () => {
  it("advances each portion to ITS OWN next state, not one state chosen for all", () => {
    const rows = [
      row({ id: "a", status: "received" }),
      row({ id: "b", status: "picking" }),
    ]
    const got = bulkCandidates(rows, new Set(["a", "b"]))
    expect(got).toEqual([
      { id: "a", orderNumber: "EFY-1", to: "picking" },
      { id: "b", orderNumber: "EFY-1", to: "ready_for_pickup" },
    ])
  })

  it("ignores rows that were not selected", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })]
    expect(bulkCandidates(rows, new Set(["a"])).map((c) => c.id)).toEqual(["a"])
  })

  /**
   * ⚠ THE MOST IMPORTANT ASSERTION IN THIS FILE. `nextTransition` may one day return
   * `unfulfillable`, and that decision tells Effy to REFUND A CUSTOMER (055 FR-031). It requires a
   * typed reason and must never ride a control where one click covers rows the operator did not read
   * individually. This is the 053/056 enum-widening shape caught before it can happen.
   */
  it("never offers 'unfulfillable' in a bulk run, whatever nextTransition returns", () => {
    const every: FulfillmentSummary["status"][] = [
      "pending",
      "received",
      "picking",
      "ready_for_pickup",
      "collected",
      "delivered",
      "unfulfillable",
      "withdrawn",
    ]
    const rows = every.map((status, i) => row({ id: `r${i}`, status }))
    const got = bulkCandidates(rows, new Set(rows.map((r) => r.id)))
    expect(got.every((c) => c.to !== "unfulfillable")).toBe(true)
  })

  it("skips terminal portions rather than inventing a step for them", () => {
    const rows = [
      row({ id: "done", status: "collected" }),
      row({ id: "gone", status: "withdrawn" }),
      row({ id: "live", status: "received" }),
    ]
    expect(bulkCandidates(rows, new Set(["done", "gone", "live"])).map((c) => c.id)).toEqual(["live"])
  })
})

describe("summarise", () => {
  it("counts what advanced", () => {
    expect(summarise({ succeeded: ["EFY-1", "EFY-2"], failed: [], skipped: 0 })).toBe(
      "2 orders advanced.",
    )
  })

  it("names what refused instead of only counting it", () => {
    const msg = summarise({
      succeeded: ["EFY-1"],
      failed: [{ orderNumber: "EFY-9", reason: "someone else moved it" }],
      skipped: 0,
    })
    expect(msg).toContain("1 order advanced")
    expect(msg).toContain("EFY-9")
  })

  it("reports rows that had nothing to advance separately from failures", () => {
    const msg = summarise({ succeeded: [], failed: [], skipped: 3 })
    expect(msg).toBe("3 had nothing to advance.")
    // ⚠ Must not read as a failure — nothing went wrong, there was simply no work.
    expect(msg).not.toMatch(/refused|failed|error/i)
  })

  it("never claims success when nothing moved", () => {
    const msg = summarise({
      succeeded: [],
      failed: [{ orderNumber: "EFY-9", reason: "conflict" }],
      skipped: 0,
    })
    expect(msg).not.toMatch(/advanced/)
  })

  it("never returns an empty string — a silent control looks broken", () => {
    expect(summarise({ succeeded: [], failed: [], skipped: 0 })).toBe("Nothing to advance.")
  })
})
