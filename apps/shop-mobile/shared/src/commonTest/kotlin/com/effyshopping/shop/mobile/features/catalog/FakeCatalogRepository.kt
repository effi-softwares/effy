package com.effyshopping.shop.mobile.features.catalog

import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeDef
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeType
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogRepository
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.Category
import com.effyshopping.shop.mobile.features.catalog.domain.NewProduct
import com.effyshopping.shop.mobile.features.catalog.domain.PresignedUpload
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductListItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductMedia
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPage
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPatch
import com.effyshopping.shop.mobile.features.catalog.domain.ProductQuery
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ProductType
import com.effyshopping.shop.mobile.features.catalog.domain.ShopSection

/**
 * A hand-written fake (the mobile test posture — no mocking library). It records the last arguments each
 * boundary method received so the use-case and ViewModel tests can assert what actually crossed the
 * repository seam, and can be told to fail specific calls (the 409 paths).
 */
class FakeCatalogRepository(
    var schema: CatalogSchema = sampleSchema(),
    var page: ProductPage = ProductPage(items = listOf(sampleListItem()), total = 1, page = 1, pageSize = 20),
    var product: ProductDetail = sampleDetail(),
    var sections: List<ShopSection> = listOf(ShopSection("sec-1", "Featured", 0)),
) : CatalogRepository {
    var lastQuery: ProductQuery? = null
    var lastCreated: NewProduct? = null
    var lastPatch: ProductPatch? = null
    var lastStatus: ProductStatus? = null
    var lastAssigned: List<String>? = null
    var deletedId: String? = null
    var conflictOnUpdate = false
    var conflictOnDelete = false

    override suspend fun getCatalogSchema(): CatalogSchema = schema

    override suspend fun listProducts(query: ProductQuery): ProductPage {
        lastQuery = query
        return page
    }

    override suspend fun getProduct(id: String): ProductDetail = product

    override suspend fun createProduct(input: NewProduct): ProductDetail {
        lastCreated = input
        return product
    }

    override suspend fun updateProduct(id: String, patch: ProductPatch): ProductDetail {
        lastPatch = patch
        if (conflictOnUpdate) throw AppException(AppError.Conflict)
        return product
    }

    override suspend fun changeStatus(id: String, status: ProductStatus): ProductDetail {
        lastStatus = status
        return product.copy(status = status)
    }

    override suspend fun deleteProduct(id: String) {
        if (conflictOnDelete) throw AppException(AppError.Conflict)
        deletedId = id
    }

    override suspend fun listSections(): List<ShopSection> = sections

    override suspend fun setSections(id: String, sectionIds: List<String>): ProductDetail {
        lastAssigned = sectionIds
        return product.copy(sections = sectionIds)
    }

    override suspend fun presignUpload(productId: String, contentType: String, fileSize: Long): PresignedUpload =
        PresignedUpload(uploadUrl = "https://s3/upload", storageKey = "key-1")

    override suspend fun registerMedia(productId: String, storageKey: String, isPrimary: Boolean, altText: String?): ProductMedia =
        ProductMedia(id = "m1", storageKey = storageKey, url = "https://s3/get", isPrimary = isPrimary, displayOrder = 0, altText = altText)
}

fun sampleSchema(): CatalogSchema = CatalogSchema(
    productTypes = listOf(
        ProductType(
            id = "type-1", key = "prepared_food", name = "Prepared Food",
            attributes = listOf(
                AttributeDef("attr-spice", "spice_level", "Spice level", AttributeType.SINGLE_SELECT, isMandatory = true, displayOrder = 0),
                AttributeDef("attr-net", "net_weight", "Net weight", AttributeType.NUMBER, isMandatory = false, displayOrder = 1, unit = "g"),
            ),
        ),
    ),
    categories = listOf(Category("cat-1", "food", "Food", null, 0)),
)

fun sampleListItem(): ProductListItem = ProductListItem(
    id = "p1", name = "Chicken Biryani", sku = "BIR-1", brand = "House", typeName = "Prepared Food",
    categoryName = "Food", priceAmount = "12.50", currency = "AUD", status = ProductStatus.ACTIVE, updatedAt = "2026-07-16T00:00:00Z",
)

fun sampleDetail(): ProductDetail = ProductDetail(
    id = "p1", name = "Chicken Biryani", shortDescription = "Fragrant rice", longDescription = null,
    sku = "BIR-1", brand = "House", gtin = null, priceAmount = "12.50", compareAtAmount = null, currency = "AUD",
    status = ProductStatus.ACTIVE, productTypeId = "type-1", typeName = "Prepared Food",
    primaryCategoryId = "cat-1", categoryName = "Food", attributes = emptyList(), media = emptyList(),
    sections = emptyList(), missingMandatoryAttributes = emptyList(), createdAt = "2026-07-16T00:00:00Z",
    updatedAt = "2026-07-16T00:00:00Z",
)
