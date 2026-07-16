package com.effyshopping.shop.mobile.features.catalog.domain

/**
 * The catalog use cases (016 R13). The ViewModels depend on THESE, not the repository directly — the repo
 * is private to [com.effyshopping.shop.mobile.app.AppContainer]. Each use case is a thin, named intent over
 * the [CatalogRepository] boundary; the interesting logic (validation, EAV mapping, pagination) is the
 * backend's, so these stay trivially fakeable (the mobile test posture, R14).
 */

/** Read the schema that drives the create form (types + their attributes + the category tree). */
class GetCatalogSchema(private val repo: CatalogRepository) {
    suspend operator fun invoke(): CatalogSchema = repo.getCatalogSchema()
}

/** One backend-computed page for the given filters (FR-017). */
class ListProducts(private val repo: CatalogRepository) {
    suspend operator fun invoke(query: ProductQuery): ProductPage = repo.listProducts(query)
}

/** Full detail for one product (incl. the concurrency token + schema-drift notice). */
class GetProduct(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String): ProductDetail = repo.getProduct(id)
}

/** Create a product; the backend enforces universal + type-mandatory attributes and SKU uniqueness. */
class CreateProduct(private val repo: CatalogRepository) {
    suspend operator fun invoke(input: NewProduct): ProductDetail = repo.createProduct(input)
}

/** A focused edit; the patch carries [ProductPatch.expectedUpdatedAt] so a concurrent edit → Conflict. */
class UpdateProduct(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String, patch: ProductPatch): ProductDetail = repo.updateProduct(id, patch)
}

/** A lifecycle transition (publish / make unavailable / archive). */
class ChangeProductStatus(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String, status: ProductStatus): ProductDetail = repo.changeStatus(id, status)
}

/** Hard-delete a product; the backend refuses (Conflict) unless it is unreferenced/draft (R8). */
class DeleteProduct(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String) = repo.deleteProduct(id)
}

/** This shop's sections (for the assign UI). */
class ListShopSections(private val repo: CatalogRepository) {
    suspend operator fun invoke(): List<ShopSection> = repo.listSections()
}

/** Set a product's section membership. */
class AssignSections(private val repo: CatalogRepository) {
    suspend operator fun invoke(id: String, sectionIds: List<String>): ProductDetail = repo.setSections(id, sectionIds)
}
