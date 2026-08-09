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
  const ctx = { categories: [], railsByKey: new Map(), firstImageBlockId: null, livePromotionIds: new Set<string>() }

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
  const ctx = { categories: [], railsByKey: new Map(), firstImageBlockId: null, livePromotionIds: new Set<string>() }

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

describe("offer tiles (042 US2)", () => {
  const base = { categories: [], railsByKey: new Map(), firstImageBlockId: null }
  const ctx = (live: string[] = []) => ({ ...base, livePromotionIds: new Set(live) })
  const tile = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    size: "large",
    headline: "Save on the weekly shop",
    ctaLabel: "See the deals",
    ctaDestination: { kind: "sale" },
    altText: "A basket of vegetables",
    ...over,
  })
  const offers = (tiles: unknown[], live: string[] = []) =>
    renderBlock({ id: "o1", type: "offers", props: { tiles } }, ctx(live))

  it("renders a complete tile", () => {
    expect(offers([tile()])).not.toBeNull()
  })

  /**
   * ⚠ THE POINT OF LINKING A PROMOTION (FR-030). The operator does not have to remember to take the
   * tile down when the code expires — which is the whole reason the field exists, since the
   * alternative is a storefront advertising a discount that no longer works.
   */
  it("drops a tile whose linked promotion is no longer live", () => {
    expect(offers([tile({ promoCodeId: "expired" })], ["other"])).toBeNull()
  })

  it("keeps a tile whose linked promotion is live", () => {
    expect(offers([tile({ promoCodeId: "live" })], ["live"])).not.toBeNull()
  })

  it("leaves an unlinked tile alone — most offers are not discount codes", () => {
    expect(offers([tile()], [])).not.toBeNull()
  })

  /**
   * ⚠ DROPPED, NOT RENDERED NON-TAPPABLE. A promotional tile with a dead call to action is worse
   * than no tile, because the shopper acts on it. `promotion` is gone from the vocabulary because
   * this feature retires the page it pointed at — keeping it would let an operator author a tile
   * aimed at a route that no longer exists, which is exactly the defect 029 fixed.
   */
  it("drops a tile aimed at a destination this build cannot resolve", () => {
    expect(offers([tile({ ctaDestination: { kind: "promotion", promotionId: "p1" } })])).toBeNull()
    expect(offers([tile({ ctaDestination: { kind: "category" } })])).toBeNull()
  })

  it("resolves each destination kind to its route", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ kind: "search" }, "/search"],
      [{ kind: "sale" }, "/search?onSale=true"],
      [{ kind: "category", categoryKey: "bakery" }, "/browse/bakery"],
      [{ kind: "product", productId: "p9" }, "/product/p9"],
    ]
    for (const [dest, href] of cases) {
      const out = offers([tile({ ctaDestination: dest })]) as { props: { tiles: Array<{ ctaHref: string }> } }
      expect(out.props.tiles[0]!.ctaHref).toBe(href)
    }
  })

  it("drops a tile missing its headline or button label rather than rendering a blank one", () => {
    expect(offers([tile({ headline: "" })])).toBeNull()
    expect(offers([tile({ ctaLabel: "" })])).toBeNull()
  })

  it("renders nothing at all when every tile was dropped", () => {
    // FR-029: not an empty bento, not a heading over blank space — nothing.
    expect(offers([tile({ headline: "" }), tile({ ctaLabel: "" })])).toBeNull()
  })

  it("carries the operator's artwork description through", () => {
    const out = offers([tile()]) as { props: { tiles: Array<{ alt: string }> } }
    expect(out.props.tiles[0]!.alt).toBe("A basket of vegetables")
  })
})
