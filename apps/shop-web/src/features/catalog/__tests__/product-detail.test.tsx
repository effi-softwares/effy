import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => () => { },
}))

const updateProduct = vi.hoisted(() => vi.fn())
const getCategoryForm = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  updateProduct,
  getCategoryForm,
  getShopTaxonomy: vi.fn(),
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
  primaryCategoryId: "c1",
  categoryName: "Pantry",
  shortDescription: "Free-range eggs.",
  longDescription: null,
  currency: "AUD",
  status: "active",
  // The one size this product is sold as carries the price, codes and weight.
  unitBasis: null,
  options: [],
  variants: [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      position: 0,
      optionValueIds: [null, null],
      label: null,
      sku: "EGG-700",
      gtin: null,
      shopPriceAmount: "8.50",
      shopCompareAtAmount: null,
      customerPriceAmount: "8.50",
      customerCompareAtAmount: null,
      weightGrams: 800,
      weightIsAssumed: false,
      packQuantity: null,
      packUnit: null,
      mediaId: null,
      state: "active",
      stock: {
        productId: "p1",
        variantId: "00000000-0000-4000-8000-0000000000a1",
        tracked: false,
        onHand: null,
        threshold: null,
        effectiveThreshold: null,
        outOfStock: false,
        low: false,
      },
    },
  ],
  gstStatus: "gst_free",
  attributes: [],
  media: [],
  sections: [],
  missingMandatoryAttributes: [],
  updatedAt: "2026-09-02T00:00:00.123456Z",
} as unknown as ProductDetail

const FORM = {
  categoryId: "c1",
  path: ["Pantry", "Eggs"],
  isLeaf: true,
  sections: [],
  defaults: { storage: "chilled", gstStatus: "gst_free", ageRestricted: false },
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

describe("product edit and persist", () => {
  beforeEach(() => {
    updateProduct.mockClear()
  })

  it("sends the whole set of sizes, with the changed price", async () => {
    updateProduct.mockResolvedValue(DETAIL)
    getCategoryForm.mockResolvedValue(FORM)

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => { }} />)

    const price = await screen.findByLabelText(/^your price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.00")
    await userEvent.click(screen.getByRole("button", { name: /^send to effy$/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    const body = updateProduct.mock.calls[0]![1]

    expect(body).toMatchObject({
      options: [],
      variants: [
        { id: "00000000-0000-4000-8000-0000000000a1", shopPriceAmount: "9.00", sku: "EGG-700", weightGrams: 800 },
      ],
    })
    expect(body).not.toHaveProperty("name")
  })

  it("returns the concurrency token exactly as the server sent it", async () => {
    updateProduct.mockResolvedValue(DETAIL)
    getCategoryForm.mockResolvedValue(FORM)

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => { }} />)

    const price = await screen.findByLabelText(/^your price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.99")
    await userEvent.click(screen.getByRole("button", { name: /^send to effy$/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    const body = updateProduct.mock.calls[0]![1]
    expect(body.expectedUpdatedAt).toBe("2026-09-02T00:00:00.123456Z")
  })

  it("refuses to save an invalid price, and says why", async () => {
    getCategoryForm.mockResolvedValue(FORM)

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => { }} />)

    const price = await screen.findByLabelText(/^your price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "-3")
    // Not while typing: a cell says what is wrong once the operator leaves it…
    expect(screen.queryByText(/enter a price like/i)).toBeNull()
    await userEvent.tab()
    expect(screen.getByText(/enter a price like/i)).toBeInTheDocument()

    // …and Save refuses, and stays refused until it is fixed.
    await userEvent.click(screen.getByRole("button", { name: /^send to effy$/i }))
    expect(screen.getByRole("button", { name: /^send to effy$/i })).toBeDisabled()
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it("101 - says which details a save removed (one size left, a detail only differed by size)", async () => {
    updateProduct.mockResolvedValue({ ...DETAIL, droppedDetails: ["Allergens"] })
    getCategoryForm.mockResolvedValue(FORM)
    const onDropped = vi.fn()

    wrap(<SizesEditDialog detail={DETAIL} open onOpenChange={() => { }} onDropped={onDropped} />)

    const price = await screen.findByLabelText(/^your price/i)
    await userEvent.clear(price)
    await userEvent.type(price, "9.10")
    await userEvent.click(screen.getByRole("button", { name: /^send to effy$/i }))

    await waitFor(() => expect(onDropped).toHaveBeenCalledWith(["Allergens"]))
  })
})
