import { screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ProductList, ShopTaxonomy } from "./model"

import { onePage, renderList } from "@/test/renderList"

vi.mock("@/features/auth/queries", () => ({
  sessionQuery: { queryKey: ["auth", "session"], queryFn: async () => ({ status: "signed-out" }) },
}))
vi.mock("@/features/shop-identity/queries", () => ({
  meQuery: { queryKey: ["shop", "me"], queryFn: async () => ({ shop: null }) },
}))
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }))

const getShopTaxonomy = vi.hoisted(() => vi.fn())
const listProducts = vi.hoisted(() => vi.fn())
const listSections = vi.hoisted(() => vi.fn(async () => []))
vi.mock("./repo", () => ({
  getShopTaxonomy,
  listProducts,
  fetchProductPage: listProducts,
  listSections,
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  uploadProductMedia: vi.fn(),
}))

import { CatalogListScreen } from "./CatalogListScreen"

const SCHEMA: ShopTaxonomy = { categories: [], recentLeafIds: [] }

const ONE_PAGE: ProductList = {
  ...onePage([]),
  items: [
    {
      id: "p1",
      name: "Flat White",
      brand: "Effy Roastery",
      primaryImageUrl: null,
      categoryName: "Coffee",
      priceAmount: "4.50",
      currency: "AUD",
      status: "active",
      priceVaries: false,
      variantCount: 1,
      missingRequired: 0,
      hold: null,
      createdBy: "shop",
      updatedAt: "2026-07-16T00:00:00Z",
    },
  ],
  total: 1,
}

const wrap = (_: unknown) => renderList(CatalogListScreen, "/catalog")

describe("CatalogListScreen columns", () => {
  it("renders name/type/category/price/status/sizes from the paged response", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listProducts.mockResolvedValue(ONE_PAGE)

    wrap(<CatalogListScreen />)

    expect(await screen.findByText("Flat White")).toBeInTheDocument()
    expect(screen.getByText("Effy Roastery")).toBeInTheDocument()
    expect(screen.getByText("Coffee")).toBeInTheDocument()
    expect(screen.getByText("$4.50")).toBeInTheDocument()
    expect(within(screen.getByRole("table", { name: "Products" })).getByText("Live")).toBeInTheDocument()
    expect(screen.getByText("One size")).toBeInTheDocument() // Codes are each size's
    // What is on screen, and of how many.
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument()
  })

  it("shows the empty state when the shop has no products", async () => {
    getShopTaxonomy.mockResolvedValue(SCHEMA)
    listProducts.mockResolvedValue(onePage([]))

    wrap(<CatalogListScreen />)

    expect(await screen.findByText("No products yet")).toBeInTheDocument()
  })
})
