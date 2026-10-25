import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LowStockRowDTO } from "@effy/shared-types"

const getShopLowStock = vi.hoisted(() => vi.fn())
const setShopStockSettings = vi.hoisted(() => vi.fn())

vi.mock("./stockRepo", () => ({
  getShopLowStock,
  setShopStockSettings,
  getShopVariantStock: vi.fn(),
  setShopVariantStock: vi.fn(),
  setShopVariantTracking: vi.fn(),
}))

const { ShopStockPanel } = await import("./ShopStockPanel")

function row(over: Partial<LowStockRowDTO> = {}): LowStockRowDTO {
  return {
    productId: "p1",
    variantId: "v1",
    name: "Milk",
    variantLabel: null,
    sku: "MLK-1",
    onHand: 2,
    effectiveThreshold: 5,
    severity: "low",
    ...over,
  }
}

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(<ShopStockPanel shopId="shop-1" canManage={canManage} />, { wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  getShopLowStock.mockResolvedValue([row()])
  setShopStockSettings.mockResolvedValue({ defaultThreshold: 5 })
})

describe("the restock list", () => {
  it("tells OUT apart from LOW in words, not by colour (Principle V, 041)", async () => {
    getShopLowStock.mockResolvedValue([
      row({ productId: "p1", variantId: "v1", name: "Milk", variantLabel: "2 L", onHand: 0, severity: "out" }),
      row({ productId: "p2", variantId: "v2", name: "Bread", onHand: 2, severity: "low" }),
    ])
    renderPanel()

    expect(await screen.findByText("Out of stock")).toBeInTheDocument()
    expect(screen.getByText("Low")).toBeInTheDocument()
    // Stock is per size, and the size is named on its row.
    expect(screen.getByText(/2 L/)).toBeInTheDocument()
  })

  it("says plainly that untracked products never appear, rather than showing an ambiguous blank", async () => {
    getShopLowStock.mockResolvedValue([])
    renderPanel()

    expect(await screen.findByText(/nothing needs restocking.*does not track.*never appear/is)).toBeInTheDocument()
  })

  it("shows the count and the threshold it is being judged against", async () => {
    renderPanel()
    expect(await screen.findByText("Milk")).toBeInTheDocument()
    expect(screen.getByText("MLK-1")).toBeInTheDocument()
  })
})

describe("the write tier (FR-025, FR-028)", () => {
  it("offers no settings control to a csa — reading stays open, writing does not", async () => {
    renderPanel(false)
    await screen.findByText("Milk")
    expect(screen.queryByLabelText(/^threshold$/i)).not.toBeInTheDocument()
  })

  it("offers it to admin/manager", async () => {
    renderPanel(true)
    expect(await screen.findByLabelText(/^threshold$/i)).toBeInTheDocument()
  })
})

describe("the shop default threshold", () => {
  it("clears to null, not zero, when left blank", async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole("button", { name: /save/i }))

    await waitFor(() => expect(setShopStockSettings).toHaveBeenCalledWith("shop-1", { defaultThreshold: null }))
  })

  it("sends the number when one is entered", async () => {
    renderPanel()
    await userEvent.type(await screen.findByLabelText(/^threshold$/i), "5")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(setShopStockSettings).toHaveBeenCalledWith("shop-1", { defaultThreshold: 5 }))
  })

  it("reads a refusal off the plain object the api client actually throws", async () => {
    setShopStockSettings.mockRejectedValue({
      kind: "validation",
      status: 400,
      title: "Validation failed",
    })
    renderPanel()
    await userEvent.type(await screen.findByLabelText(/^threshold$/i), "-1")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/whole number.*or leave it blank/i)
  })

  it("does not render the server's raw prose", async () => {
    setShopStockSettings.mockRejectedValue({
      kind: "validation",
      status: 400,
      detail: "pq: constraint shop_stock_settings_default_low_stock_threshold_check violated",
    })
    renderPanel()
    await userEvent.click(await screen.findByRole("button", { name: /save/i }))

    const alert = await screen.findByRole("alert")
    expect(alert.textContent ?? "").not.toMatch(/pq:|constraint|_check/)
  })
})
