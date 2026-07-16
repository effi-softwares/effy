package com.effyshopping.shop.mobile.features.catalog.domain

/**
 * The catalog domain (016 US2–US5). PURE models — no wire concern reaches here; the DTOs in
 * `packages/shared-types/contract-shop` are mapped in `data/CatalogMappers.kt` and never escape the data
 * layer (Principle VI). Prices stay as decimal STRINGS end-to-end (the backend is authoritative on money;
 * we never parse to a float and lose precision).
 */

/** Product lifecycle (FR-013). `draft` → `active` (publish) ↔ `unavailable`; any → `archived` (soft remove). */
enum class ProductStatus(val key: String, val label: String) {
    DRAFT("draft", "Draft"),
    ACTIVE("active", "Active"),
    UNAVAILABLE("unavailable", "Unavailable"),
    ARCHIVED("archived", "Archived"),
}

/** The data type of a back-office-authored attribute — drives which create/edit control is rendered. */
enum class AttributeType { BOOLEAN, LONG_TEXT, MULTI_SELECT, NUMBER, SHORT_TEXT, SINGLE_SELECT }

/** Managed-schema lifecycle; only ACTIVE entities are offered in the create form. */
enum class SchemaStatus { ACTIVE, RETIRED }

/** An option for a select-typed attribute. */
data class AllowedValue(val id: String, val value: String, val label: String, val displayOrder: Int)

/** Optional per-attribute validation (bounds a number, caps a text length). All fields optional. */
data class AttributeValidation(val min: Double? = null, val max: Double? = null, val maxLength: Int? = null)

/**
 * An attribute assigned to a product type — carries the per-type facts (mandatory, order, group) that the
 * create form obeys. `allowedValues` is populated only for the select types.
 */
data class AttributeDef(
    val attributeId: String,
    val key: String,
    val name: String,
    val type: AttributeType,
    val isMandatory: Boolean,
    val displayOrder: Int,
    val groupLabel: String? = null,
    val helpText: String? = null,
    val unit: String? = null,
    val allowedValues: List<AllowedValue> = emptyList(),
    val validation: AttributeValidation? = null,
)

/** A back-office product classification, with its assigned attributes (drives the schema-driven form). */
data class ProductType(
    val id: String,
    val key: String,
    val name: String,
    val description: String? = null,
    val attributes: List<AttributeDef>,
)

/** A node in the platform category taxonomy (flat; the tree is built client-side via [parentId]). */
data class Category(
    val id: String,
    val key: String,
    val name: String,
    val parentId: String? = null,
    val displayOrder: Int,
)

/** One call bootstraps the create form: the active types (each with attributes) + the active category set. */
data class CatalogSchema(val productTypes: List<ProductType>, val categories: List<Category>)

/** A thin row in the shop catalog list (the backend paginates + computes every field, FR-017). */
data class ProductListItem(
    val id: String,
    val name: String,
    val sku: String? = null,
    val brand: String? = null,
    val typeName: String,
    val categoryName: String,
    val priceAmount: String,
    val currency: String,
    val status: ProductStatus,
    val primaryImageUrl: String? = null,
    val updatedAt: String,
)

/** One backend-computed page of the catalog list. */
data class ProductPage(val items: List<ProductListItem>, val total: Int, val page: Int, val pageSize: Int)

/** A typed attribute value ON a product (EAV — exactly one value shape is set, matching [type]). */
data class ProductAttributeValue(
    val attributeId: String,
    val key: String,
    val name: String,
    val type: AttributeType,
    val unit: String? = null,
    val valueBoolean: Boolean? = null,
    val valueNumber: Double? = null,
    val valueOptions: List<String> = emptyList(),
    val valueText: String? = null,
) {
    /** A human-readable rendering for the detail rows (never a raw column). */
    val display: String
        get() = when (type) {
            AttributeType.BOOLEAN -> if (valueBoolean == true) "Yes" else "No"
            AttributeType.NUMBER -> valueNumber?.let { n -> unit?.let { "$n $it" } ?: n.toString() } ?: "—"
            AttributeType.MULTI_SELECT, AttributeType.SINGLE_SELECT ->
                valueOptions.joinToString(", ").ifBlank { "—" }
            else -> valueText?.ifBlank { null } ?: "—"
        }
}

/** A media object on a product (list/detail carry short-lived presigned GET urls). */
data class ProductMedia(
    val id: String,
    val storageKey: String,
    val url: String,
    val isPrimary: Boolean,
    val displayOrder: Int,
    val altText: String? = null,
)

/** A shop-local section (Uber-Eats-style grouping). */
data class ShopSection(val id: String, val name: String, val displayOrder: Int)

/**
 * Full product detail. [updatedAt] is the optimistic-concurrency token (FR-023a — echoed back on edit);
 * [missingMandatoryAttributes] is the non-blocking schema-drift notice (FR-020a — attributes made
 * mandatory AFTER this product was created).
 */
data class ProductDetail(
    val id: String,
    val name: String,
    val shortDescription: String,
    val longDescription: String? = null,
    val sku: String? = null,
    val brand: String? = null,
    val gtin: String? = null,
    val priceAmount: String,
    val compareAtAmount: String? = null,
    val currency: String,
    val status: ProductStatus,
    val productTypeId: String,
    val typeName: String,
    val primaryCategoryId: String,
    val categoryName: String,
    val attributes: List<ProductAttributeValue>,
    val media: List<ProductMedia>,
    val sections: List<String>,
    val missingMandatoryAttributes: List<String>,
    val createdAt: String,
    val updatedAt: String,
)

/** Sort keys the backend list understands. */
enum class ProductSort(val key: String) { NAME("name"), PRICE("price"), RECENT("recent") }

enum class SortOrder(val key: String) { ASC("asc"), DESC("desc") }

/**
 * The catalog list query — every filter is sent to the backend, which computes the page (FR-017); the
 * client never receives the whole catalog. Null fields are simply not sent.
 */
data class ProductQuery(
    val q: String? = null,
    val type: String? = null,
    val category: String? = null,
    val section: String? = null,
    val status: ProductStatus? = null,
    val priceMin: String? = null,
    val priceMax: String? = null,
    val sort: ProductSort? = null,
    val order: SortOrder? = null,
    val page: Int = 1,
    val pageSize: Int = 20,
)

/** A value supplied for one attribute on create/edit (only the field matching the type is set). */
data class AttributeInput(
    val attributeId: String,
    val valueBoolean: Boolean? = null,
    val valueNumber: Double? = null,
    val valueOptions: List<String>? = null,
    val valueText: String? = null,
)

/** The payload for creating a shop-owned product (FR-010/FR-010a — `brand` is first-class). */
data class NewProduct(
    val name: String,
    val shortDescription: String,
    val priceAmount: String,
    val primaryCategoryId: String,
    val productTypeId: String,
    val longDescription: String? = null,
    val sku: String? = null,
    val brand: String? = null,
    val gtin: String? = null,
    val compareAtAmount: String? = null,
    val sectionIds: List<String> = emptyList(),
    val attributes: List<AttributeInput> = emptyList(),
    val primaryMediaStorageKey: String? = null,
)

/**
 * A FOCUSED edit (FR-023): only the supplied fields are patched. [expectedUpdatedAt] is REQUIRED — a stale
 * value yields a 409 the UI turns into a reload prompt rather than a silent overwrite (FR-023a).
 */
data class ProductPatch(
    val expectedUpdatedAt: String,
    val name: String? = null,
    val shortDescription: String? = null,
    val longDescription: String? = null,
    val sku: String? = null,
    val brand: String? = null,
    val gtin: String? = null,
    val priceAmount: String? = null,
    val compareAtAmount: String? = null,
    val primaryCategoryId: String? = null,
    val productTypeId: String? = null,
    val attributes: List<AttributeInput>? = null,
)

/** A presigned direct-to-S3 upload slot (FR-026). The raw PUT is a platform concern (file picker). */
data class PresignedUpload(val uploadUrl: String, val storageKey: String)
