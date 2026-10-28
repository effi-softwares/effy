import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { onePage, renderList } from "@/test/renderList"

const listProducts = vi.hoisted(() => vi.fn())
const getShopTaxonomy = vi.hoisted(() => vi.fn())
const listSections = vi.hoisted(() => vi.fn())

vi.mock("../repo", () => ({
  listProducts,
  // The list's own page read (103) is the same mock, asked with the address's query string.
  fetchProductPage: (qs: URLSearchParams) => listProducts(Object.fromEntries(qs)),
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

const wrap = (url = "/catalog") => renderList(CatalogListScreen, url)
const page = (items: unknown[], over: Record<string, unknown> = {}) => ({ ...onePage(items), ...over })

describe("catalog list (103: the server's whole list, the view in the address)", () => {
  it("passes the typed search term to the server rather than filtering in the browser", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue(page([product()]))

    wrap()
    await screen.findByText("Barossa Free-Range Eggs 700g")
    await userEvent.type(screen.getByLabelText(/search products/i), "eggs")

    await waitFor(() => expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ q: "eggs", page: "1" })))
  })

  it("returns to page 1 whenever a filter changes", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue(page([product()], { total: 60, page: 3 }))

    const { router } = wrap("/catalog?page=3")
    await screen.findByText("Barossa Free-Range Eggs 700g")
    await userEvent.type(screen.getByLabelText(/search products/i), "x")

    await waitFor(() => expect(router.state.location.search).toEqual({ q: "x" }))
  })

  it("resets every filter, and offers it only when something is filtered", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockResolvedValue(page([product()]))

    const { router } = wrap("/catalog?q=eggs&reviewState=sent_back")
    await screen.findByText("Barossa Free-Range Eggs 700g")
    await userEvent.click(screen.getByRole("button", { name: "Reset" }))
    await waitFor(() => expect(router.state.location.search).toEqual({}))
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument()
  })

  it("101 — offers a Missing details filter with its count, and asks the server for those products only", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listSections.mockResolvedValue([])
    listProducts.mockImplementation(async (p: { missing?: boolean | string }) =>
      p.missing === true || p.missing === "true"
        ? page([product({ id: "p2", name: "Mango Yoghurt", missingRequired: 1 })], { total: 2 })
        : page([product()]),
    )

    wrap()
    await screen.findByText("Barossa Free-Range Eggs 700g")
    const filter = await screen.findByRole("button", { name: /missing details/i })
    expect(filter).toHaveTextContent("2")

    await userEvent.click(filter)

    await waitFor(() => expect(listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ missing: "true", page: "1" })))
    expect(await screen.findByText("1 detail missing")).toBeInTheDocument()
  })
})
