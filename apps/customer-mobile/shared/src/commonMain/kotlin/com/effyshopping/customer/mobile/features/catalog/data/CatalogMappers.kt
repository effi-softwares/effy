package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.BannerDTO
import com.effyshopping.customer.mobile.commerce.contract.BannerTarget as BannerTargetDTO
import com.effyshopping.customer.mobile.commerce.contract.BannerPlacement as BannerPlacementDTO
import com.effyshopping.customer.mobile.commerce.contract.FacetDTO
import com.effyshopping.customer.mobile.commerce.contract.FacetSetDTO
import com.effyshopping.customer.mobile.commerce.contract.Kind
import com.effyshopping.customer.mobile.commerce.contract.MediaDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductAttributeGroupDTO
import com.effyshopping.customer.mobile.commerce.contract.PromotionDTO
import com.effyshopping.customer.mobile.commerce.contract.ProductBadge as ProductBadgeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontCategoryDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontHomeDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductCardDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontProductDetailDTO
import com.effyshopping.customer.mobile.commerce.contract.StorefrontRailDTO
import com.effyshopping.customer.mobile.features.catalog.domain.AttributeGroup
import com.effyshopping.customer.mobile.features.catalog.domain.AttributeItem
import com.effyshopping.customer.mobile.features.catalog.domain.Banner
import com.effyshopping.customer.mobile.features.catalog.domain.BannerPlacement
import com.effyshopping.customer.mobile.features.catalog.domain.BannerTarget
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.features.catalog.domain.Facet
import com.effyshopping.customer.mobile.features.catalog.domain.FacetControl
import com.effyshopping.customer.mobile.features.catalog.domain.FacetOption
import com.effyshopping.customer.mobile.features.catalog.domain.FacetSet
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.Media
import com.effyshopping.customer.mobile.features.catalog.domain.PriceBounds
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
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
    imageUrl = imageURL,
    href = href,
    // The wire carries an integer (`WireInt` → Long). Absent means "above the first section", which
    // is the sensible place for a banner whose position nobody set.
    position = position?.toInt() ?: 0,
    code = code,
    terms = terms,
    target = target?.toDomain(),
    // ⚠ TOLERANT. An absent or unrecognised placement becomes CAROUSEL rather than a failure — a
    // promotion must never disappear from the storefront because the server learned a new placement
    // before the app did. A live offer in the wrong section beats a live offer nowhere.
    placement = when (placement) {
        BannerPlacementDTO.Inline -> BannerPlacement.INLINE
        BannerPlacementDTO.Carousel -> BannerPlacement.CAROUSEL
        null -> BannerPlacement.CAROUSEL
    },
)

/**
 * Map the wire's flattened target onto the domain's sealed one.
 *
 * ⚠ A TOLERANT READER (versioning-policy rule 4). The generator flattens the TS discriminated union
 * into a `kind` enum plus optional fields, so a `category` with no `categoryKey` is representable on
 * the wire and meaningless here — it maps to `null`, and the banner renders non-tappable.
 *
 * Returning `null` rather than throwing is deliberate: a malformed target must cost the shopper one
 * tap, not the whole storefront.
 */
internal fun BannerTargetDTO.toDomain(): BannerTarget? = when (kind) {
    Kind.Search -> BannerTarget.Search
    Kind.Sale -> BannerTarget.Sale
    Kind.Category -> categoryKey?.let { BannerTarget.Category(it) }
    Kind.Product -> productID?.let { BannerTarget.Product(it) }
    Kind.Promotion -> promotionID?.let { BannerTarget.Promotion(it) }
}

internal fun PromotionDTO.toDomain(): Promotion = Promotion(
    id = id,
    title = title,
    subtitle = subtitle,
    imageUrl = imageURL,
    code = code,
    terms = terms,
    validity = validity,
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
    productCount = productCount.toInt(),
    imageUrl = imageURL,
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
    categoryKey = categoryKey,
)

// ── Facets (043) ─────────────────────────────────────────────────────────────────────────────────

internal fun FacetSetDTO.toDomain(): FacetSet = FacetSet(
    priceBounds = priceBounds?.let { PriceBounds(min = it.min, max = it.max) },
    facets = facets.map { it.toDomain() },
)

internal fun FacetDTO.toDomain(): Facet = Facet(
    key = key,
    label = label,
    // `type.value` is the wire string; fromWire is tolerant of an unknown control (→ MULTI_SELECT).
    control = FacetControl.fromWire(type.value),
    options = options.map { FacetOption(value = it.value, label = it.label, count = it.count.toInt()) },
)
