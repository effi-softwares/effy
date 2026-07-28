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
}
