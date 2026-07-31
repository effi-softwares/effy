package com.effyshopping.customer.mobile.features.catalog.presentation

import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.BannerPlacement
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.Rail

/**
 * Home's vertical sequence, resolved BEFORE anything is laid out (028 T004/T005).
 *
 * ── Why this is a list rather than three fields on the screen ────────────────────────────────────
 *
 * Home interleaves three kinds of thing: a category shortcut row, merchandising sections, and
 * promotional banners that sit BETWEEN sections rather than only at the top (FR-030). Expressed as
 * branching inside a `LazyColumn`, that interleaving is a handful of `if`s tangled with layout and
 * testable only on a device.
 *
 * Expressed as [composeHome] — one pure function from data to an ordered list of [HomeBlock] — every
 * rule that can actually be got wrong becomes a unit test:
 *
 *   · the out-of-range clamp (a mistyped position must never hide a live promotion)
 *   · the empty-section skip (FR-020 — never a heading above nothing)
 *   · the omit-when-empty rules (FR-029 categories, FR-035 banners)
 *   · the order itself (categories above the deeper merchandising, FR-024)
 *
 * None of those need Compose to verify, so none of them should be trapped inside a composable.
 */
sealed interface HomeBlock {
    /** The category shortcut row (FR-024). Present only when there is something to show. */
    data class Categories(val items: List<CategoryShortcut>) : HomeBlock

    /** One merchandising section — a titled, horizontally scrolling rail (FR-013/FR-014). */
    data class Section(val rail: Rail) : HomeBlock

    /**
     * One or more promotions at the same point in the sequence.
     *
     * More than one renders as a pager with a position indicator (FR-031) and **never**
     * auto-advances (FR-032) — mobile has no hover, so a shopper cannot pause a rotating carousel
     * and may be navigated somewhere they did not intend.
     */
    data class Promo(val banners: List<Banner>) : HomeBlock

    /**
     * The dedicated offers carousel (029 US3) — one block, at a fixed point in the sequence.
     *
     * Distinct from [Promo], which is 028's between-sections placement. A promotion appears in one
     * or the other, **never both** (FR-027): showing every advertised promotion in both needs no
     * setting at all and is wrong at the only scale that matters — with three or four live, a shopper
     * meets the same offer twice on one screen.
     */
    data class Offers(val banners: List<Banner>) : HomeBlock
}

/**
 * How many banners the offers carousel will carry (029 FR-026, research R9).
 *
 * ⚠ A bound, because a swipeable set stops being explorable somewhere around here — and Baymard's
 * carousel research is blunt that most shoppers never reach the last slide. An unbounded set mostly
 * stores promotions nobody will look at.
 */
const val MAX_OFFERS = 6

/**
 * One category shortcut.
 *
 * ⚠ Deliberately carries NO icon. `data-model.md` §5 sketched `icon: DrawableResource`, but that
 * would drag a Compose resource type into the pure layer and make this whole function untestable in
 * `commonTest` — for a value the render site can resolve from [key] in one call. The icon is looked
 * up at render time by `categoryIcon(key)` (028 US3), which is itself pure and separately tested.
 */
data class CategoryShortcut(val key: String, val label: String)

/**
 * Resolve [HomeContent] and the category list into Home's ordered blocks.
 *
 * Pure: no Compose, no clock, no I/O. Given the same inputs it returns the same list, which is what
 * makes the rules below assertions rather than hopes.
 *
 * **Order** — category shortcuts first (FR-024 puts them above the deeper merchandising, and the
 * research is that shoppers attend to category navigation over carousels), then the sections in the
 * order the SERVER returned them, with promotions interleaved at their declared positions.
 *
 * **The server owns section order** (research R8). This function never sorts, renames or reorders a
 * rail, which is what makes FR-040 true: a new grouping appears without an app release because
 * nothing here enumerates the ones that exist.
 */
fun composeHome(home: HomeContent, categories: List<Category>): List<HomeBlock> {
    // FR-020: a section with nothing in it is omitted entirely, never rendered as a heading above
    // nothing. The server already drops empty rails; this is the belt to that pair of braces.
    val sections = home.rails.filter { it.products.isNotEmpty() }

    // FR-024/FR-029: categories that actually have something to sell. A category with no products is
    // a promise the store cannot keep.
    //
    // ── ⚠ NOT `parentKey == null`, AND THAT IS A DELIBERATE DEVIATION FROM FR-024 ────────────────
    //
    // This filter was written as "top-level categories with products" and it rendered NOTHING against
    // the real catalogue. Every product's primary category is a LEAF (pantry, cleaning, meals…), and
    // `productCount` counts exact primary-category membership — it does not roll up. So all three
    // top-level categories report 0 and the whole row disappeared.
    //
    // It is not only a visibility problem. `CategoryCards`, `SearchCards` and the category rails all
    // filter on `p.primary_category_id = (SELECT id FROM category WHERE key = $1)` — exact match, no
    // descendants. So a "Grocery" shortcut, even if shown, would open a results screen with ZERO
    // products in it. Showing it would be worse than omitting it.
    //
    // Until the server can answer "products in this category OR any descendant", the categories that
    // can honestly be tapped are the ones that directly hold products. The row still spans the
    // catalogue's breadth — Pantry · Chilled · Frozen · Beverages · Bakery · Snacks · Meals ·
    // Cleaning · Paper Goods — and arguably describes the store better than Food / Grocery /
    // Household would.
    //
    // ⚠ The unit tests did not catch this: their fixtures gave top-level categories a product count,
    // so the fake agreed with the code rather than with the world. `composeHomeWithRealisticTaxonomy`
    // in HomeBlocksTest now pins the real shape.
    val shortcuts = categories
        .filter { it.productCount > 0 }
        .map { CategoryShortcut(key = it.key, label = it.name) }

    // ⚠ EXCLUSIVE placement (FR-027): a banner is in the carousel OR between sections, never both.
    val carousel = home.banners
        .filter { it.placement == BannerPlacement.CAROUSEL }
        .sortedBy { it.position }
        .take(MAX_OFFERS)
    val inline = home.banners.filter { it.placement == BannerPlacement.INLINE }

    // ⚠ CLAMPED, not filtered. `coerceIn` moves an out-of-range position to the nearest legal slot;
    // dropping it instead would mean a mistyped number silently unpublishes a live promotion, and
    // the operator would see a saved, advertised promotion that simply never appears (research R8).
    //
    // Grouping by the clamped slot is also what handles "several promotions live at once" — they
    // land in one Promo block and render as a pager, rather than stacking three panels in a row.
    val promosAt: Map<Int, List<Banner>> = inline
        .sortedBy { it.position }
        .groupBy { it.position.coerceIn(0, sections.size) }

    return buildList {
        if (shortcuts.isNotEmpty()) add(HomeBlock.Categories(shortcuts))

        // The offers carousel sits after the category shortcuts and BEFORE the first merchandising
        // section — the placement the reference platforms use, and the one that answers "what is on
        // offer?" before a shopper has to go looking (SC-012). Absent entirely when empty (FR-024).
        if (carousel.isNotEmpty()) add(HomeBlock.Offers(carousel))

        // Position 0 sits above the first section.
        promosAt[0]?.let { add(HomeBlock.Promo(it)) }

        sections.forEachIndexed { index, rail ->
            add(HomeBlock.Section(rail))
            // Position n+1 sits after the (n+1)th section — this is what "between sections" means.
            promosAt[index + 1]?.let { add(HomeBlock.Promo(it)) }
        }
    }
}
