import type { BannerDTO, StorefrontCategoryDTO, StorefrontHomeDTO, StorefrontRailDTO } from "@effy/shared-types"

/**
 * The home page's section sequence, as data (039 US3).
 *
 * Contract: `specs/039-customer-home-redesign/contracts/home-sections.contract.md`.
 *
 * ⚠ WHY THIS IS A PURE FUNCTION AND NOT JSX. The page used to `rails.map()` straight into markup, which
 * made three of the feature's rules unobservable: the fixed top-to-bottom ORDER (FR-001), the rule that
 * every empty section HIDES ITSELF (FR-004), and — once 039's offer blocks land — that block B never
 * repeats a promotion block A already showed (FR-020). None of those can be asserted without rendering,
 * and rendering async Server Components is exactly what Vitest cannot do (see `vitest.config.ts`).
 *
 * Composing first and rendering second moves all of it into a plain unit test.
 */

/** One section, ready to render. A section that would be empty is never emitted at all. */
export type HomeSection =
  | { kind: "categories"; categories: StorefrontCategoryDTO[] }
  | { kind: "rail"; key: string; rail: StorefrontRailDTO; href: string }
  | { kind: "offers"; block: "a" | "b"; title: string; banners: BannerDTO[] }

/** How many promotions the large-plus-two-stacked block shows before the next block takes over. */
const OFFERS_PER_BLOCK = 3

/**
 * "View all" for a rail — category rails filter by category, on-sale filters, everything else goes to
 * the unfiltered search page.
 *
 * ⚠ Exported so it can be pinned by a test. 029's post-mortem records a banner that pointed every
 * promotion at `/search` for its whole life because nothing asserted where a link led.
 */
export function railHref(key: string): string {
  if (key.startsWith("category:")) {
    return `/search?category=${encodeURIComponent(key.slice("category:".length))}`
  }
  if (key === "on_sale") return "/search?saleOnly=true"
  return "/search"
}

/** A rail is worth a section only if it has something in it (FR-004). */
function railSection(rail: StorefrontRailDTO | undefined): HomeSection | null {
  if (!rail || rail.products.length === 0) return null
  return { kind: "rail", key: rail.key, rail, href: railHref(rail.key) }
}

/**
 * The ordered sections for a given payload.
 *
 * ⚠ THE ORDER IS FIXED AND NAMED, not "whatever order the server sent the rails in". A merchandised
 * landing page reads top-to-bottom as an argument — start with the discount, then the curated picks,
 * then the departments — and leaving that to the server's array order means the page silently
 * rearranges itself whenever the catalogue changes.
 *
 * ⚠ RAILS ARE CONSUMED, NOT COPIED. `on_sale` and `featured` are pulled out by key and then EXCLUDED
 * from the category sweep, so a rail cannot appear twice. The same consumed-set discipline is what
 * FR-020 will need for the two offer blocks (US4).
 */
export function composeSections(
  home: StorefrontHomeDTO,
  categories: StorefrontCategoryDTO[],
): HomeSection[] {
  const sections: HomeSection[] = []
  const used = new Set<string>()

  const take = (key: string): HomeSection | null => {
    const section = railSection(home.rails.find((r) => r.key === key))
    if (section) used.add(key)
    return section
  }

  // 1 — category shortcuts. Navigation before the thing it navigates.
  if (categories.some((c) => c.productCount > 0)) {
    sections.push({ kind: "categories", categories })
  }

  // ⚠ NO CAROUSEL SECTION (operator direction, 2026-08-09). `PromoCarousel` used to occupy this slot
  // with the `carousel`-placement banners; it is removed and the component deleted.
  //
  // ⚠ CAROUSEL-PLACEMENT BANNERS ARE NOT ORPHANED — `PromoHero` renders `home.banners` UNFILTERED at
  // the top of the page, so every advertised promotion still appears. But that is the ONLY thing
  // showing them now: restore the static `Hero` in place of `PromoHero` and the carousel-placement
  // promotions vanish from the storefront with nothing reporting it. The `inline` ones below are
  // unaffected either way.

  // ⚠ `inline` is the DEDICATED OFFERS placement (029 FR-027), exclusive with `carousel`. Block A
  // takes the first three and block B takes what is left — so FR-020's "MUST NOT duplicate a promotion
  // already shown above" is structural: there is one list and each block consumes from it.
  const offers = home.banners.filter((b) => b.placement === "inline")
  const blockA = offers.slice(0, OFFERS_PER_BLOCK)
  const blockB = offers.slice(OFFERS_PER_BLOCK, OFFERS_PER_BLOCK * 2)

  // 2 — the discount rail leads: it is the reason a shopper who is only browsing keeps scrolling.
  const onSale = take("on_sale")
  if (onSale) sections.push(onSale)

  // 3 — offers block A.
  if (blockA.length > 0) {
    sections.push({ kind: "offers", block: "a", title: "Offers", banners: blockA })
  }

  // 4 — the curated picks.
  const featured = take("featured")
  if (featured) sections.push(featured)

  // 5 — the departments, in the order the server gave them.
  for (const rail of home.rails) {
    if (used.has(rail.key) || !rail.key.startsWith("category:")) continue
    const section = railSection(rail)
    if (section) {
      used.add(rail.key)
      sections.push(section)
    }
  }

  // 6 — offers block B, from whatever block A did not take.
  if (blockB.length > 0) {
    sections.push({ kind: "offers", block: "b", title: "More offers", banners: blockB })
  }

  // 8 — anything the server sent that none of the named slots claimed. Without this a rail the backend
  // adds later would be silently dropped by a frontend that only knows three key shapes.
  for (const rail of home.rails) {
    if (used.has(rail.key)) continue
    const section = railSection(rail)
    if (section) {
      used.add(rail.key)
      sections.push(section)
    }
  }

  return sections
}

/** True when the payload has no merchandised content at all — the "shelves being stocked" case. */
export function isEmptyStore(home: StorefrontHomeDTO): boolean {
  return home.rails.every((r) => r.products.length === 0)
}
