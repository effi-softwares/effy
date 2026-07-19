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

class SearchProducts(private val repo: CatalogRepository) {
    suspend operator fun invoke(query: String, saleOnly: Boolean, cursor: String?): ProductPage =
        repo.search(query, saleOnly, cursor)
}
