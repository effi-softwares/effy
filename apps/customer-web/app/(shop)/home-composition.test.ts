import { describe, expect, it } from "vitest"

import type {
  BannerDTO,
  StorefrontCategoryDTO,
  StorefrontHomeDTO,
  StorefrontProductCardDTO,
  StorefrontRailDTO,
} from "@effy/shared-types"

import { composeSections, isEmptyStore, railHref } from "./home-composition"

/**
 * ⚠ NO `as` CAST HERE, EVER. The first draft of this fixture invented `slug`, `price` and
 * `compareAtPrice` — none of which exist on `StorefrontProductCardDTO` — and forced the shape with an
 * assertion. That is 033's recorded failure mode verbatim: "my key-set test passed because I wrote the
 * expectation from my own struct instead of the contract."
 *
 * With the annotation and no cast, the compiler checks the fixture against the real DTO, so a contract
 * change breaks this file instead of quietly letting it keep testing a shape the platform stopped
 * using.
 */
function product(id = "p1"): StorefrontProductCardDTO {
  return {
    id,
    name: "Tomatoes",
    brand: null,
    imageUrl: null,
    priceAmount: "4.50",
    currency: "AUD",
    compareAtAmount: null,
    badges: [],
    available: true,
  }
}

function rail(key: string, n = 1): StorefrontRailDTO {
  return {
    key,
    title: key,
    products: Array.from({ length: n }, (_, i) => product(`${key}-${i}`)),
  }
}

function category(key: string, productCount = 5): StorefrontCategoryDTO {
  return { key, name: key, parentKey: null, productCount, imageUrl: null }
}

function banner(key: string, placement?: BannerDTO["placement"]): BannerDTO {
  return { key, title: key, subtitle: null, imageUrl: null, href: null, placement }
}

function home(over: Partial<StorefrontHomeDTO> = {}): StorefrontHomeDTO {
  return { banners: [], rails: [], layout: [], ...over }
}

const kinds = (s: ReturnType<typeof composeSections>) =>
  s.map((x) => (x.kind === "rail" ? `rail:${x.key}` : x.kind))

describe("railHref — where a rail's 'view all' leads (research R6)", () => {
  it("sends a category rail to that category's listing", () => {
    expect(railHref("category:pantry")).toBe("/search?category=pantry")
  })

  it("percent-encodes a category key that needs it", () => {
    expect(railHref("category:herbs & spices")).toBe("/search?category=herbs%20%26%20spices")
  })

  it("sends the on-sale rail to the sale filter", () => {
    expect(railHref("on_sale")).toBe("/search?saleOnly=true")
  })

  it("sends anything else to the unfiltered search page", () => {
    expect(railHref("featured")).toBe("/search")
    expect(railHref("something_new_the_backend_added")).toBe("/search")
  })
})

describe("composeSections — the order is fixed and named (FR-001)", () => {
  it("emits the full contract sequence when every slot has data", () => {
    const sections = composeSections(
      home({
        banners: [banner("b1", "inline")],
        rails: [rail("featured"), rail("on_sale"), rail("category:pantry"), rail("category:meals")],
      }),
      [category("pantry")],
    )

    expect(kinds(sections)).toEqual([
      "categories",
      "rail:on_sale",
      "offers",
      "rail:featured",
      "rail:category:pantry",
      "rail:category:meals",
    ])
  })

  /**
   * ⚠ THE SERVER'S ARRAY ORDER MUST NOT DECIDE THE PAGE'S ORDER. Here the payload lists `featured`
   * first, and the page must still lead with `on_sale`. If this ever starts following the payload, the
   * storefront silently rearranges itself whenever the catalogue changes.
   */
  it("ignores the order the server happened to send the rails in", () => {
    const sections = composeSections(
      home({ rails: [rail("featured"), rail("on_sale")] }),
      [],
    )

    expect(kinds(sections)).toEqual(["rail:on_sale", "rail:featured"])
  })

  /** A rail must not be shown twice — the named slots consume, they do not copy. */
  it("never emits the same rail twice", () => {
    const sections = composeSections(
      home({ rails: [rail("on_sale"), rail("featured"), rail("category:pantry")] }),
      [],
    )

    expect(new Set(kinds(sections)).size).toBe(kinds(sections).length)
  })

  /**
   * ⚠ A rail the backend adds tomorrow must still reach the page. Without the trailing sweep, a
   * frontend that only knows `on_sale`/`featured`/`category:*` would silently drop it — and nothing
   * would look broken, which is why it would go unnoticed.
   */
  it("still shows a rail whose key it does not recognise", () => {
    const sections = composeSections(home({ rails: [rail("best_selling")] }), [])

    expect(kinds(sections)).toEqual(["rail:best_selling"])
  })
})

describe("composeSections — every empty section hides itself (FR-004)", () => {
  it("omits a rail that has no products", () => {
    const sections = composeSections(
      home({ rails: [rail("on_sale", 0), rail("featured", 2)] }),
      [],
    )

    expect(kinds(sections)).toEqual(["rail:featured"])
  })

  it("omits the category section when no category is stocked", () => {
    const sections = composeSections(home({ rails: [rail("featured")] }), [category("food", 0)])

    expect(kinds(sections)).toEqual(["rail:featured"])
  })

  it("omits the offer block when there are no banners", () => {
    const sections = composeSections(home({ banners: [], rails: [rail("featured")] }), [])

    expect(kinds(sections)).toEqual(["rail:featured"])
  })

  it("emits NOTHING at all for a completely empty payload", () => {
    expect(composeSections(home(), [])).toEqual([])
  })

  /** The page must stay coherent with ANY subset present (SC-005) — not just the full one. */
  it("emits a coherent sequence with only one slot filled", () => {
    expect(kinds(composeSections(home({ rails: [rail("category:pantry")] }), []))).toEqual([
      "rail:category:pantry",
    ])
  })
})

/**
 * Banner placement (029 FR-027), after `PromoCarousel` was removed from the page.
 *
 * ⚠ THE PAGE NOW CONSUMES ONLY `inline`. `carousel`-placement banners are not a section here at all —
 * `PromoHero` renders `home.banners` unfiltered at the top of the page instead. These tests pin the
 * half that is still this file's business: the offer blocks take `inline` and nothing else, so a
 * carousel-placement promotion can never be shown twice by the sections below the hero.
 */
describe("composeSections — banner placement (029 FR-027)", () => {
  it("gives the offer blocks ONLY inline-placement banners", () => {
    const sections = composeSections(
      home({ banners: [banner("a", "carousel"), banner("b", "inline")], rails: [] }),
      [],
    )

    const offers = sections.find((s) => s.kind === "offers")
    expect(offers && offers.kind === "offers" && offers.banners.map((x) => x.key)).toEqual(["b"])
  })

  /**
   * ⚠ A MISSING placement means "carousel", matching the database column's default — so a banner from
   * a server that has not been redeployed must NOT fall into the offer blocks.
   */
  it("treats a banner with no placement as carousel, so it is not an offer", () => {
    const sections = composeSections(home({ banners: [banner("a")], rails: [] }), [])

    expect(kinds(sections)).toEqual([])
  })

  it("emits no section at all when every banner is carousel-placement", () => {
    const sections = composeSections(
      home({ banners: [banner("a", "carousel"), banner("b", "carousel")], rails: [] }),
      [],
    )

    expect(kinds(sections)).toEqual([])
  })
})

/**
 * FR-020 — the second offers block "MUST NOT duplicate a promotion already shown above".
 *
 * ⚠ Structural rather than checked: there is ONE list of inline banners and each block consumes from
 * it, so a duplicate is not something the code has to remember to avoid. These tests pin that property
 * so a later refactor cannot quietly turn `slice` into two independent filters.
 */
describe("composeSections — the two offer blocks never repeat a promotion (FR-020)", () => {
  const offersIn = (s: ReturnType<typeof composeSections>) =>
    s.flatMap((x) => (x.kind === "offers" ? x.banners.map((b) => b.key) : []))

  function inlineBanners(n: number) {
    return Array.from({ length: n }, (_, i) => banner(`o${i}`, "inline"))
  }

  it("puts the first three in block A and the rest in block B", () => {
    const sections = composeSections(
      home({ banners: inlineBanners(5), rails: [rail("on_sale"), rail("category:pantry")] }),
      [],
    )

    const blocks = sections.filter((s) => s.kind === "offers")
    expect(blocks.map((b) => b.kind === "offers" && b.block)).toEqual(["a", "b"])
    expect(blocks[0]!.kind === "offers" && blocks[0]!.banners.map((b) => b.key)).toEqual([
      "o0",
      "o1",
      "o2",
    ])
    expect(blocks[1]!.kind === "offers" && blocks[1]!.banners.map((b) => b.key)).toEqual([
      "o3",
      "o4",
    ])
  })

  it("never shows the same promotion twice, at any count", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 9]) {
      const keys = offersIn(composeSections(home({ banners: inlineBanners(n) }), []))
      expect(new Set(keys).size, `duplicate promotion with ${n} offers`).toBe(keys.length)
    }
  })

  it("omits block B entirely when three or fewer promotions are advertised", () => {
    const sections = composeSections(home({ banners: inlineBanners(3) }), [])

    expect(sections.filter((s) => s.kind === "offers")).toHaveLength(1)
  })

  it("places block A before the featured rail and block B after the category rails", () => {
    const sections = composeSections(
      home({
        banners: inlineBanners(4),
        rails: [rail("on_sale"), rail("featured"), rail("category:pantry")],
      }),
      [],
    )

    expect(kinds(sections)).toEqual([
      "rail:on_sale",
      "offers",
      "rail:featured",
      "rail:category:pantry",
      "offers",
    ])
  })

  it("emits no offer block at all when nothing is advertised inline", () => {
    const sections = composeSections(
      home({ banners: [banner("c", "carousel")], rails: [rail("featured")] }),
      [],
    )

    expect(sections.filter((s) => s.kind === "offers")).toHaveLength(0)
  })
})

describe("isEmptyStore — 'shelves being stocked' vs 'we broke'", () => {
  it("is true when every rail is empty", () => {
    expect(isEmptyStore(home({ rails: [rail("on_sale", 0)] }))).toBe(true)
  })

  it("is true when there are no rails at all", () => {
    expect(isEmptyStore(home())).toBe(true)
  })

  it("is false as soon as one rail has a product", () => {
    expect(isEmptyStore(home({ rails: [rail("on_sale", 0), rail("featured", 1)] }))).toBe(false)
  })
})
