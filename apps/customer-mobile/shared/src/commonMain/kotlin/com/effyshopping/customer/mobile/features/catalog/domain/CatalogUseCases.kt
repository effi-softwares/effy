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

/** Up-front delivery serviceability (025 US1). */
class CheckServiceability(private val repo: CatalogRepository) {
    suspend operator fun invoke(postcode: String): Serviceability = repo.serviceability(postcode)
}

class SearchProducts(private val repo: CatalogRepository) {
    suspend operator fun invoke(
        query: String,
        saleOnly: Boolean,
        categoryKey: String? = null,
        sort: ProductSortOption = ProductSortOption.NEWEST,
        cursor: String? = null,
    ): ProductPage = repo.search(query, saleOnly, categoryKey, sort, cursor)
}
