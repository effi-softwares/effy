import type { Banner } from "./promotion-groups"
import type { StorefrontCategoryDTO, StorefrontHomeDTO, StorefrontRailDTO } from "@effy/shared-types"

/**
 * The home page's section sequence, as data, so the fixed order, empty sections hiding themselves and
 * no promotion repeating across blocks are unit-testable (Vitest cannot render async Server Components).
 */

/** One section, ready to render. A section that would be empty is never emitted at all. */
export type HomeSection =
  | { kind: "categories"; categories: StorefrontCategoryDTO[] }
  | { kind: "rail"; key: string; rail: StorefrontRailDTO; href: string }
  | { kind: "offers"; block: "a" | "b"; title: string; banners: Banner[] }

/** How many promotions the large-plus-two-stacked block shows before the next block takes over. */
const OFFERS_PER_BLOCK = 3

/** "View all" for a rail: category rails filter by category, on-sale filters, the rest go to the unfiltered search. Exported for its test. */
export function railHref(key: string): string {
  if (key.startsWith("category:")) {
    return `/search?category=${encodeURIComponent(key.slice("category:".length))}`
  }
  if (key === "on_sale") return "/search?saleOnly=true"
  return "/search"
}

/** A rail is worth a section only if it has something in it. */
function railSection(rail: StorefrontRailDTO | undefined): HomeSection | null {
  if (!rail || rail.products.length === 0) return null
  return { kind: "rail", key: rail.key, rail, href: railHref(rail.key) }
}

/**
 * The ordered sections for a payload. The order is fixed, not the server's array order. Rails are
 * consumed, not copied: `on_sale` and `featured` are taken by key and excluded from the category sweep.
 */
export function composeSections(
  home: StorefrontHomeDTO,
  categories: StorefrontCategoryDTO[],
  /** The `home-between` display group; absent when its read failed. */
  between: Banner[] = [],
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

  // The hero promotions are `PromoHero`'s (the `home-hero` group). The offers between sections are the
  // `home-between` group: block a takes the first three and block B what is left, so FR-020's "must not
  // duplicate a promotion already shown above" is structural — one list, each block consumes from it.
  const blockA = between.slice(0, OFFERS_PER_BLOCK)
  const blockB = between.slice(OFFERS_PER_BLOCK, OFFERS_PER_BLOCK * 2)

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

  // 6 — offers block B, from whatever block a did not take.
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
