package com.effyshopping.shop.mobile.features.catalog.domain

/**
 * The catalog boundary (016 US2–US5). Everything goes to `edge-api/shop` with the single access-token
 * bearer (014 D2s), scoped `WHERE shop_id = actorShopId` by the BACKEND — the client never supplies a shop
 * id. Implementations map wire DTOs to the pure domain and never let a DTO escape; transport + non-2xx
 * failures surface as `AppException` (a closed `AppError`). A stale-edit 409 becomes `AppError.Conflict`
 * (FR-023a); a missing product becomes `AppError.NotFound`.
 */
interface CatalogRepository {
    /** `GET /shop/v1/catalog/schema` — the active types (with attributes) + category tree; bootstraps create. */
    suspend fun getCatalogSchema(): CatalogSchema

    /** `GET /shop/v1/products` — one backend-computed page for [query] (never the whole catalog, FR-017). */
    suspend fun listProducts(query: ProductQuery): ProductPage

    /** `GET /shop/v1/products/{id}` — full detail (incl. the `updatedAt` edit token + drift notice). */
    suspend fun getProduct(id: String): ProductDetail

    /** `POST /shop/v1/products` — create; the backend validates universal + type-mandatory attributes. */
    suspend fun createProduct(input: NewProduct): ProductDetail

    /** `PATCH /shop/v1/products/{id}` — focused edit; a stale [ProductPatch.expectedUpdatedAt] → Conflict. */
    suspend fun updateProduct(id: String, patch: ProductPatch): ProductDetail

    /** `POST /shop/v1/products/{id}/status` — lifecycle transition (publish re-validates mandatory). */
    suspend fun changeStatus(id: String, status: ProductStatus): ProductDetail

    /** `DELETE /shop/v1/products/{id}` — hard delete ONLY if unreferenced/draft, else Conflict ("archive"). */
    suspend fun deleteProduct(id: String)

    /** `GET /shop/v1/sections` — this shop's sections. */
    suspend fun listSections(): List<ShopSection>

    /** `PATCH /shop/v1/products/{id}/sections` — set a product's section membership. */
    suspend fun setSections(id: String, sectionIds: List<String>): ProductDetail

    /** `POST /shop/v1/products/{id}/media` — a presigned upload slot (the PUT itself is a platform concern). */
    suspend fun presignUpload(productId: String, contentType: String, fileSize: Long): PresignedUpload

    /** `POST /shop/v1/products/{id}/media/register` — record an uploaded object. */
    suspend fun registerMedia(productId: String, storageKey: String, isPrimary: Boolean, altText: String?): ProductMedia
}
