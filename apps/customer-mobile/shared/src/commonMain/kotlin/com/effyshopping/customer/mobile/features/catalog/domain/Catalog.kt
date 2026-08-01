package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * The catalog domain (019 US1). Clean-Architecture domain models — the app's OWN types, mapped from the
 * generated wire DTOs in the data layer (Principle VI: wire shapes never leak past `data`). The customer
 * projection carries NO shop identity (FR-038). Money is a decimal string + currency (R9).
 */

enum class ProductBadge { ON_SALE, NEW }

data class ProductCard(
    val id: String,
    val name: String,
    val brand: String?,
    val imageUrl: String?,
    val priceAmount: String,
    val currency: String,
    val compareAtAmount: String?,
    val badges: List<ProductBadge>,
    val available: Boolean,
    /**
     * OPAQUE package grouping token (021 FR-005a), carried onto a guest-cart line at add-time so the cart
     * can show the anonymous per-package split. NOT a shop id/name/location (SC-006). Blank until the
     * storefront read threads a token through — the customer projection carries no shop, so grouping is
     * authoritatively resolved server-side at quote time; a blank key degrades to one package.
     */
    val packageKey: String = "",
)

data class Banner(
    val key: String,
    val title: String,
    val subtitle: String?,
    /**
     * Promotional artwork.
     *
     * ⚠ `BannerDTO` has carried this since 019 and the mobile domain simply dropped it on the floor —
     * so the app rendered a flat brand-coloured block where a photograph belonged. Nothing about the
     * contract needed to change for 025's carousel; the field needed mapping (FR-019).
     */
    val imageUrl: String?,
    val href: String?,
    /**
     * Where this banner sits in Home's section sequence (028 FR-030): `0` = above the first section,
     * `n` = after the nth section.
     *
     * ⚠ Defaulted, because the wire does not carry it yet — 028 US4 adds `position` to `BannerDTO`.
     * It lives here from the foundational phase because `composeHome` has nothing to interleave
     * without it, and an interleaving rule with no positions is a rule that cannot be tested.
     * Out-of-range values are CLAMPED, never dropped: a mistyped position must not make a live
     * promotion invisible.
     */
    val position: Int = 0,
    /** The code a shopper types in the cart. Shown so the banner is actionable, not decorative. */
    val code: String? = null,
    /**
     * The condition sentence ("On orders over $30"), composed SERVER-SIDE so both customer surfaces
     * phrase one promotion identically. Null when the promotion has no conditions (028 FR-037d).
     */
    val terms: String? = null,
    /** Where the banner leads. Null — including for an unrecognised wire value — means NOT TAPPABLE. */
    val target: BannerTarget? = null,
    /** Which of Home's two banner placements this promotion occupies (029 FR-027). Exclusive. */
    val placement: BannerPlacement = BannerPlacement.CAROUSEL,
)

/**
 * Where an advertised promotion appears on Home (029 FR-027). **Exclusive** — never both.
 *
 * ⚠ Defaults to [CAROUSEL] everywhere, and that is a safety choice rather than a coin toss. An
 * operator who marks a promotion advertisable without thinking about placement gets it in the offers
 * section, which is where a shopper looks for offers; defaulting to [INLINE] would scatter
 * unconsidered promotions through the merchandising, where they interrupt rather than answer.
 *
 * ⚠ The same default absorbs an **unknown wire value** (tolerant reader). A promotion must never
 * vanish from the storefront because a new placement was added server-side before the app knew about
 * it — a shopper losing a live offer is a worse failure than a banner sitting in the wrong section.
 */
enum class BannerPlacement {
    /** The dedicated offers section — one bounded, swipeable block. */
    CAROUSEL,

    /** Between merchandising sections, at `position` (028's behaviour). */
    INLINE,
}

/**
 * Where a promotional banner leads (028, research R7).
 *
 * A **sealed** interface, so the render site's `when` is exhaustive and a new destination is a
 * compile error rather than a silent no-op.
 *
 * ⚠ The wire's `href` is a WEB PATH and mobile has no URL router. An unrecognised wire `kind` maps to
 * `null` here rather than to some "unknown" case — the wire shape never leaks past `data`
 * (Principle VI), and a banner with no target renders non-tappable. A tap that does nothing is worse
 * than no tap.
 */
sealed interface BannerTarget {
    /** The store, unfiltered. */
    data object Search : BannerTarget

    /** On-sale results. */
    data object Sale : BannerTarget

    data class Category(val categoryKey: String) : BannerTarget

    data class Product(val productId: String) : BannerTarget

    /**
     * The promotion itself, in full.
     *
     * ⚠ THIS IS WHAT EVERY BANNER NOW CARRIES, and it replaces a server that sent [Search] for all of
     * them — so a tap landed on the unfiltered store, indistinguishable from tapping the Search tab
     * and carrying none of the promotion's own facts. The reason no better destination existed is in
     * the data model: a promotion has no product or category scoping, so there is no filtered list to
     * open. A whole-cart discount is a message, not a place.
     */
    data class Promotion(val promotionId: String) : BannerTarget
}

/**
 * One advertised promotion in full — what a banner tap opens.
 *
 * Deliberately NOT built from the [Banner] already in hand. The promotion is re-read at tap time so a
 * promotion that expired, was exhausted by other shoppers, or was withdrawn while Home sat on screen
 * is met with "no longer available" rather than with terms that are no longer true.
 */
data class Promotion(
    val id: String,
    val title: String,
    val subtitle: String?,
    val imageUrl: String?,
    /** What the shopper types in the cart. Non-null — the screen exists to hand this over. */
    val code: String,
    /** The condition sentence, composed server-side so it matches the banner word for word. */
    val terms: String?,
    /** How long is left — "Ends in 3 days". Null when the promotion has no end date. */
    val validity: String?,
)

data class Rail(
    val key: String,
    val title: String,
    val products: List<ProductCard>,
)

data class HomeContent(
    val banners: List<Banner>,
    val rails: List<Rail>,
)

data class Category(
    val key: String,
    val name: String,
    val parentKey: String?,
    /** Active products in this category (025). Drives "N items" and the empty-category case. */
    val productCount: Int,
    /** Derived from a product in the category — categories store no imagery. Null → a brand tile. */
    val imageUrl: String?,
)

data class Media(val imageUrl: String, val alt: String?)

data class AttributeItem(val label: String, val value: String)

data class AttributeGroup(val groupLabel: String, val items: List<AttributeItem>)

/** The full product page (019 US2). Reuses [ProductCard] for the summary fields. */
data class ProductDetail(
    val card: ProductCard,
    val longDescription: String?,
    val gallery: List<Media>,
    val attributes: List<AttributeGroup>,
    val categoryPath: List<String>,
    /** The primary category's key — drives the related-products rail (025 FR-026). */
    val categoryKey: String,
)

/** The orderings a result set can be presented in (025 FR-016). */
enum class ProductSortOption(val wire: String, val label: String) {
    RELEVANCE("relevance", "Best match"),
    NEWEST("newest", "Newest"),
    PRICE_ASC("price_asc", "Price: low to high"),
    PRICE_DESC("price_desc", "Price: high to low"),
    ;

    companion object {
        fun fromWire(wire: String): ProductSortOption = entries.firstOrNull { it.wire == wire } ?: NEWEST
    }
}

/**
 * A page of search results with a keyset cursor for infinite scroll (019 US4), plus the total and the
 * ordering ACTUALLY applied (025 FR-016/FR-016a).
 *
 * ⚠ [sort] may differ from what was requested: `relevance` without a query has nothing to rank by, so
 * the server falls back to `newest` and says so. Render the control from THIS, never from the request,
 * or it will misdescribe the list beneath it.
 */
data class ProductPage(
    val items: List<ProductCard>,
    val nextCursor: String?,
    val total: Int,
    val sort: ProductSortOption,
)

/** Whether Effy delivers to a postcode, answered before a cart exists (025 FR-014). */
data class Serviceability(val postcode: String, val serviced: Boolean)

/** The catalog read port (hot path). Implemented by HttpCatalogRepository over the core client. */
interface CatalogRepository {
    suspend fun home(): HomeContent
    suspend fun categories(): List<Category>
    suspend fun productDetail(id: String): ProductDetail
    suspend fun search(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        sort: ProductSortOption,
        cursor: String?,
    ): ProductPage

    /** Up-front delivery serviceability (025). Shares checkout's predicate server-side (FR-014b). */
    suspend fun serviceability(postcode: String): Serviceability

    /** One advertised promotion in full — the destination of a banner tap. */
    suspend fun promotion(id: String): Promotion
}
