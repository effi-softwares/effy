package com.effyshopping.shop.mobile.features.catalog.data

import com.effyshopping.shop.mobile.contract.AttributeAllowedValueDTO
import com.effyshopping.shop.mobile.contract.AttributeDataType
import com.effyshopping.shop.mobile.contract.AttributeValidationDTO
import com.effyshopping.shop.mobile.contract.AttributeValueInputDTO
import com.effyshopping.shop.mobile.contract.CatalogSchemaDTO
import com.effyshopping.shop.mobile.contract.CategoryDTO
import com.effyshopping.shop.mobile.contract.ChangeProductStatusRequest
import com.effyshopping.shop.mobile.contract.CreateProductRequest
import com.effyshopping.shop.mobile.contract.ProductAttributeValueDTO
import com.effyshopping.shop.mobile.contract.ProductDetailDTO
import com.effyshopping.shop.mobile.contract.ProductListDTO
import com.effyshopping.shop.mobile.contract.ProductListItemDTO
import com.effyshopping.shop.mobile.contract.ProductMediaDTO
import com.effyshopping.shop.mobile.contract.ProductStatus as ProductStatusDTO
import com.effyshopping.shop.mobile.contract.ProductTypeAttributeDTO
import com.effyshopping.shop.mobile.contract.ProductTypeDTO
import com.effyshopping.shop.mobile.contract.SchemaStatus as SchemaStatusDTO
import com.effyshopping.shop.mobile.contract.ShopSectionDTO
import com.effyshopping.shop.mobile.contract.UpdateProductRequest
import com.effyshopping.shop.mobile.features.catalog.domain.AllowedValue
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeDef
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeInput
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeType
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeValidation
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.Category
import com.effyshopping.shop.mobile.features.catalog.domain.NewProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ProductAttributeValue
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductListItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPage
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPatch
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ProductType
import com.effyshopping.shop.mobile.features.catalog.domain.SchemaStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ShopSection

/**
 * Wire ↔ domain mapping (Principle VI). DTOs live ONLY in this direction — the domain never sees a DTO, the
 * wire never sees a domain model. Reads narrow the generated DTOs to pure models; writes build the request
 * DTOs from the domain inputs. `Double`-typed wire numbers (the JSON-Schema generator emits `Double` for
 * every number) are narrowed to `Int` where the domain is discrete (display order, page, size).
 */

// ── reads (DTO → domain) ─────────────────────────────────────────────────────────────────────────────

private fun AttributeDataType.toDomain(): AttributeType = when (this) {
    AttributeDataType.AttributeDataTypeBoolean -> AttributeType.BOOLEAN
    AttributeDataType.LongText -> AttributeType.LONG_TEXT
    AttributeDataType.MultiSelect -> AttributeType.MULTI_SELECT
    AttributeDataType.Number -> AttributeType.NUMBER
    AttributeDataType.ShortText -> AttributeType.SHORT_TEXT
    AttributeDataType.SingleSelect -> AttributeType.SINGLE_SELECT
}

private fun ProductStatusDTO.toDomain(): ProductStatus = when (this) {
    ProductStatusDTO.Draft -> ProductStatus.DRAFT
    ProductStatusDTO.Active -> ProductStatus.ACTIVE
    ProductStatusDTO.Unavailable -> ProductStatus.UNAVAILABLE
    ProductStatusDTO.Archived -> ProductStatus.ARCHIVED
}

private fun SchemaStatusDTO.toDomain(): SchemaStatus = when (this) {
    SchemaStatusDTO.Active -> SchemaStatus.ACTIVE
    SchemaStatusDTO.Retired -> SchemaStatus.RETIRED
}

private fun AttributeAllowedValueDTO.toDomain(): AllowedValue =
    AllowedValue(id = id, value = value, label = label, displayOrder = displayOrder.toInt())

private fun AttributeValidationDTO.toDomain(): AttributeValidation =
    AttributeValidation(min = min, max = max, maxLength = maxLength?.toInt())

private fun ProductTypeAttributeDTO.toDomain(): AttributeDef = AttributeDef(
    attributeId = attributeID,
    key = key,
    name = name,
    type = dataType.toDomain(),
    isMandatory = isMandatory,
    displayOrder = displayOrder.toInt(),
    groupLabel = groupLabel,
    helpText = helpText,
    unit = unit,
    allowedValues = allowedValues.map { it.toDomain() }.sortedBy { it.displayOrder },
    validation = validation?.toDomain(),
)

private fun ProductTypeDTO.toDomain(): ProductType = ProductType(
    id = id,
    key = key,
    name = name,
    description = description,
    attributes = attributes.map { it.toDomain() }.sortedBy { it.displayOrder },
)

private fun CategoryDTO.toDomain(): Category = Category(
    id = id,
    key = key,
    name = name,
    parentId = parentID,
    displayOrder = displayOrder.toInt(),
)

internal fun CatalogSchemaDTO.toDomain(): CatalogSchema = CatalogSchema(
    // The active schema only — a retired type/category is never offered in the create form (FR-006).
    productTypes = productTypes.filter { it.status == SchemaStatusDTO.Active }
        .map { it.toDomain() }.sortedBy { it.name },
    categories = categories.filter { it.status == SchemaStatusDTO.Active }
        .map { it.toDomain() }.sortedBy { it.displayOrder },
)

internal fun ProductListItemDTO.toDomain(): ProductListItem = ProductListItem(
    id = id,
    name = name,
    sku = sku,
    brand = brand,
    typeName = typeName,
    categoryName = categoryName,
    priceAmount = priceAmount,
    currency = currency,
    status = status.toDomain(),
    primaryImageUrl = primaryImageURL,
    updatedAt = updatedAt,
)

internal fun ProductListDTO.toDomain(): ProductPage = ProductPage(
    items = items.map { it.toDomain() },
    total = total.toInt(),
    page = page.toInt(),
    pageSize = pageSize.toInt(),
)

private fun ProductAttributeValueDTO.toDomain(): ProductAttributeValue = ProductAttributeValue(
    attributeId = attributeID,
    key = key,
    name = name,
    type = dataType.toDomain(),
    unit = unit,
    valueBoolean = valueBoolean,
    valueNumber = valueNumber,
    valueOptions = valueOptions ?: emptyList(),
    valueText = valueText,
)

private fun ProductMediaDTO.toDomain(): com.effyshopping.shop.mobile.features.catalog.domain.ProductMedia =
    com.effyshopping.shop.mobile.features.catalog.domain.ProductMedia(
        id = id,
        storageKey = storageKey,
        url = url,
        isPrimary = isPrimary,
        displayOrder = displayOrder.toInt(),
        altText = altText,
    )

internal fun ProductDetailDTO.toDomain(): ProductDetail = ProductDetail(
    id = id,
    name = name,
    shortDescription = shortDescription,
    longDescription = longDescription,
    sku = sku,
    brand = brand,
    gtin = gtin,
    priceAmount = priceAmount,
    compareAtAmount = compareAtAmount,
    currency = currency,
    status = status.toDomain(),
    productTypeId = productTypeID,
    typeName = typeName,
    primaryCategoryId = primaryCategoryID,
    categoryName = categoryName,
    attributes = attributes.map { it.toDomain() },
    media = media.map { it.toDomain() }.sortedBy { it.displayOrder },
    sections = sections,
    missingMandatoryAttributes = missingMandatoryAttributes,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

internal fun ShopSectionDTO.toDomain(): ShopSection =
    ShopSection(id = id, name = name, displayOrder = displayOrder.toInt())

// ── writes (domain → request DTO) ────────────────────────────────────────────────────────────────────

private fun ProductStatus.toDto(): ProductStatusDTO = when (this) {
    ProductStatus.DRAFT -> ProductStatusDTO.Draft
    ProductStatus.ACTIVE -> ProductStatusDTO.Active
    ProductStatus.UNAVAILABLE -> ProductStatusDTO.Unavailable
    ProductStatus.ARCHIVED -> ProductStatusDTO.Archived
}

private fun AttributeInput.toDto(): AttributeValueInputDTO = AttributeValueInputDTO(
    attributeID = attributeId,
    valueBoolean = valueBoolean,
    valueNumber = valueNumber,
    valueOptions = valueOptions,
    valueText = valueText,
)

internal fun NewProduct.toRequest(): CreateProductRequest = CreateProductRequest(
    name = name,
    shortDescription = shortDescription,
    priceAmount = priceAmount,
    primaryCategoryID = primaryCategoryId,
    productTypeID = productTypeId,
    longDescription = longDescription,
    sku = sku,
    brand = brand,
    gtin = gtin,
    compareAtAmount = compareAtAmount,
    sectionIDS = sectionIds.ifEmpty { null },
    attributes = attributes.map { it.toDto() }.ifEmpty { null },
    primaryMediaStorageKey = primaryMediaStorageKey,
)

internal fun ProductPatch.toRequest(): UpdateProductRequest = UpdateProductRequest(
    expectedUpdatedAt = expectedUpdatedAt,
    name = name,
    shortDescription = shortDescription,
    longDescription = longDescription,
    sku = sku,
    brand = brand,
    gtin = gtin,
    priceAmount = priceAmount,
    compareAtAmount = compareAtAmount,
    primaryCategoryID = primaryCategoryId,
    productTypeID = productTypeId,
    attributes = attributes?.map { it.toDto() },
)

internal fun ProductStatus.toStatusRequest(): ChangeProductStatusRequest =
    ChangeProductStatusRequest(status = toDto())
