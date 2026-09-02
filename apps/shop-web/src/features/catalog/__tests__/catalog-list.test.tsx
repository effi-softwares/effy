import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  // 057: the rebuilt screens navigate from the breadcrumb, so the mock must supply this too.
  useNavigate: () => () => {},
}))

const listProducts = vi.hoisted(() => vi.fn())
const getCatalogSchema = vi.hoisted(() => vi.fn())
const listSections = vi.hoisted(() => vi.fn())

vi.mock("../repo", () => ({
  listProducts,
  getCatalogSchema,
  listSections,
  createProduct: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  changeStatus: vi.fn(),
  deleteProduct: vi.fn(),
  setProductSections: vi.fn(),
  uploadProductMedia: vi.fn(),
  updateProductMedia: vi.fn(),
  deleteProductMedia: vi.fn(),
}))

import { CatalogListScreen } from "../CatalogListScreen"

const SCHEMA = {
  productTypes: [{ id: "t1", key: "grocery", name: "Grocery", description: null, attributes: [] }],
  categories: [{ id: "c1", name: "Pantry", parentId: null, productCount: 3 }],
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Barossa Free-Range Eggs 700g",
    brand: "Barossa",
    sku: "EGG-700",
    typeName: "Grocery",
    categoryName: "Pantry",
    priceAmount: "8.50",
    currency: "AUD",
    status: "active",
    primaryImageUrl: null,
    ...over,
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

/** US3 (T029) — catalog search and filtering. */
describe("catalog list", () => {
  it("passes the typed search term to the server rather than filtering in the browser", async () => {
    getCatalogSchema.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 1, page: 1, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    await userEvent.type(screen.getByLabelText(/search products/i), "eggs")

    // ⚠ Server-side by design: the catalog is paged and can run to thousands of rows, so unlike the
    // order queue it must NOT be filtered client-side over one page — that would silently search only
    // the visible page and report "no matches" for a product that exists.
    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ q: "eggs", page: 1 }))
  })

  it("returns to page 1 whenever a filter changes", async () => {
    getCatalogSchema.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 60, page: 3, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    await userEvent.type(screen.getByLabelText(/search products/i), "x")

    // ⚠ Staying on page 3 of a freshly-narrowed result set shows an empty table for a filter that
    // matched plenty — the classic "my search returned nothing" bug that is really a paging bug.
    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
  })

  it("shows an active filter as a removable chip, and clears it when dismissed", async () => {
    getCatalogSchema.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 1, page: 1, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    await userEvent.type(screen.getByLabelText(/search products/i), "eggs")
    const chip = await screen.findByRole("button", { name: /remove filter "eggs"/i })

    await userEvent.click(chip)

    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }))
  })

  it("offers no filter chips at all when nothing is filtered", async () => {
    getCatalogSchema.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 1, page: 1, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    expect(screen.queryByText(/filtered by/i)).not.toBeInTheDocument()
  })
})
