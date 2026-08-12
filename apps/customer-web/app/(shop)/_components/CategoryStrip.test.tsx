import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { CATEGORY_SHORTCUT_CAP, CategoryStrip } from "./CategoryStrip"

function category(over: Partial<StorefrontCategoryDTO> = {}): StorefrontCategoryDTO {
  return {
    key: "pantry",
    name: "Pantry",
    parentKey: "grocery",
    productCount: 10,
    imageUrl: "https://example.test/pantry.jpg",
    ...over,
  }
}

/** N distinct stocked categories — the cap is not reachable with the live seed's 9. */
function many(n: number): StorefrontCategoryDTO[] {
  return Array.from({ length: n }, (_, i) =>
    category({ key: `c${i}`, name: `Category ${i}`, productCount: i + 1 }),
  )
}

describe("CategoryStrip — one shortcut per stocked category (FR-013)", () => {
  it("links each shortcut to that category's listing", () => {
    render(<CategoryStrip categories={[category({ key: "paper_goods", name: "Paper Goods" })]} />)

    expect(screen.getByRole("link", { name: /paper goods/i }).getAttribute("href")).toBe(
      "/search?category=paper_goods",
    )
  })

  it("percent-encodes a key that needs it, rather than emitting a broken URL", () => {
    render(<CategoryStrip categories={[category({ key: "herbs & spices", name: "Herbs" })]} />)

    expect(screen.getByRole("link", { name: /herbs/i }).getAttribute("href")).toBe(
      "/search?category=herbs%20%26%20spices",
    )
  })

  it("offers a way to the full set (SC-002's second tap)", () => {
    render(<CategoryStrip categories={[category()]} />)

    expect(screen.getByRole("link", { name: /shop all products/i }).getAttribute("href")).toBe(
      "/search",
    )
  })

  /**
   * ⚠ THE CAP IS NOT EXERCISED BY REAL DATA. The dev seed has 9 stocked categories against a cap of 12,
   * so a broken cap would look perfectly fine in every manual check and every live walk. It has to be
   * driven synthetically or it is not tested at all.
   */
  it(`shows at most ${CATEGORY_SHORTCUT_CAP} shortcuts even when more are stocked`, () => {
    render(<CategoryStrip categories={many(CATEGORY_SHORTCUT_CAP + 5)} />)

    // +1 for the "View all categories" action, which is not a shortcut.
    expect(screen.getAllByRole("link")).toHaveLength(CATEGORY_SHORTCUT_CAP + 1)
  })

  it("shows all of them when there are fewer than the cap", () => {
    render(<CategoryStrip categories={many(4)} />)

    expect(screen.getAllByRole("link")).toHaveLength(5)
  })
})

describe("CategoryStrip — a shortcut must lead somewhere with products in it", () => {
  /**
   * ⚠ NOT TIDINESS. Category filtering is exact-match everywhere on this platform, so a shortcut to an
   * unstocked category opens a listing with nothing in it — worse than the shortcut being absent.
   */
  it("omits categories with no stocked products", () => {
    render(
      <CategoryStrip
        categories={[
          category({ key: "pantry", name: "Pantry", productCount: 10 }),
          category({ key: "food", name: "Food", productCount: 0 }),
        ]}
      />,
    )

    expect(screen.getByRole("link", { name: /pantry/i })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /^food/i })).toBeNull()
  })

  /**
   * ⚠ THE REAL-DATA CASE, and it is not hypothetical: `productCount` does not roll up from child
   * categories (028's open defect), so `food` / `grocery` / `household` all report 0 on the live seed
   * while their leaves hold every product. The strip must render the leaves and omit the parents.
   */
  it("omits top-level parents that report zero because the count does not roll up (028)", () => {
    render(
      <CategoryStrip
        categories={[
          category({ key: "grocery", name: "Grocery", parentKey: null, productCount: 0 }),
          category({ key: "pantry", name: "Pantry", parentKey: "grocery", productCount: 10 }),
        ]}
      />,
    )

    expect(screen.queryByRole("link", { name: /grocery/i })).toBeNull()
    expect(screen.getByRole("link", { name: /pantry/i })).toBeTruthy()
  })

  /** FR-004: the section hides itself entirely rather than rendering a heading over empty space. */
  it("renders NOTHING when no category is stocked", () => {
    const { container } = render(
      <CategoryStrip categories={[category({ productCount: 0 }), category({ key: "b", productCount: 0 })]} />,
    )

    expect(container.innerHTML).toBe("")
  })

  it("renders NOTHING when handed no categories at all", () => {
    const { container } = render(<CategoryStrip categories={[]} />)

    expect(container.innerHTML).toBe("")
  })
})

describe("CategoryStrip — imagery degrades, never breaks (FR-014)", () => {
  it("renders a neutral initial tile instead of a broken frame when there is no image", () => {
    const { container } = render(
      <CategoryStrip categories={[category({ name: "Bakery", imageUrl: null })]} />,
    )

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("B")).toBeTruthy()
  })

  it("renders the image when there is one", () => {
    const { container } = render(<CategoryStrip categories={[category()]} />)

    expect(container.querySelector("img")).not.toBeNull()
  })

  /** The count is in the accessible name, so it is not conveyed by the image alone (SC-009). */
  it("names each shortcut with its item count for assistive technology", () => {
    render(<CategoryStrip categories={[category({ name: "Pantry", productCount: 1 })]} />)

    expect(screen.getByRole("link", { name: "Pantry, 1 item" })).toBeTruthy()
  })
})
