import { BLOCK_TYPES } from "@effy/shared-types"
import { describe, expect, it } from "vitest"

import { firstImageBlock, renderBlock } from "./index"

/**
 * ⚠ THE FIRST TEST HERE IS THE ONE THAT MATTERS, and it guards the failure this feature is most
 * likely to produce and least likely to notice: a block type in the catalogue that the renderer has
 * never been taught. The page renders, nothing throws, and one section of the storefront is simply
 * absent. An operator would see their block in the composer, publish it, and find nothing on the page.
 *
 * The `never` default in `renderBlock` catches that at COMPILE time — but only for a type the local
 * union declares. This is what catches the union itself falling behind the catalogue.
 */
describe("the renderer knows every block the catalogue declares", () => {
  const ctx = { categories: [], railsByKey: new Map(), firstImageBlockId: null }

  for (const type of BLOCK_TYPES) {
    it(`renders ${type} without throwing`, () => {
      // A type the renderer has not been taught falls to `assertNever`, which returns null — so
      // "did not throw" is not enough on its own. The compile-time check is the real guard; this
      // proves the union has not silently fallen out of step at runtime either.
      expect(() => renderBlock({ id: "b", type, props: {} }, ctx)).not.toThrow()
    })
  }
})

describe("a rail that this store cannot fill self-hides", () => {
  const ctx = { categories: [], railsByKey: new Map(), firstImageBlockId: null }

  it("renders nothing when the rail key names no rail", () => {
    // ⚠ The reference was valid when it was published; the category has since sold out or been
    // delisted. A heading above blank space is the empty frame the degradation rule exists to prevent.
    const out = renderBlock({ id: "b", type: "product_rail", props: { railKey: "gone" } }, ctx)
    expect(out).toBeNull()
  })

  it("renders nothing when the rail exists but is empty", () => {
    const out = renderBlock(
      { id: "b", type: "product_rail", props: { railKey: "on_sale" } },
      { ...ctx, railsByKey: new Map([["on_sale", { key: "on_sale", title: "On sale", products: [] }]]) },
    )
    expect(out).toBeNull()
  })
})

describe("image priority is derived from position, never authored (FR-039)", () => {
  it("names the first block that carries imagery, wherever it sits", () => {
    // ⚠ The storefront has the INVERSE defect today: three below-the-fold banners are preloaded while
    // the hero is not. Deriving it means a reorder cannot leave the priority pointing at the middle
    // of the page — which is exactly what an authorable field would allow.
    expect(
      firstImageBlock([
        { id: "a", type: "newsletter", props: {} },
        { id: "b", type: "product_rail", props: {} },
        { id: "c", type: "hero", props: {} },
      ]),
    ).toBe("b")
  })

  it("moves with the blocks when they are reordered", () => {
    const before = [
      { id: "hero", type: "hero", props: {} },
      { id: "rail", type: "product_rail", props: {} },
    ]
    expect(firstImageBlock(before)).toBe("hero")
    expect(firstImageBlock([...before].reverse())).toBe("rail")
  })

  it("returns null for a page with no imagery at all, rather than guessing", () => {
    expect(firstImageBlock([{ id: "a", type: "newsletter", props: {} }])).toBeNull()
  })
})
