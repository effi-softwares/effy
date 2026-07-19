package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.BannerDTO
import com.effyshopping.customer.mobile.commerce.contract.MediaDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductAttributeGroupDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductBadge as ProductBadgeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontCategoryDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductCardDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductDetailDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontRailDTO
import com.effyshopping.customer.mobile.features.catalog.domain.AttributeGroup
import com.effyshopping.customer.mobile.features.catalog.domain.AttributeItem
import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.Media
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.Rail

/**
 * Wire DTO → domain mappers (019 US1). Kept as internal top-level functions so `commonTest` can exercise
 * them without a live client. The generated DTO enum is narrowed to the app's own [ProductBadge]; an
 * unknown badge the backend adds later is dropped (tolerant reader), never crashes.
 */

internal fun StorefrontProductCardDTO.toDomain(): ProductCard = ProductCard(
    id = id,
    name = name,
    brand = brand,
    imageUrl = imageURL,
    priceAmount = priceAmount,
    currency = currency,
    compareAtAmount = compareAtAmount,
    badges = badges.map { it.toDomain() },
    available = available,
)

internal fun ProductBadgeDTO.toDomain(): ProductBadge = when (this) {
    ProductBadgeDTO.OnSale -> ProductBadge.ON_SALE
    ProductBadgeDTO.New -> ProductBadge.NEW
}

internal fun BannerDTO.toDomain(): Banner = Banner(
    key = key,
    title = title,
    subtitle = subtitle,
    href = href,
)

internal fun StorefrontRailDTO.toDomain(): Rail = Rail(
    key = key,
    title = title,
    products = products.map { it.toDomain() },
)

internal fun StorefrontHomeDTO.toDomain(): HomeContent = HomeContent(
    banners = banners.map { it.toDomain() },
    rails = rails.map { it.toDomain() },
)

internal fun StorefrontCategoryDTO.toDomain(): Category = Category(
    key = key,
    name = name,
    parentKey = parentKey,
)

internal fun MediaDTO.toDomain(): Media = Media(imageUrl = imageURL, alt = alt)

internal fun ProductAttributeGroupDTO.toDomain(): AttributeGroup = AttributeGroup(
    groupLabel = groupLabel,
    items = items.map { AttributeItem(label = it.label, value = it.value) },
)

internal fun StorefrontProductDetailDTO.toDomain(): ProductDetail = ProductDetail(
    card = ProductCard(
        id = id,
        name = name,
        brand = brand,
        imageUrl = imageURL,
        priceAmount = priceAmount,
        currency = currency,
        compareAtAmount = compareAtAmount,
        badges = badges.map { it.toDomain() },
        available = available,
    ),
    longDescription = longDescription,
    gallery = gallery.map { it.toDomain() },
    attributes = attributes.map { it.toDomain() },
    categoryPath = categoryPath,
)
