package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * The catalog domain. Clean-Architecture domain models — the app's own types, mapped from the
 * generated wire DTOs in the data layer (Principle VI: wire shapes never leak past `data`). The customer
 * projection carries NO shop identity. Money is a decimal string + currency.
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
    /** An offer covering the product ("15% off", "Buy 2 get 1 free"), or null. */
    val offerLabel: String? = null,
    /**
     * Opaque package grouping token, carried onto a guest-cart line at add-time so the cart
     * can show the anonymous per-package split. Not a shop id/name/location. Blank until the
     * storefront read threads a token through — the customer projection carries no shop, so grouping is
     * authoritatively resolved server-side at quote time; a blank key degrades to one package.
     */
    val packageKey: String = "",
    /**
     * The size this tile stands for: the one a search matched by stock code or barcode, else the
     * product's default. Quick-add adds this size, and only when [variantCount] is 1.
     */
    val variantId: String = "",
    /** Sizes on sale. Above 1 the tile offers "Choose" (open the product) instead of quick-add. */
    val variantCount: Int = 1,
    /** Sizes at different prices: the price shown is the lowest, said "From". */
    val priceVaries: Boolean = false,
    /** The comparison price of [priceAmount], when the platform gave one. */
    val unitPrice: UnitPrice? = null,
)

data class Banner(
    val key: String,
    val title: String,
    val subtitle: String?,
    /** Promotional artwork. */
    val imageUrl: String?,
    val href: String?,
    /**
     * Where this banner sits in Home's sequence: `0` above the first section, `n` after the nth. Out-of-range
     * values are clamped, never dropped, so a mistyped position cannot hide a live promotion.
     */
    val position: Int = 0,
    /** The code a shopper types in the cart. Shown so the banner is actionable, not decorative. */
    val code: String? = null,
    /**
     * The condition sentence ("On orders over $30"), composed server-side so both customer surfaces
     * phrase one promotion identically. Null when the promotion has no conditions.
     */
    val terms: String? = null,
    /** Where the banner leads. Null — including for an unrecognised wire value — means not tappable. */
    val target: BannerTarget? = null,
    /** Which of Home's two banner placements this promotion occupies. Exclusive. */
    val placement: BannerPlacement = BannerPlacement.CAROUSEL,
    /** The skin staff chose for this place. Null or classic: drawn as before 095. */
    val look: PromoLook? = null,
)

/**
 * Where an advertised promotion appears on Home, exclusively. Defaults to [carousel] (where shoppers look
 * for offers), and so does an unknown wire value: a promotion must never vanish because the server learned
 * a placement first.
 */
enum class BannerPlacement {
    /** The dedicated offers section — one bounded, swipeable block. */
    CAROUSEL,

    /** Between merchandising sections, at `position` (028's behaviour). */
    INLINE,
}

/**
 * Where a promotional banner leads.
 *
 * A **sealed** interface, so the render site's `when` is exhaustive and a new destination is a
 * compile error rather than a silent no-op.
 *
 * The wire's `href` is a web path and mobile has no URL router. An unrecognised wire `kind` maps to
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
     * This is what every banner now carries, and it replaces a server that sent [Search] for all of
     * them — so a tap landed on the unfiltered store, indistinguishable from tapping the Search tab
     * and carrying none of the promotion's own facts. The reason no better destination existed is in
     * the data model: a promotion has no product or category scoping, so there is no filtered list to
     * open. A whole-cart discount is a message, not a place.
     */
    data class Promotion(val promotionId: String) : BannerTarget
}

/** One promotion in full, re-read at tap time (not built from the [Banner] in hand), so one that ended says so. */
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
    /** Active products in this category. Drives "N items" and the empty-category case. */
    val productCount: Int,
    /** Derived from a product in the category — categories store no imagery. Null → a brand tile. */
    val imageUrl: String?,
)

data class Media(val imageUrl: String, val alt: String?)

data class AttributeItem(val label: String, val value: String)

data class AttributeGroup(val groupLabel: String, val items: List<AttributeItem>)

/** The full product page. Reuses [ProductCard] for the summary fields. */
data class ProductDetail(
    val card: ProductCard,
    val longDescription: String?,
    val gallery: List<Media>,
    val attributes: List<AttributeGroup>,
    val categoryPath: List<String>,
    /** The primary category's key — drives the related-products rail. */
    val categoryKey: String,
    /** The product's options in order; empty when it is sold one way (no selector). */
    val options: List<VariantOption> = emptyList(),
    /** The sizes on sale, in display order (never an inactive or removed one). */
    val variants: List<Variant> = emptyList(),
    /** The size to open on (the platform's choice: the first that can be bought). */
    val defaultVariantId: String = "",
)

/** An option ("Size") and its values in the shop's order. */
data class VariantOption(val id: String, val position: Int, val name: String, val values: List<VariantOptionValue>)

data class VariantOptionValue(val id: String, val value: String, val position: Int)

/** One size of a product, as a shopper may buy it. */
data class Variant(
    val id: String,
    /** The value of the first option, then of the second; null where the product has no such option. */
    val optionValueIds: Pair<String?, String?>,
    /** "500 g / Brown"; null for a product sold one way. */
    val label: String?,
    val priceAmount: String,
    val compareAtAmount: String?,
    val unitPrice: UnitPrice?,
    /** Can be bought now (the one availability rule). */
    val available: Boolean,
    /** The size's own picture, or null — the product's gallery stands. */
    val imageUrl: String?,
)

/** The orderings a result set can be presented in. */
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
 * A page of search results with a keyset cursor for infinite scroll, plus the total and the
 * ordering actually applied.
 *
 * [sort] may differ from what was requested: `relevance` without a query has nothing to rank by, so
 * the server falls back to `newest` and says so. Render the control from this, never from the request,
 * or it will misdescribe the list beneath it.
 */
data class ProductPage(
    val items: List<ProductCard>,
    val nextCursor: String?,
    val total: Int,
    val sort: ProductSortOption,
)

/** Whether Effy delivers to a postcode, answered before a cart exists. */

// Advanced filter facets

/**
 * The control a facet drives — maps the wire `FacetType`. Tolerant reader: an unknown wire value
 * degrades to [MULTI_SELECT] rather than throwing, so a facet type added server-side never blanks the
 * sheet.
 */
enum class FacetControl {
    SINGLE_SELECT,
    MULTI_SELECT,
    TOGGLE,
    ;

    companion object {
        fun fromWire(wire: String): FacetControl = when (wire) {
            "single_select" -> SINGLE_SELECT
            "toggle" -> TOGGLE
            else -> MULTI_SELECT
        }
    }
}

/** One selectable value with its count in the current set (count ≥ 1 — zero-count options are omitted). */
data class FacetOption(val value: String, val label: String, val count: Int)

/** One refinable dimension: `category`, `brand`, or an attribute-definition key. */
data class Facet(
    val key: String,
    val label: String,
    val control: FacetControl,
    val options: List<FacetOption>,
)

/** Min/max price of the current set, driving the price control's range. */
data class PriceBounds(val min: String, val max: String)

/** The facets available for a query + applied filters, with per-option counts. */
data class FacetSet(val priceBounds: PriceBounds?, val facets: List<Facet>)

/** The catalog read port. Implemented by HttpCatalogRepository over the core client. */
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
        // Multi-value facets (OR within, and across) + price band. Trailing + defaulted so the
        // existing positional call sites are unaffected.
        brands: List<String> = emptyList(),
        attributes: Map<String, List<String>> = emptyMap(),
        minPrice: String? = null,
        maxPrice: String? = null,
    ): ProductPage

    /** The available facets + per-option counts for a query + applied filters. */
    suspend fun facets(
        query: String,
        saleOnly: Boolean,
        categoryKey: String?,
        brands: List<String> = emptyList(),
        attributes: Map<String, List<String>> = emptyMap(),
        minPrice: String? = null,
        maxPrice: String? = null,
    ): FacetSet

    /** One advertised promotion in full — the destination of a banner tap. */
    suspend fun promotion(id: String): Promotion
}
