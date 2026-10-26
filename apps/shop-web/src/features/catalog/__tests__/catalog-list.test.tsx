import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useNavigate: () => () => {},
}))

const listProducts = vi.hoisted(() => vi.fn())
const getShopTaxonomy = vi.hoisted(() => vi.fn())
const listSections = vi.hoisted(() => vi.fn())

vi.mock("../repo", () => ({
  listProducts,
  getShopTaxonomy,
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
  categories: [{ id: "c1", name: "Pantry", parentId: null, path: ["Pantry"], isLeaf: false, synonyms: [], icon: null }],
  recentLeafIds: [],
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Barossa Free-Range Eggs 700g",
    brand: "Barossa",
    sku: "EGG-700",
    categoryName: "Pantry",
    priceAmount: "8.50",
    currency: "AUD",
    status: "active",
    primaryImageUrl: null,
    missingRequired: 0,
    ...over,
  }
}

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

describe("catalog list", () => {
  it("passes the typed search term to the server rather than filtering in the browser", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 1, page: 1, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    await userEvent.type(screen.getByLabelText(/search products/i), "eggs")

    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ q: "eggs", page: 1 }))
  })

  it("returns to page 1 whenever a filter changes", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 60, page: 3, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    await userEvent.type(screen.getByLabelText(/search products/i), "x")

    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
  })

  it("shows an active filter as a removable chip, and clears it when dismissed", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
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
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue({ items: [product()], total: 1, page: 1, pageSize: 20 })

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")

    expect(screen.queryByText(/filtered by/i)).not.toBeInTheDocument()
  })

  it("101 — offers a Missing details filter with its count, and asks the server for those products only", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockImplementation(async (p: { missing?: boolean }) =>
      p.missing
        ? { items: [product({ id: "p2", name: "Mango Yoghurt", missingRequired: 1 })], total: 2, page: 1, pageSize: 20 }
        : { items: [product()], total: 1, page: 1, pageSize: 20 },
    )

    wrap(<CatalogListScreen />)
    await screen.findByText("Barossa Free-Range Eggs 700g")
    const filter = await screen.findByRole("button", { name: /missing details/i })
    expect(filter).toHaveTextContent("2")

    await userEvent.click(filter)

    expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ missing: true, page: 1 }))
    expect(await screen.findByText("1 detail missing")).toBeInTheDocument()
  })
})
