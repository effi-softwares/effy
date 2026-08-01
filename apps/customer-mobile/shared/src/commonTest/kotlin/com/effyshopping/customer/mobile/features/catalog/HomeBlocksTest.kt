package com.effyshopping.customer.mobile.features.catalog

import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.BannerPlacement
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.Rail
import com.effyshopping.customer.mobile.features.catalog.presentation.HomeBlock
import com.effyshopping.customer.mobile.features.catalog.presentation.MAX_OFFERS
import com.effyshopping.customer.mobile.features.catalog.presentation.composeHome
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 028 T006 — the rules that decide what Home shows, tested without a device.
 *
 * Everything here is a rule that has a wrong answer a shopper or an operator would actually notice:
 * a promotion that silently vanishes, a heading above nothing, a category that promises products it
 * does not have. They live in a pure function precisely so they can be pinned here.
 */
class HomeBlocksTest {

    private fun product(id: String) = ProductCard(
        id = id,
        name = "Product $id",
        brand = null,
        imageUrl = null,
        priceAmount = "4.50",
        currency = "AUD",
        compareAtAmount = null,
        badges = emptyList(),
        available = true,
    )

    private fun rail(key: String, size: Int = 2) =
        Rail(key = key, title = key.replaceFirstChar { it.uppercase() }, products = List(size) { product("$key-$it") })

    /** An INLINE banner — 028's between-sections placement, which these interleaving tests are about. */
    private fun banner(key: String, position: Int) =
        Banner(
            key = key, title = "Banner $key", subtitle = null, imageUrl = null, href = null,
            position = position, placement = BannerPlacement.INLINE,
        )

    private fun offer(key: String, position: Int = 0) =
        Banner(
            key = key, title = "Offer $key", subtitle = null, imageUrl = null, href = null,
            position = position, placement = BannerPlacement.CAROUSEL,
        )

    private fun category(key: String, productCount: Int = 3, parentKey: String? = null) =
        Category(key = key, name = key.replaceFirstChar { it.uppercase() }, parentKey = parentKey, productCount = productCount, imageUrl = null)

    // ── Order and shape ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `categories come first then sections in the order the server gave them`() {
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"), rail("on_sale"))),
            listOf(category("grocery"), category("bakery")),
        )

        assertTrue(blocks.first() is HomeBlock.Categories, "category shortcuts belong above the merchandising (FR-024)")
        assertEquals(
            listOf("featured", "on_sale"),
            blocks.filterIsInstance<HomeBlock.Section>().map { it.rail.key },
            "the server owns section order — composeHome must never reorder (research R8)",
        )
    }

    // ── FR-020: never a heading above nothing ───────────────────────────────────────────────────

    @Test
    fun `an empty rail is omitted entirely`() {
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"), Rail("empty", "Empty", emptyList()))),
            emptyList(),
        )

        assertEquals(
            listOf("featured"),
            blocks.filterIsInstance<HomeBlock.Section>().map { it.rail.key },
            "a section with no products must be omitted, not rendered as a heading above nothing (FR-020)",
        )
    }

    // ── FR-029: the category row omits rather than lies ─────────────────────────────────────────

    @Test
    fun `only categories that have products become shortcuts`() {
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"))),
            listOf(
                category("grocery"),
                category("empty", productCount = 0),
                category("milk", parentKey = "grocery"),
            ),
        )

        val shortcuts = blocks.filterIsInstance<HomeBlock.Categories>().single().items
        assertEquals(
            listOf("grocery", "milk"),
            shortcuts.map { it.key },
            "depth is NOT the filter — products are. A leaf category holding stock is exactly what a " +
                "shopper can usefully tap; the empty one is what must be omitted.",
        )
    }

    @Test
    fun `composeHomeWithRealisticTaxonomy surfaces the categories that actually hold products`() {
        // ⚠ THIS IS THE SHAPE OF THE REAL CATALOGUE, and the test that should have existed first.
        //
        // Every product's primary category is a LEAF. The three top-level categories report
        // productCount = 0 because the count does not roll up to descendants. The original filter
        // ("top-level with products") therefore rendered an EMPTY category row against live data —
        // 13 authored icons showing nothing — and every unit test passed, because the fixtures gave
        // top-level categories a product count the real ones do not have.
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"))),
            listOf(
                category("food", productCount = 0),
                category("grocery", productCount = 0),
                category("household", productCount = 0),
                category("pantry", productCount = 10, parentKey = "grocery"),
                category("beverages", productCount = 6, parentKey = "grocery"),
                category("cleaning", productCount = 7, parentKey = "household"),
                category("meals", productCount = 5, parentKey = "food"),
            ),
        )

        val shortcuts = blocks.filterIsInstance<HomeBlock.Categories>().singleOrNull()?.items
        assertEquals(
            listOf("pantry", "beverages", "cleaning", "meals"),
            shortcuts?.map { it.key },
            "the row must carry the categories a shopper can actually tap into. A top-level shortcut " +
                "would open a results screen with zero products, because category filtering is an " +
                "exact primary-category match server-side with no rollup.",
        )
    }

    @Test
    fun `a category with no products is never offered`() {
        // The other half: honesty. Tapping a shortcut must never land on an empty screen.
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"))),
            listOf(category("pantry", productCount = 4), category("frozen", productCount = 0)),
        )

        assertEquals(
            listOf("pantry"),
            blocks.filterIsInstance<HomeBlock.Categories>().single().items.map { it.key },
        )
    }

    @Test
    fun `the category row is omitted when nothing qualifies`() {
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"))),
            listOf(category("empty", productCount = 0)),
        )

        assertTrue(
            blocks.none { it is HomeBlock.Categories },
            "an empty category row must be absent, not an empty row (FR-029)",
        )
    }

    // ── FR-030: banners sit BETWEEN sections ────────────────────────────────────────────────────

    @Test
    fun `a banner at position zero sits above the first section`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(banner("promo", position = 0)), rails = listOf(rail("featured"))),
            emptyList(),
        )

        assertTrue(blocks[0] is HomeBlock.Promo)
        assertTrue(blocks[1] is HomeBlock.Section)
    }

    @Test
    fun `a banner at position one sits after the first section`() {
        val blocks = composeHome(
            HomeContent(
                banners = listOf(banner("promo", position = 1)),
                rails = listOf(rail("featured"), rail("on_sale")),
            ),
            emptyList(),
        )

        assertEquals(
            listOf("Section:featured", "Promo:promo", "Section:on_sale"),
            blocks.map {
                when (it) {
                    is HomeBlock.Section -> "Section:${it.rail.key}"
                    is HomeBlock.Promo -> "Promo:${it.banners.joinToString { b -> b.key }}"
                    is HomeBlock.Categories -> "Categories"
                    is HomeBlock.Offers -> "Offers"
                }
            },
            "position n means 'after the nth section' — that is what makes FR-030's 'between sections' real",
        )
    }

    // ── The clamp: a mistyped position must never hide a live promotion ─────────────────────────

    @Test
    fun `an out-of-range position is clamped to the end and never dropped`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(banner("promo", position = 99)), rails = listOf(rail("featured"))),
            emptyList(),
        )

        assertEquals(1, blocks.filterIsInstance<HomeBlock.Promo>().size, "a live promotion must survive a mistyped position")
        assertTrue(blocks.last() is HomeBlock.Promo, "clamped to the end, not silently discarded")
    }

    @Test
    fun `a negative position is clamped to the start and never dropped`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(banner("promo", position = -5)), rails = listOf(rail("featured"))),
            emptyList(),
        )

        assertTrue(blocks.first() is HomeBlock.Promo)
    }

    @Test
    fun `a banner survives even when there are no sections at all`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(banner("promo", position = 3)), rails = emptyList()),
            emptyList(),
        )

        assertEquals(1, blocks.size)
        assertTrue(blocks.single() is HomeBlock.Promo, "no sections to sit between must not mean no banner")
    }

    // ── Several live at once → one pager, not three stacked panels ──────────────────────────────

    @Test
    fun `banners at the same position group into one block`() {
        val blocks = composeHome(
            HomeContent(
                banners = listOf(banner("b", position = 0), banner("a", position = 0)),
                rails = listOf(rail("featured")),
            ),
            emptyList(),
        )

        val promo = blocks.filterIsInstance<HomeBlock.Promo>().single()
        assertEquals(2, promo.banners.size, "two live promotions at one slot are one pager, not two stacked panels")
    }

    // ── FR-035 / SC-012: empty means empty ──────────────────────────────────────────────────────

    @Test
    fun `no promotion produces no promo block and no placeholder`() {
        val blocks = composeHome(
            HomeContent(banners = emptyList(), rails = listOf(rail("featured"))),
            emptyList(),
        )

        assertTrue(blocks.none { it is HomeBlock.Promo }, "no live promotion means no banner AND no placeholder (FR-035)")
    }

    @Test
    fun `an entirely empty store produces no blocks at all`() {
        val blocks = composeHome(HomeContent(banners = emptyList(), rails = emptyList()), emptyList())

        assertTrue(
            blocks.isEmpty(),
            "the screen renders exactly one empty state from this; a stack of empty headings would be the defect (SC-012)",
        )
    }

    // ── The offers carousel and exclusive placement (029 T031) ──────────────────────────────────

    @Test
    fun `carousel and inline banners land in DIFFERENT blocks`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(offer("o1"), banner("i1", position = 1)), rails = listOf(rail("featured"), rail("on_sale"))),
            emptyList(),
        )

        assertEquals(1, blocks.filterIsInstance<HomeBlock.Offers>().size)
        assertEquals(1, blocks.filterIsInstance<HomeBlock.Promo>().size)
        // ⚠ FR-027: exclusive. A banner in both would mean a shopper meets one offer twice on a screen.
        assertEquals(listOf("o1"), blocks.filterIsInstance<HomeBlock.Offers>().single().banners.map { it.key })
        assertEquals(listOf("i1"), blocks.filterIsInstance<HomeBlock.Promo>().single().banners.map { it.key })
    }

    @Test
    fun `the offers section sits after the categories and before the first rail`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(offer("o1")), rails = listOf(rail("featured"))),
            listOf(category("pantry")),
        )

        // SC-012: a shopper should be able to say what the current offer is without going looking.
        assertTrue(blocks[0] is HomeBlock.Categories)
        assertTrue(blocks[1] is HomeBlock.Offers)
        assertTrue(blocks[2] is HomeBlock.Section)
    }

    @Test
    fun `no carousel banners produces no offers block at all`() {
        val blocks = composeHome(
            HomeContent(banners = listOf(banner("i1", position = 0)), rails = listOf(rail("featured"))),
            emptyList(),
        )

        // FR-024: absent entirely — no heading, no empty frame.
        assertTrue(blocks.none { it is HomeBlock.Offers })
    }

    @Test
    fun `the offers carousel is bounded and keeps the earliest order`() {
        val many = (1..MAX_OFFERS + 3).map { offer("o$it", position = it) }
        val blocks = composeHome(
            HomeContent(banners = many, rails = listOf(rail("featured"))),
            emptyList(),
        )

        val shown = blocks.filterIsInstance<HomeBlock.Offers>().single().banners
        // FR-026: a swipeable set stops being explorable somewhere, and most shoppers never reach the
        // last slide anyway. ⚠ The DROP must be logged at the render site — a silent cap reads to an
        // operator as "my promotion did not save".
        assertEquals(MAX_OFFERS, shown.size)
        assertEquals(listOf("o1", "o2", "o3", "o4", "o5", "o6"), shown.map { it.key })
    }

    @Test
    fun `a banner with no explicit placement goes to the carousel`() {
        // The domain default, and the tolerant-reader landing spot for an unknown wire value. A live
        // offer in the wrong section beats a live offer nowhere.
        val defaulted = Banner(key = "d", title = "D", subtitle = null, imageUrl = null, href = null)
        val blocks = composeHome(
            HomeContent(banners = listOf(defaulted), rails = listOf(rail("featured"))),
            emptyList(),
        )

        assertEquals(listOf("d"), blocks.filterIsInstance<HomeBlock.Offers>().single().banners.map { it.key })
    }
}
