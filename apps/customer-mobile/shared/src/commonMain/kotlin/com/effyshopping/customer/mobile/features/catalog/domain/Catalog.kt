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
)

data class Banner(
    val key: String,
    val title: String,
    val subtitle: String?,
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
)

/** A page of search results with a keyset cursor for infinite scroll (019 US4). */
data class ProductPage(val items: List<ProductCard>, val nextCursor: String?)

/** The catalog read port (hot path). Implemented by HttpCatalogRepository over the core client. */
interface CatalogRepository {
    suspend fun home(): HomeContent
    suspend fun categories(): List<Category>
    suspend fun productDetail(id: String): ProductDetail
    suspend fun search(query: String, saleOnly: Boolean, cursor: String?): ProductPage
}
