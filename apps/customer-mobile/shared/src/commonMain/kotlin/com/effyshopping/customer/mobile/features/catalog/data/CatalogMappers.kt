package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.BannerTarget as BannerTargetDTO
import com.effyshopping.customer.mobile.commerce.contract.ShopperPromotionDTO
import com.effyshopping.customer.mobile.commerce.contract.FacetDTO
import com.effyshopping.customer.mobile.commerce.contract.FacetSetDTO
import com.effyshopping.customer.mobile.commerce.contract.BannerTargetKind as Kind
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
import com.effyshopping.customer.mobile.features.catalog.domain.FacetRange
import com.effyshopping.customer.mobile.features.catalog.domain.FacetSet
import com.effyshopping.customer.mobile.features.catalog.domain.HomeContent
import com.effyshopping.customer.mobile.features.catalog.domain.Media
import com.effyshopping.customer.mobile.features.catalog.domain.PriceBounds
import com.effyshopping.customer.mobile.features.catalog.domain.ProductBadge
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.customer.mobile.features.catalog.domain.Promotion
import com.effyshopping.customer.mobile.features.catalog.domain.Rail
import com.effyshopping.customer.mobile.features.catalog.domain.Variant
import com.effyshopping.customer.mobile.features.catalog.domain.VariantOption
import com.effyshopping.customer.mobile.features.catalog.domain.VariantOptionValue

/**
 * Wire DTO → domain mappers. Kept as internal top-level functions so `commonTest` can exercise
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
    offerLabel = offer?.label,
    variantId = variantID,
    variantCount = variantCount.toInt(),
    priceVaries = priceVaries,
    unitPrice = unitPrice?.toDomain(),
    ageRestricted = ageRestricted,
)

internal fun ProductBadgeDTO.toDomain(): ProductBadge = when (this) {
    ProductBadgeDTO.OnSale -> ProductBadge.ON_SALE
    ProductBadgeDTO.New -> ProductBadge.NEW
}

/**
 * Map the wire's flattened target onto the domain's sealed one.
 *
 * A tolerant reader (versioning-policy rule 4). The generator flattens the TS discriminated union
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

/**
 * A display group's promotion as a Home banner: the hero group fills the carousel, the
 * between-sections group fills the inline slots in order. Drawn, never artwork.
 */
internal fun ShopperPromotionDTO.toBanner(placement: BannerPlacement, position: Int): Banner = Banner(
    key = id,
    title = headline,
    subtitle = supportingLine,
    imageUrl = null,
    href = "/promotions/$id",
    position = position,
    code = code,
    terms = terms,
    target = target.toDomain(),
    placement = placement,
    look = skin?.toLook(),
)

internal fun StorefrontHomeDTO.toDomain(): HomeContent = HomeContent(
    banners = emptyList(),
    rails = rails.map { it.toDomain() },
)

internal fun StorefrontCategoryDTO.toDomain(): Category = Category(
    productCount = productCount.toInt(),
    imageUrl = imageURL,
    key = key,
    name = name,
    parentKey = parentKey,
    depth = depth.toInt(),
    isLeaf = isLeaf,
    icon = icon,
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
        offerLabel = offer?.label,
        variantId = variantID,
        variantCount = variantCount.toInt(),
        priceVaries = priceVaries,
        unitPrice = unitPrice?.toDomain(),
        ageRestricted = ageRestricted,
    ),
    longDescription = longDescription,
    gallery = gallery.map { it.toDomain() },
    categoryPath = categoryPath,
    categoryKey = categoryKey,
    options = options.map { o ->
        VariantOption(
            id = o.id,
            position = o.position.toInt(),
            name = o.name,
            values = o.values.map { VariantOptionValue(id = it.id, value = it.value, position = it.position.toInt()) },
        )
    },
    variants = variants.map { v ->
        Variant(
            id = v.id,
            optionValueIds = v.optionValueIDS.getOrNull(0) to v.optionValueIDS.getOrNull(1),
            label = v.label,
            priceAmount = v.priceAmount,
            compareAtAmount = v.compareAtAmount,
            unitPrice = v.unitPrice?.toDomain(),
            available = v.available,
            imageUrl = v.imageURL,
            details = v.details.map { it.toDomain() },
        )
    },
    defaultVariantId = defaultVariantID,
)

// Facets

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
    range = range?.let { FacetRange(min = it.min, max = it.max, unit = it.unit) },
)
