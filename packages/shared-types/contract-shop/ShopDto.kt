// GENERATED FROM packages/shared-types/src/shop.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: (shop DTOs: email/shop nullable, roles as List<String> narrowed in the app domain).

package com.effyshopping.shop.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

/**
 * One call bootstraps the create form: the active types (each with their assigned
 * attributes) and the active category tree (flat, parentId-linked).
 */
@Serializable
data class CatalogSchemaDTO (
    val categories: List<CategoryDTO>,
    val productTypes: List<ProductTypeDTO>
)

/**
 * A node in the platform category taxonomy (flat list; the tree is built client-side via
 * parentId).
 */
@Serializable
data class CategoryDTO (
    val displayOrder: Double,
    val id: String,
    val key: String,
    val name: String,

    @SerialName("parentId")
    val parentID: String? = null,

    val status: SchemaStatus
)

/**
 * Lifecycle for the managed schema entities (product types, attributes, categories).
 */
@Serializable
enum class SchemaStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("retired") Retired("retired");
}

/**
 * A back-office product classification, with its assigned attributes.
 */
@Serializable
data class ProductTypeDTO (
    val attributes: List<ProductTypeAttributeDTO>,
    val createdAt: String,
    val description: String? = null,
    val id: String,
    val key: String,
    val name: String,
    val status: SchemaStatus,
    val updatedAt: String
)

/**
 * An attribute assigned to a product type (the join, carrying the per-type facts).
 */
@Serializable
data class ProductTypeAttributeDTO (
    val allowedValues: List<AttributeAllowedValueDTO>,

    @SerialName("attributeId")
    val attributeID: String,

    val dataType: AttributeDataType,
    val displayOrder: Double,
    val groupLabel: String? = null,
    val helpText: String? = null,
    val isMandatory: Boolean,
    val key: String,
    val name: String,
    val unit: String? = null,
    val validation: AttributeValidationDTO? = null
)

/**
 * An option for a select-typed attribute.
 */
@Serializable
data class AttributeAllowedValueDTO (
    val displayOrder: Double,
    val id: String,
    val label: String,
    val value: String
)

/**
 * The data type of a back-office-authored attribute — drives the form input + value column.
 */
@Serializable
enum class AttributeDataType(val value: String) {
    @SerialName("boolean") AttributeDataTypeBoolean("boolean"),
    @SerialName("long_text") LongText("long_text"),
    @SerialName("multi_select") MultiSelect("multi_select"),
    @SerialName("number") Number("number"),
    @SerialName("short_text") ShortText("short_text"),
    @SerialName("single_select") SingleSelect("single_select");
}

/**
 * Optional per-attribute validation envelope (jsonb `validation`). All fields optional.
 */
@Serializable
data class AttributeValidationDTO (
    val max: Double? = null,
    val maxLength: Double? = null,
    val min: Double? = null
)

/**
 * POST /shop/v1/products/{id}/status — lifecycle transition.
 */
@Serializable
data class ChangeProductStatusRequest (
    val status: ProductStatus
)

/**
 * Product lifecycle. `draft` → `active` (publish) ↔ `unavailable`; any → `archived` (soft
 * remove).
 */
@Serializable
enum class ProductStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("archived") Archived("archived"),
    @SerialName("draft") Draft("draft"),
    @SerialName("unavailable") Unavailable("unavailable");
}

/**
 * POST /shop/v1/products/{id}/media — request a presigned direct-to-S3 upload.
 */
@Serializable
data class CreatePresignedUploadRequest (
    val contentType: String,
    val fileSize: Double
)

/**
 * POST /shop/v1/products — create a shop-owned product. `brand` is a first-class column
 * (FR-010a).
 */
@Serializable
data class CreateProductRequest (
    val attributes: List<AttributeValueInputDTO>? = null,
    val brand: String? = null,
    val compareAtAmount: String? = null,
    val gtin: String? = null,
    val longDescription: String? = null,
    val media: List<Media>? = null,
    val name: String,
    val priceAmount: String,

    @SerialName("primaryCategoryId")
    val primaryCategoryID: String,

    val primaryMediaStorageKey: String? = null,

    @SerialName("productTypeId")
    val productTypeID: String,

    @SerialName("sectionIds")
    val sectionIDS: List<String>? = null,

    val shortDescription: String,
    val sku: String? = null
)

/**
 * A value supplied for one attribute on create/edit (only the field matching the data type
 * is set).
 */
@Serializable
data class AttributeValueInputDTO (
    @SerialName("attributeId")
    val attributeID: String,

    val valueBoolean: Boolean? = null,
    val valueNumber: Double? = null,
    val valueOptions: List<String>? = null,
    val valueText: String? = null
)

@Serializable
data class Media (
    val altText: String? = null,
    val displayOrder: Double? = null,
    val isPrimary: Boolean? = null,
    val storageKey: String
)

@Serializable
data class CreateShopSectionRequest (
    val displayOrder: Double? = null,
    val name: String
)

/**
 * Shop lifecycle status (009-shop-management). Only `active` shops serve their operators;
 * `suspended` (temporary hold) and `disabled` (deactivated, retained for audit) both refuse.
 */
@Serializable
enum class ShopLifecycleStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("disabled") Disabled("disabled"),
    @SerialName("suspended") Suspended("suspended");
}

/**
 * Wire DTO for GET /shop/v1/manager-ping (contracts/shop-manager-ping.contract.md).
 */
@Serializable
data class ShopManagerPingDTO (
    val audience: Audience,
    val message: String,
    val scope: Scope,
    val subject: String
)

@Serializable
enum class Audience(val value: String) {
    @SerialName("shop") Shop("shop");
}

@Serializable
enum class Scope(val value: String) {
    @SerialName("shop_manager") ShopManager("shop_manager");
}

@Serializable
data class CreatePresignedUploadResponse (
    val storageKey: String,

    @SerialName("uploadUrl")
    val uploadURL: String
)

/**
 * RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 * docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 * consumes it, never re-declares it.
 */
@Serializable
data class ProblemJSON (
    val detail: String? = null,
    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * Full product detail. `updatedAt` is the optimistic-concurrency token (FR-023a);
 * `missingMandatoryAttributes` is the non-blocking schema-drift notice (FR-020a).
 */
@Serializable
data class ProductDetailDTO (
    val attributes: List<ProductAttributeValueDTO>,
    val brand: String? = null,
    val categoryName: String,
    val compareAtAmount: String? = null,
    val createdAt: String,
    val currency: String,
    val gtin: String? = null,
    val id: String,
    val longDescription: String? = null,
    val media: List<ProductMediaDTO>,
    val missingMandatoryAttributes: List<String>,
    val name: String,
    val priceAmount: String,

    @SerialName("primaryCategoryId")
    val primaryCategoryID: String,

    @SerialName("productTypeId")
    val productTypeID: String,

    val sections: List<String>,

    @SerialName("shopId")
    val shopID: String,

    val shortDescription: String,
    val sku: String? = null,
    val status: ProductStatus,
    val typeName: String,
    val updatedAt: String
)

/**
 * A typed attribute value on a product (EAV, one value shape per data type).
 */
@Serializable
data class ProductAttributeValueDTO (
    @SerialName("attributeId")
    val attributeID: String,

    val dataType: AttributeDataType,
    val key: String,
    val name: String,
    val unit: String? = null,
    val valueBoolean: Boolean? = null,
    val valueNumber: Double? = null,
    val valueOptions: List<String>? = null,
    val valueText: String? = null
)

/**
 * A media object on a product (list/detail carry short-lived presigned GET urls).
 */
@Serializable
data class ProductMediaDTO (
    val altText: String? = null,
    val displayOrder: Double,
    val id: String,
    val isPrimary: Boolean,
    val storageKey: String,
    val url: String
)

/**
 * Paged product list envelope. Structurally a `PagedDTO<ProductListItemDTO>` but declared
 * concretely (not a generic alias) so the Kotlin contract generator can name it.
 */
@Serializable
data class ProductListDTO (
    val items: List<ProductListItemDTO>,
    val page: Double,
    val pageSize: Double,
    val total: Double
)

/**
 * A thin row in the shop catalog table (backend-paginated).
 */
@Serializable
data class ProductListItemDTO (
    val brand: String? = null,
    val categoryName: String,
    val currency: String,
    val id: String,
    val name: String,
    val priceAmount: String,

    @SerialName("primaryImageUrl")
    val primaryImageURL: String? = null,

    val sku: String? = null,
    val status: ProductStatus,
    val typeName: String,
    val updatedAt: String
)

/**
 * POST /shop/v1/products/{id}/media/register — record an uploaded object.
 */
@Serializable
data class RegisterMediaRequest (
    val altText: String? = null,
    val displayOrder: Double? = null,
    val isPrimary: Boolean? = null,
    val storageKey: String
)

/**
 * Shop RBAC roles. Prefixed so `manager` stays unambiguously the back-office role in logs.
 */
@Serializable
enum class ShopRole(val value: String) {
    @SerialName("shop_manager") ShopManager("shop_manager"),
    @SerialName("shop_staff") ShopStaff("shop_staff");
}

/**
 * PATCH /shop/v1/products/{id}/sections — set a product's section membership.
 */
@Serializable
data class SetProductSectionsRequest (
    @SerialName("sectionIds")
    val sectionIDS: List<String>
)

/**
 * A shop-local section (grouping; Uber-Eats-style menu section).
 */
@Serializable
data class ShopSectionDTO (
    val displayOrder: Double,
    val id: String,
    val name: String
)

/**
 * Wire DTO for the assigned shop, embedded in GET /shop/v1/me.
 */
@Serializable
data class ShopSummaryDTO (
    val code: String,
    val id: String,
    val name: String,
    val status: ShopLifecycleStatus
)

/**
 * Wire DTO for GET /shop/v1/me (contracts/shop-me.contract.md). `email` may be null until
 * provisioning supplies it; `shop` is null for an unassigned operator — an expected state,
 * not an error.
 */
@Serializable
data class ShopStaffRecordDTO (
    val email: String? = null,
    val lastSeenAt: String,
    val roles: List<String>,
    val shop: ShopSummaryDTO? = null,
    val status: ShopStaffStatus,
    val subject: String
)

/**
 * Platform-owned lifecycle. A disabled operator is denied despite an otherwise-valid token.
 */
@Serializable
enum class ShopStaffStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("disabled") Disabled("disabled");
}

/**
 * PATCH /shop/v1/products/{id}/media/{mediaId} — reorder / set primary / alt text.
 */
@Serializable
data class UpdateMediaRequest (
    val altText: String? = null,
    val displayOrder: Double? = null,
    val isPrimary: Boolean? = null
)

/**
 * PATCH /shop/v1/products/{id} — focused edit. All content fields optional (a subset is
 * patched); `expectedUpdatedAt` is REQUIRED (optimistic concurrency — a stale value → 409,
 * FR-023a).
 */
@Serializable
data class UpdateProductRequest (
    val attributes: List<AttributeValueInputDTO>? = null,
    val brand: String? = null,
    val compareAtAmount: String? = null,
    val expectedUpdatedAt: String,
    val gtin: String? = null,
    val longDescription: String? = null,
    val name: String? = null,
    val priceAmount: String? = null,

    @SerialName("primaryCategoryId")
    val primaryCategoryID: String? = null,

    @SerialName("productTypeId")
    val productTypeID: String? = null,

    val shortDescription: String? = null,
    val sku: String? = null
)

@Serializable
data class UpdateShopSectionRequest (
    val displayOrder: Double? = null,
    val name: String? = null
)
