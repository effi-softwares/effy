import type {
  StorefrontCategoryDTO,
  StorefrontLayoutBlockDTO,
  StorefrontRailDTO,
} from "@effy/shared-types"

import { OffersBento, type OfferTile } from "../OffersBento"
import { AppPromo } from "../AppPromo"
import { CategoryStrip } from "../CategoryStrip"
import { NewsletterForm } from "../NewsletterForm"
import { ProductRail } from "../ProductRail"
import { RecentlyViewedRail } from "../RecentlyViewedRail"
import { ValueStrip } from "../ValueStrip"
import { railHref } from "../../home-composition"

/**
 * The block renderer (042 — T026/T027/T028).
 *
 * ⚠ EVERY BLOCK IS A SERVER COMPONENT WRAPPING A COMPONENT THAT ALREADY EXISTED. This whole file is a
 * restatement of the storefront's existing sections as data, not new surface area — which is what
 * makes the feature affordable and what keeps its client-JavaScript cost at approximately zero. The
 * one exception is `recently_viewed`, which was already a client island before this feature and stays
 * one; its content is the shopper's own device-local history.
 *
 * ⚠ NOTHING HERE READS `hidden`. Hidden blocks are dropped SERVER-SIDE, in the hot path, so a hidden
 * block is never on the wire. Filtering here would mean shipping unpublished merchandising to every
 * shopper and trusting the client not to render it.
 */

/** Everything the renderer needs that does not travel inside a block's own props. */
export interface BlockContext {
  categories: StorefrontCategoryDTO[]
  /** Rails from the same request, by key — a `product_rail` block names one rather than carrying it. */
  railsByKey: Map<string, StorefrontRailDTO>
  /**
   * ⚠ POSITION-DERIVED IMAGE PRIORITY, NEVER AUTHORED (FR-039). The first image on the page is eager
   * and high priority; everything below it is lazy. This is a derived value with no field behind it
   * precisely because an operator cannot be expected to know which block ends up first after a
   * reorder — and the storefront currently has the INVERSE defect, preloading three below-the-fold
   * banners while the hero is not preloaded at all.
   */
  firstImageBlockId: string | null
  /**
   * Promotions referenced by this layout that are usable RIGHT NOW (042 FR-030).
   *
   * ⚠ IT COMES FROM THE UNCACHED READ, deliberately. The structure this renderer walks is cached for
   * an hour so the home page can prerender; liveness is a claim another shopper can falsify (029).
   * Filtering against the cached body would leave an expired promotion advertised for up to an hour
   * after it stopped working.
   */
  livePromotionIds: ReadonlySet<string>
}

/**
 * Render one block.
 *
 * ⚠ THE `switch` ENDS IN A `never` DEFAULT so that adding a block type to the catalogue without
 * teaching this file about it is a COMPILE ERROR rather than a silently blank section. A blank
 * section is the failure mode this feature is most likely to produce and least likely to notice:
 * the page renders, nothing throws, and one part of the storefront is simply missing.
 *
 * That check only bites for types the catalogue declares. A type this build has never heard of is a
 * different problem with a different answer — it is dropped by the hot path before it reaches here
 * (FR-042), because a layout published by a newer deploy must not fail an older one's page.
 */
export function renderBlock(
  block: StorefrontLayoutBlockDTO,
  ctx: BlockContext,
): React.ReactNode {
  const props = block.props ?? {}
  // ⚠ Narrowed into a local so the `never` default below actually narrows. Casting inside the
  // `switch (...)` head leaves `block.type` a plain string in the default branch, which makes the
  // exhaustiveness check silently do nothing — a guard that compiles and guards nothing.
  const type: KnownBlockType = block.type as KnownBlockType

  switch (type) {
    case "hero":
      // ⚠ Rendered at page level, not here — see the note in `page.tsx`. Returning null keeps the
      // block in the layout (so the operator can position it) without drawing it twice.
      return null

    case "category_strip":
      return <CategoryStrip categories={ctx.categories} />

    case "product_rail": {
      // ⚠ The rail's CONTENT comes from `block.rail` when the combined read attached it, and from the
      // page's own rails otherwise. The web surface takes the second path: it reads the structure
      // through a cached call that deliberately carries no products, and the products stream in.
      const rail = block.rail ?? ctx.railsByKey.get(String(props.railKey ?? ""))
      // A rail that this store cannot fill self-hides (FR-004/SC-013). A heading above blank space is
      // the empty frame the whole degradation rule exists to prevent.
      if (!rail || rail.products.length === 0) return null
      return <ProductRail title={rail.title} products={rail.products} href={railHref(rail.key)} />
    }

    case "offers": {
      const tiles = offerTiles(props, ctx)
      // FR-029: nothing at all rather than an empty frame. A promotional block with a placeholder in
      // it is indistinguishable from one whose images failed to load.
      if (tiles.length === 0) return null
      return <OffersBento tiles={tiles} title={typeof props.title === "string" ? props.title : undefined} />
    }

    case "value_strip":
      return <ValueStrip />

    case "app_promo":
      return <AppPromo />

    case "newsletter":
      return <NewsletterForm />

    case "recently_viewed":
      return <RecentlyViewedRail />

    default:
      return assertNever(type)
  }
}

/**
 * The catalogue as this renderer knows it.
 *
 * ⚠ KEPT IN STEP WITH `packages/shared-types` BY `blocks.test.tsx`, which reads `BLOCK_TYPES` and
 * fails naming any type this union has not been taught. Writing the union as `typeof BLOCK_TYPES[n]`
 * directly would be tighter, but it would also make the `never` default below unreachable for a type
 * added to the catalogue — which is the exact case it exists to catch.
 */
type KnownBlockType =
  | "hero"
  | "category_strip"
  | "product_rail"
  | "offers"
  | "value_strip"
  | "app_promo"
  | "newsletter"
  | "recently_viewed"

function assertNever(type: never): null {
  // Unreachable when the union is complete. Returns null rather than throwing: reaching here at
  // runtime means one section is missing, and taking the whole storefront down over it would be a
  // strictly worse outcome (FR-042).
  void type
  return null
}

/**
 * Which block owns the page's first image — the one that renders eager and high-priority.
 *
 * ⚠ DERIVED FROM ORDER, and it must stay derived. The moment this becomes a field, an operator can
 * reorder the page and leave the priority pointing at something in the middle of it, which is
 * precisely the defect the storefront has today in a different form.
 */
export function firstImageBlock(blocks: StorefrontLayoutBlockDTO[]): string | null {
  const carriesImagery = new Set(["hero", "offers", "category_strip", "product_rail"])
  return blocks.find((b) => carriesImagery.has(b.type))?.id ?? null
}

/**
 * The destination vocabulary, resolved to a URL.
 *
 * ⚠ FOUR KINDS, AND `promotion` IS DELIBERATELY NOT ONE (042 T058). This feature retires the
 * promotion-detail page, so keeping that kind would let an operator author a tile aimed at a route
 * that no longer exists — which is precisely the defect 029 spent a slice fixing, where every banner
 * pointed at the unfiltered store for its entire life because nothing asserted where a link led.
 *
 * ⚠ An unrecognised kind yields `null` and the TILE IS DROPPED, never rendered non-tappable. A
 * promotional tile with a dead call to action is worse than no tile: the shopper acts on it.
 */
function destinationHref(dest: unknown): string | null {
  if (typeof dest !== "object" || dest === null) return null
  const d = dest as { kind?: unknown; categoryKey?: unknown; productId?: unknown }

  switch (d.kind) {
    case "search":
      return "/search"
    case "sale":
      return "/search?onSale=true"
    case "category":
      return typeof d.categoryKey === "string" && d.categoryKey ? `/browse/${d.categoryKey}` : null
    case "product":
      return typeof d.productId === "string" && d.productId ? `/product/${d.productId}` : null
    default:
      return null
  }
}

/** Read the authored tiles off an offers block, dropping any that cannot be rendered honestly. */
function offerTiles(props: Record<string, unknown>, ctx: BlockContext): OfferTile[] {
  const raw = props.tiles
  if (!Array.isArray(raw)) return []

  const out: OfferTile[] = []
  raw.forEach((item, i) => {
    if (typeof item !== "object" || item === null) return
    const t = item as Record<string, unknown>

    const headline = typeof t.headline === "string" ? t.headline : ""
    const ctaLabel = typeof t.ctaLabel === "string" ? t.ctaLabel : ""
    const href = destinationHref(t.ctaDestination)
    // Publish-time validation refuses all three, so reaching here means the layout predates a rule
    // or was written past the API. Dropping the tile is the same degradation rule as everywhere else.
    if (!headline || !ctaLabel || !href) return

    /**
     * ⚠ A TILE LINKED TO A PROMOTION DISAPPEARS WHEN THAT PROMOTION DOES (FR-030). The operator does
     * not have to remember to take it down — which is the whole reason linking exists, since the
     * alternative is a storefront advertising a code that no longer works.
     */
    if (typeof t.promoCodeId === "string" && t.promoCodeId !== "") {
      if (!ctx.livePromotionIds.has(t.promoCodeId)) return
    }

    out.push({
      id: typeof t.id === "string" ? t.id : `tile-${i}`,
      size: typeof t.size === "string" ? t.size : "small",
      eyebrow: typeof t.eyebrow === "string" ? t.eyebrow : undefined,
      headline,
      supporting: typeof t.supporting === "string" ? t.supporting : undefined,
      ctaLabel,
      ctaHref: href,
      ctaStyle: typeof t.ctaStyle === "string" ? t.ctaStyle : undefined,
      // Artwork resolution is the composer's presigned-read work (T061); until a tile carries a URL
      // it renders as copy, which reads as a design choice rather than a broken load.
      imageUrl: typeof t.imageUrl === "string" ? t.imageUrl : null,
      /**
       * ⚠ `alt=""` HERE IS A DECLARATION, NOT A DEFAULT. It is reached only when the operator ticked
       * "decorative" — publish refuses artwork that is neither described nor declared. Both storefront
       * banner components hardcode the empty string today, which is the defect this replaces.
       */
      alt: typeof t.altText === "string" ? t.altText : "",
    })
  })
  return out
}
