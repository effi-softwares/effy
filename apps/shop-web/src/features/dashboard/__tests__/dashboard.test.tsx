import { describe, expect, it } from "vitest"

import type { LowStockRowDTO } from "@effy/shared-types"

import type { FulfillmentSummary } from "@/features/fulfillment/model"

import { attentionFrom, countsFrom } from "../model"

/**
 * US1 — the dashboard's counts are DERIVED, and this pins the derivation (T015).
 *
 * ⚠ These test the pure functions, not the rendered screen, and deliberately so. The defect this
 * feature fixes was not a rendering bug — it was four hard-coded em-dashes. What must never regress is
 * the ARITHMETIC over the two existing reads, which is exactly what a render test would obscure behind
 * a query mock that agrees with whatever the code does. 033's post-mortem names that shape: "the
 * fixture agreed with the code instead of with the world."
 */

function order(over: Partial<FulfillmentSummary> = {}): FulfillmentSummary {
  return {
    id: "f1",
    orderNumber: "EFY-AAA111",
    placedAt: "2026-09-02T00:00:00Z",
    promise: { readyBy: "2026-09-02T02:00:00Z", serviceLevel: "Same-day" },
    atRisk: false,
    itemCount: 3,
    gatheredCount: 0,
    unavailableCount: 0,
    status: "pending",
    ...over,
  } as FulfillmentSummary
}

function lowStockRow(over: Partial<LowStockRowDTO> = {}): LowStockRowDTO {
  return {
    productId: "p1",
    name: "Barossa Free-Range Eggs 700g",
    sku: "EGG-700",
    onHand: 2,
    effectiveThreshold: 5,
    severity: "low",
    ...over,
  } as LowStockRowDTO
}

describe("dashboard counts", () => {
  it("counts every state that still needs a human as 'to pick'", () => {
    const counts = countsFrom(
      [
        order({ id: "a", status: "pending" }),
        order({ id: "b", status: "received" }),
        order({ id: "c", status: "picking" }),
        order({ id: "d", status: "ready_for_pickup" }),
      ],
      [],
    )
    expect(counts.toPick).toBe(3)
    expect(counts.readyForPickup).toBe(1)
  })

  /**
   * ⚠ The regression this guards is the one 053 and 056 both shipped: a status set that grows and a
   * reader that silently admits the new value. `collected`, `delivered`, `unfulfillable` and
   * `withdrawn` all need NOTHING from this shop, and a dashboard that counts them as work to do sends
   * a picker looking for a package that left hours ago.
   */
  it("counts no terminal state as outstanding work", () => {
    const terminal = ["collected", "delivered", "unfulfillable", "withdrawn"] as const
    for (const status of terminal) {
      const counts = countsFrom([order({ status })], [])
      expect(counts.toPick, `${status} must not read as work to do`).toBe(0)
      expect(counts.readyForPickup, `${status} is not awaiting a driver`).toBe(0)
    }
  })

  it("takes at-risk from the server's flag rather than re-deriving it from the promise", () => {
    // The client does not know the collection schedule, so it must not compute this itself (020).
    const counts = countsFrom([order({ atRisk: true }), order({ id: "b", atRisk: false })], [])
    expect(counts.atRisk).toBe(1)
  })

  it("separates 'needs restocking' from the out-of-stock subset", () => {
    const counts = countsFrom(
      [],
      [
        lowStockRow({ productId: "a", severity: "out", onHand: 0 }),
        lowStockRow({ productId: "b", severity: "low" }),
        lowStockRow({ productId: "c", severity: "low" }),
      ],
    )
    expect(counts.needsRestock).toBe(3)
    expect(counts.outOfStock).toBe(1)
  })

  it("reads zero across the board for a shop with nothing outstanding", () => {
    expect(countsFrom([], [])).toEqual({
      toPick: 0,
      readyForPickup: 0,
      atRisk: 0,
      needsRestock: 0,
      outOfStock: 0,
    })
  })
})

describe("needs-attention list", () => {
  it("puts at-risk orders first, then other orders, then stock", () => {
    const items = attentionFrom(
      [
        order({ id: "calm", orderNumber: "EFY-CALM01", atRisk: false }),
        order({ id: "late", orderNumber: "EFY-LATE01", atRisk: true }),
      ],
      [lowStockRow({ productId: "p9", severity: "out" })],
    )
    expect(items.map((i) => i.id)).toEqual(["late", "calm", "p9"])
  })

  it("marks at-risk orders and out-of-stock products urgent, and nothing else", () => {
    const items = attentionFrom(
      [order({ id: "calm", atRisk: false })],
      [
        lowStockRow({ productId: "out", severity: "out" }),
        lowStockRow({ productId: "low", severity: "low" }),
      ],
    )
    expect(items.find((i) => i.id === "calm")?.urgent).toBe(false)
    expect(items.find((i) => i.id === "out")?.urgent).toBe(true)
    expect(items.find((i) => i.id === "low")?.urgent).toBe(false)
  })

  it("excludes finished orders — they need nobody's attention", () => {
    const items = attentionFrom([order({ id: "gone", status: "collected" })], [])
    expect(items).toHaveLength(0)
  })

  it("caps the list so the screen stays scannable", () => {
    const many = Array.from({ length: 20 }, (_, i) => order({ id: `o${i}` }))
    expect(attentionFrom(many, [], 6)).toHaveLength(6)
  })

  it("carries the id the row must link to, per kind", () => {
    const items = attentionFrom([order({ id: "fulfil-1" })], [lowStockRow({ productId: "prod-1" })])
    expect(items[0]).toMatchObject({ kind: "order", id: "fulfil-1" })
    expect(items[1]).toMatchObject({ kind: "product", id: "prod-1" })
  })
})
