import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  // The rebuilt screens navigate from the breadcrumb, so the mock must supply this too.
  useNavigate: () => () => {},
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

import { SizesEditDialog } from "../ProductEditDialogs"
import type { ProductDetail } from "../model"

const DETAIL = {
  id: "p1",
  name: "Barossa Free-Range Eggs 700g",
  brand: "Barossa",
  productTypeId: "t1",
  primaryCategoryId: "c1",
  typeName: "Grocery",
  categoryName: "Pantry",
  shortDescription: "Free-range eggs.",
  longDescription: null,
  currency: "AUD",
  status: "active",
  // The one size this product is sold as carries the price, codes and weight.
  unitBasis: null,
  options: [],
  variants: [{
    id: "00000000-0000-4000-8000-0000000000a1", position: 0, optionValueIds: [null, null], label: null,
    sku: "EGG-700", gtin: null, shopPriceAmount: "8.50", shopCompareAtAmount: null,
    customerPriceAmount: "8.50", customerCompareAtAmount: null, weightGrams: 800, weightIsAssumed: false,
    packQuantity: null, packUnit: null, mediaId: null, state: "active",
    stock: { productId: "p1", variantId: "00000000-0000-4000-8000-0000000000a1", tracked: false, onHand: null, threshold: null, effectiveThreshold: null, outOfStock: false, low: false },
  }],
  gstStatus: "gst_free",
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

/** The focused edit dialogs round-trip a change to the server. */
describe("product edit and persist", () => {
  // Without this the "must not be called" assertion below counts calls made by the tests above it
  // and fails for the wrong reason — a false red that teaches nothing.
  beforeEach(() => {
    updateProduct.mockClear()
  })

  it("sends the whole set of sizes, with the changed price", async () => {
    updateProduct.mockResolvedValue(DETAIL)
    getCatalogSchema.mockResolvedValue({ productTypes: [], categories: [] })

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => {}} />)

    const price = await screen.findByLabelText(/^price for/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.00")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    const body = updateProduct.mock.calls[0]![1]

    // Sizes travel whole (the server proposes only a difference), and nothing else rides along:
    // a PATCH that resent untouched details is how one operator's save reverts another's.
    expect(body).toMatchObject({ options: [], variants: [{ id: "00000000-0000-4000-8000-0000000000a1", shopPriceAmount: "9.00", sku: "EGG-700", weightGrams: 800 }] })
    expect(body).not.toHaveProperty("name")
  })

  /**
   * The concurrency token crosses the wire byte for byte, never through a Date: `toISOString` truncates
   * to milliseconds while PostgreSQL stores microseconds, so every save would read "changed by someone else".
   */
  it("returns the concurrency token exactly as the server sent it", async () => {
    updateProduct.mockResolvedValue(DETAIL)
    getCatalogSchema.mockResolvedValue({ productTypes: [], categories: [] })

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => {}} />)

    const price = await screen.findByLabelText(/^price for/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.99")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    const body = updateProduct.mock.calls[0]![1]
    expect(body.expectedUpdatedAt).toBe("2026-09-02T00:00:00.123456Z")
  })

  it("refuses to save an invalid price, and says why", async () => {
    getCatalogSchema.mockResolvedValue({ productTypes: [], categories: [] })

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => {}} />)

    const price = await screen.findByLabelText(/^price for/i)
    await userEvent.clear(price)
    await userEvent.type(price, "-3")
    // Not while typing: a cell says what is wrong once the operator leaves it…
    expect(screen.queryByText(/enter a price like/i)).toBeNull()
    await userEvent.tab()
    expect(screen.getByText(/enter a price like/i)).toBeInTheDocument()

    // …and Save refuses, and stays refused until it is fixed.
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled()
    expect(updateProduct).not.toHaveBeenCalled()
  })
})
