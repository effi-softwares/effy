package com.effyshopping.customer.mobile.features.catalog.presentation

import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.BannerPlacement
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.Rail

/**
 * Home's vertical sequence, resolved before anything is laid out: [composeHome] is one pure function from
 * data to an ordered list of [HomeBlock], so the rules are unit tests: the out-of-range clamp, skipping an
 * empty section (never a heading above nothing), omitting empty categories and banners, and the order
 * (categories above the merchandising).
 */
sealed interface HomeBlock {
    /** The category shortcut row. Present only when there is something to show. */
    data class Categories(val items: List<CategoryShortcut>) : HomeBlock

    /** One merchandising section - a titled, horizontally scrolling rail. */
    data class Section(val rail: Rail) : HomeBlock

    /**
     * One or more promotions at the same point in the sequence.
     *
     * More than one renders as a pager with a position indicator and **never**
     * auto-advances - mobile has no hover, so a shopper cannot pause a rotating carousel
     * and may be navigated somewhere they did not intend.
     */
    data class Promo(val banners: List<Banner>) : HomeBlock

    /**
     * The offers carousel, one block at a fixed point. A promotion is in it or between sections ([Promo]),
     * never both.
     */
    data class Offers(val banners: List<Banner>) : HomeBlock
}

/** How many banners the offers carousel carries: most shoppers never reach a carousel's last slide. */
const val MAX_OFFERS = 6

/**
 * One category shortcut.
 *
 * Deliberately carries NO icon. `data-model.md` §5 sketched `icon: DrawableResource`, but that
 * would drag a Compose resource type into the pure layer and make this whole function untestable in
 * `commonTest` - for a value the render site can resolve from [key] in one call. The icon is looked
 * up at render time by `categoryIcon(icon)`, which is itself pure and separately tested.
 */
data class CategoryShortcut(val key: String, val label: String, val icon: String? = null)

/**
 * Resolve [HomeContent] and the categories into Home's ordered blocks. Pure. Category shortcuts first, then
 * the sections in the server's order with promotions at their positions. The server owns section order:
 * nothing here sorts, renames or enumerates rails, so a new grouping needs no app release.
 */
fun composeHome(home: HomeContent, categories: List<Category>): List<HomeBlock> {
    // A section with nothing in it is omitted entirely, never rendered as a heading above
    // nothing. The server already drops empty rails; this is the belt to that pair of braces.
    val sections = home.rails.filter { it.products.isNotEmpty() }

    // Categories with something to sell (`productCount` counts a category's own products).
    val shortcuts = categories
        .filter { it.productCount > 0 }
        .map { CategoryShortcut(key = it.key, label = it.name, icon = it.icon) }

    // Exclusive placement: a banner is in the carousel OR between sections, never both.
    val carousel = home.banners
        .filter { it.placement == BannerPlacement.CAROUSEL }
        .sortedBy { it.position }
        .take(MAX_OFFERS)
    val inline = home.banners.filter { it.placement == BannerPlacement.INLINE }

    // Clamped, not filtered. `coerceIn` moves an out-of-range position to the nearest legal slot;
    // dropping it instead would mean a mistyped number silently unpublishes a live promotion, and
    // the operator would see a saved, advertised promotion that simply never appears.
    //
    // Grouping by the clamped slot is also what handles "several promotions live at once" - they
    // land in one Promo block and render as a pager, rather than stacking three panels in a row.
    val promosAt: Map<Int, List<Banner>> = inline
        .sortedBy { it.position }
        .groupBy { it.position.coerceIn(0, sections.size) }

    return buildList {
        // 087 (Main board): the offers carousel is the hero - the first thing on Home, above the aisles.
        // It answers "what is on offer?" before a shopper has to go looking. Absent entirely
        // when empty.
        if (carousel.isNotEmpty()) add(HomeBlock.Offers(carousel))

        if (shortcuts.isNotEmpty()) add(HomeBlock.Categories(shortcuts))

        // Position 0 sits above the first section.
        promosAt[0]?.let { add(HomeBlock.Promo(it)) }

        sections.forEachIndexed { index, rail ->
            add(HomeBlock.Section(rail))
            // Position n+1 sits after the (n+1)th section - this is what "between sections" means.
            promosAt[index + 1]?.let { add(HomeBlock.Promo(it)) }
        }
    }
}
