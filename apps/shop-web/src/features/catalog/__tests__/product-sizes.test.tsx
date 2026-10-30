import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { renderList } from "@/test/renderList"

const updateProduct = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  updateProduct,
  setVariantState: vi.fn(),
  getCategoryForm: vi.fn(),
  getShopTaxonomy: vi.fn(),
  getProduct: vi.fn(),
  listProducts: vi.fn(),
  listSections: vi.fn(),
}))
vi.mock("../stockRepo", () => ({
  getVariantStock: vi.fn(),
  adjustStock: vi.fn(),
  setStockCount: vi.fn(),
  setStockTracking: vi.fn(),
  setStockThreshold: vi.fn(),
  getStockSettings: vi.fn(),
  setStockSettings: vi.fn(),
}))

const { ProductSizes } = await import("../ProductSizes")
import type { ProductDetail } from "../model"

const VARIANT = "00000000-0000-4000-8000-0000000000a1"

const DETAIL = {
  id: "p1",
  name: "Barossa Free-Range Eggs 700g",
  currency: "AUD",
  status: "active",
  reviewState: "live",
  hold: null,
  unitBasis: null,
  options: [],
  media: [],
  variants: [
    {
      id: VARIANT,
      position: 0,
      optionValueIds: [null, null],
      label: null,
      code: "V2222222",
      sku: "EGG-700",
      gtin: null,
      shopPriceAmount: "8.50",
      shopCompareAtAmount: null,
      customerPriceAmount: "9.35",
      customerCompareAtAmount: null,
      weightGrams: 800,
      weightIsAssumed: false,
      packQuantity: null,
      packUnit: null,
      mediaId: null,
      state: "active",
      stock: {
        productId: "p1",
        variantId: VARIANT,
        tracked: true,
        onHand: 12,
        threshold: null,
        effectiveThreshold: 4,
        outOfStock: false,
        low: false,
      },
    },
  ],
  pendingChange: null,
  updatedAt: "2026-09-02T00:00:00.123456Z",
} as unknown as ProductDetail

async function open() {
  const r = renderList(() => <ProductSizes detail={DETAIL} readOnly={false} />, "/catalog/p1")
  await act(async () => {
    await r.router.load()
  })
  return r
}

beforeEach(() => {
  updateProduct.mockReset()
  localStorage.clear()
})

describe("the product's sizes", () => {
  it("opens one at a time, with the price from the shop's to the customer's", async () => {
    await open()
    expect(screen.getByRole("radio", { name: "One at a time" })).toBeChecked()
    expect(screen.getByText("Your price")).toBeInTheDocument()
    expect(screen.getAllByText("AUD 9.35").length).toBeGreaterThan(0)
  })

  it("the spreadsheet sends the whole set with the typed price, and marks the cell until then", async () => {
    updateProduct.mockResolvedValue(DETAIL)
    await open()
    await userEvent.click(screen.getByRole("radio", { name: "Spreadsheet" }))
    const price = screen.getByLabelText("Your price for One size")
    await userEvent.clear(price)
    await userEvent.type(price, "9.10")
    expect(price.closest("td")).toHaveClass("bg-primary-muted")
    expect(screen.getByText("1 size changed")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Send to Effy" }))
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    const [id, body] = updateProduct.mock.calls[0]!
    expect(id).toBe("p1")
    expect(body.expectedUpdatedAt).toBe(DETAIL.updatedAt)
    expect(body.variants).toHaveLength(1)
    expect(body.variants[0]).toMatchObject({ id: VARIANT, shopPriceAmount: "9.10", sku: "EGG-700" })
  })

  it("refuses to send a price that is not one, and says which cell", async () => {
    await open()
    await userEvent.click(screen.getByRole("radio", { name: "Spreadsheet" }))
    const price = screen.getByLabelText("Your price for One size")
    await userEvent.clear(price)
    await userEvent.type(price, "nine")
    await userEvent.click(screen.getByRole("button", { name: "Send to Effy" }))
    expect(updateProduct).not.toHaveBeenCalled()
    expect(price).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Fix the marked cells first.")).toBeInTheDocument()
  })

  it("remembers the chosen view on this device", async () => {
    await open()
    await userEvent.click(screen.getByRole("radio", { name: "Spreadsheet" }))
    expect(localStorage.getItem("effy.product.sizesView")).toBe("sheet")
  })
})
