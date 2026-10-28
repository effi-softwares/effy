import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { StockMovementDTO } from "@effy/shared-types"

import { onePage, renderList } from "@/test/renderList"

const fetchMovementPage = vi.hoisted(() => vi.fn())
vi.mock("../stockRepo", async (importOriginal) => ({ ...(await importOriginal<object>()), fetchMovementPage }))

const { StockHistory } = await import("../StockHistory")

function movement(over: Partial<StockMovementDTO> = {}): StockMovementDTO {
  return {
    id: "m-1",
    quantityDelta: -2,
    quantityBefore: 10,
    quantityAfter: 8,
    reason: "order_paid",
    actorKind: "system",
    actorLabel: null,
    orderNumber: "EF-1001",
    note: null,
    createdAt: "2026-10-28T01:00:00.000Z",
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMovementPage.mockResolvedValue(onePage([movement()], { page: null }))
})

describe("a size's stock movements (103)", () => {
  it("shows each change with its reason, count and who caused it", async () => {
    renderList(() => <StockHistory variantId="v1" />, "/catalog/p1")
    expect(await screen.findByText("Sold")).toBeInTheDocument()
    expect(screen.getByText("Order EF-1001")).toBeInTheDocument()
    expect(screen.getByText(/10 → 8/)).toBeInTheDocument()
  })

  it("asks the server for the size's page with the reason the address names", async () => {
    renderList(() => <StockHistory variantId="v1" />, "/catalog/p1?mv.reason=damage")
    await waitFor(() => expect(fetchMovementPage).toHaveBeenCalled())
    const [variantId, qs] = fetchMovementPage.mock.calls[0]! as [string, URLSearchParams]
    expect(variantId).toBe("v1")
    expect(qs.get("reason")).toBe("damage")
  })

  it("says plainly when nothing has been recorded", async () => {
    fetchMovementPage.mockResolvedValue(onePage([], { page: null }))
    renderList(() => <StockHistory variantId="v1" />, "/catalog/p1")
    expect(await screen.findByText("No stock changes recorded yet")).toBeInTheDocument()
  })
})
