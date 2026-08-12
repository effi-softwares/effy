package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * Catalog use cases (019 US1). Thin domain operations the ViewModel depends on — the repository is never
 * reached directly from presentation (Principle VI).
 */

class GetHome(private val repo: CatalogRepository) {
    suspend operator fun invoke(): HomeContent = repo.home()
}

class GetCategories(private val repo: CatalogRepository) {
    suspend operator fun invoke(): List<Category> = repo.categories()
}

class GetProductDetail(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String): ProductDetail = repo.productDetail(id)
}

/** The promotion behind a banner tap, re-read so its terms are true at the moment they are shown. */
class GetPromotion(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String): Promotion = repo.promotion(id)
}


class SearchProducts(private val repo: CatalogRepository) {
    suspend operator fun invoke(
        query: String,
        saleOnly: Boolean,
        categoryKey: String? = null,
        sort: ProductSortOption = ProductSortOption.NEWEST,
        cursor: String? = null,
        brands: List<String> = emptyList(),
        attributes: Map<String, List<String>> = emptyMap(),
        minPrice: String? = null,
        maxPrice: String? = null,
    ): ProductPage = repo.search(
        query = query, saleOnly = saleOnly, categoryKey = categoryKey, sort = sort, cursor = cursor,
        brands = brands, attributes = attributes, minPrice = minPrice, maxPrice = maxPrice,
    )
}

/** The available facets + counts for a query + applied filters (043 US2). */
class GetFacets(private val repo: CatalogRepository) {
    suspend operator fun invoke(
        query: String,
        saleOnly: Boolean,
        categoryKey: String? = null,
        brands: List<String> = emptyList(),
        attributes: Map<String, List<String>> = emptyMap(),
        minPrice: String? = null,
        maxPrice: String? = null,
    ): FacetSet = repo.facets(
        query = query, saleOnly = saleOnly, categoryKey = categoryKey,
        brands = brands, attributes = attributes, minPrice = minPrice, maxPrice = maxPrice,
    )
}
