import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

const updateProduct = vi.hoisted(() => vi.fn())
const getCatalogSchema = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  updateProduct,
  getCatalogSchema,
  listSections: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  changeStatus: vi.fn(),
  deleteProduct: vi.fn(),
  setProductSections: vi.fn(),
  uploadProductMedia: vi.fn(),
  updateProductMedia: vi.fn(),
  deleteProductMedia: vi.fn(),
}))

import { PricingEditDialog } from "../ProductEditDialogs"
import type { ProductDetail } from "../model"

const DETAIL = {
  id: "p1",
  name: "Barossa Free-Range Eggs 700g",
  brand: "Barossa",
  sku: "EGG-700",
  gtin: null,
  productTypeId: "t1",
  primaryCategoryId: "c1",
  typeName: "Grocery",
  categoryName: "Pantry",
  shortDescription: "Free-range eggs.",
  longDescription: null,
  priceAmount: "8.50",
  compareAtAmount: null,
  currency: "AUD",
  status: "active",
  weightGrams: 800,
  weightIsAssumed: false,
  attributes: [],
  media: [],
  sections: [],
  missingMandatoryAttributes: [],
  updatedAt: "2026-09-02T00:00:00.123456Z",
} as unknown as ProductDetail

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

/** US3 (T030) — the focused edit dialogs round-trip a change to the server. */
describe("product edit and persist", () => {
  // ⚠ Without this the "must not be called" assertion below counts calls made by the tests ABOVE it
  // and fails for the wrong reason — a false red that teaches nothing.
  beforeEach(() => {
    updateProduct.mockClear()
  })

  it("sends only the fields that actually changed", async () => {
    updateProduct.mockResolvedValue({ ...DETAIL, priceAmount: "9.00" })
    getCatalogSchema.mockResolvedValue({ productTypes: [], categories: [] })

    wrap(<PricingEditDialog detail={DETAIL} open onOpenChange={() => {}} />)

    const price = await screen.findByLabelText(/^price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.00")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    const body = updateProduct.mock.calls[0]![1]

    // ⚠ A PATCH that resends untouched fields is how one operator's save silently reverts another's.
    // compareAtAmount was never edited, so it must not appear in the body at all.
    expect(body).toMatchObject({ priceAmount: "9.00" })
    expect(body).not.toHaveProperty("compareAtAmount")
  })

  /**
   * ⚠ 056 shipped exactly this defect: `toISOString()` truncates to MILLISECONDS while PostgreSQL
   * stores MICROSECONDS, so `WHERE updated_at = $2` never matched its own row and every save reported
   * "changed by someone else". The concurrency token must cross the wire as the server sent it —
   * byte for byte, never re-formatted through a Date.
   */
  it("returns the concurrency token exactly as the server sent it", async () => {
    updateProduct.mockResolvedValue(DETAIL)
    getCatalogSchema.mockResolvedValue({ productTypes: [], categories: [] })

    wrap(<PricingEditDialog detail={DETAIL} open onOpenChange={() => {}} />)

    const price = await screen.findByLabelText(/^price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.99")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    const body = updateProduct.mock.calls[0]![1]
    expect(body.expectedUpdatedAt).toBe("2026-09-02T00:00:00.123456Z")
  })

  it("refuses to save an invalid price, and says why", async () => {
    getCatalogSchema.mockResolvedValue({ productTypes: [], categories: [] })

    wrap(<PricingEditDialog detail={DETAIL} open onOpenChange={() => {}} />)

    const price = await screen.findByLabelText(/^price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "-3")

    expect(screen.getByText(/enter a positive amount/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled()
    expect(updateProduct).not.toHaveBeenCalled()
  })
})
