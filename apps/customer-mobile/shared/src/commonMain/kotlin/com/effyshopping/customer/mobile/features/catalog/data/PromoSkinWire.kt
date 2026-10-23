package com.effyshopping.customer.mobile.features.catalog.data

import com.effyshopping.customer.mobile.commerce.contract.ShopperPromotionDTO
import com.effyshopping.customer.mobile.commerce.contract.ShopperSkinDTO
import com.effyshopping.customer.mobile.commerce.contract.SkinBackground as WireBackground
import com.effyshopping.customer.mobile.commerce.contract.SkinSettings as WireSettings
import com.effyshopping.customer.mobile.commerce.contract.TextStyle as WireTextStyle
import com.effyshopping.customer.mobile.features.catalog.domain.PromoLook
import com.effyshopping.customer.mobile.features.catalog.domain.SkinAlign
import com.effyshopping.customer.mobile.features.catalog.domain.SkinBackground
import com.effyshopping.customer.mobile.features.catalog.domain.SkinBody
import com.effyshopping.customer.mobile.features.catalog.domain.SkinButton
import com.effyshopping.customer.mobile.features.catalog.domain.SkinButtonStyle
import com.effyshopping.customer.mobile.features.catalog.domain.SkinChip
import com.effyshopping.customer.mobile.features.catalog.domain.SkinChipStyle
import com.effyshopping.customer.mobile.features.catalog.domain.SkinColours
import com.effyshopping.customer.mobile.features.catalog.domain.SkinDecorationSet
import com.effyshopping.customer.mobile.features.catalog.domain.SkinDecorations
import com.effyshopping.customer.mobile.features.catalog.domain.SkinLabel
import com.effyshopping.customer.mobile.features.catalog.domain.SkinLayout
import com.effyshopping.customer.mobile.features.catalog.domain.SkinPicture
import com.effyshopping.customer.mobile.features.catalog.domain.SkinRadius
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSettings
import com.effyshopping.customer.mobile.features.catalog.domain.SkinShape
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSize
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSpacing
import com.effyshopping.customer.mobile.features.catalog.domain.SkinSupporting
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTextCorner
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTextSize
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTextStyle
import com.effyshopping.customer.mobile.features.catalog.domain.SkinTint
import com.effyshopping.customer.mobile.features.catalog.domain.SkinWeight
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Reads a group response so a skin the app does not understand never costs it the promotion. The skin
 * types are enums throughout, and kotlinx fails a whole response on an unknown value, so a new layout would
 * empty Home on every installed copy. Each promotion is read without its `skin`, and the skin on its own;
 * if that fails, the promotion is drawn in the app's own look.
 */
internal fun decodePromotionGroups(json: Json, root: JsonElement): Map<String, List<ShopperPromotionDTO>> =
    root.jsonObject["groups"]?.jsonArray.orEmpty().associate { g ->
        val group = g.jsonObject
        val key = group["key"]?.jsonPrimitive?.content.orEmpty()
        key to group["promotions"]?.jsonArray.orEmpty().mapNotNull { decodePromotion(json, it) }
    }

private fun decodePromotion(json: Json, element: JsonElement): ShopperPromotionDTO? {
    val obj = element as? JsonObject ?: return null
    val promotion = runCatching { json.decodeFromJsonElement(ShopperPromotionDTO.serializer(), JsonObject(obj - "skin")) }.getOrNull() ?: return null
    val skin = obj["skin"]?.let { runCatching { json.decodeFromJsonElement(ShopperSkinDTO.serializer(), it) }.getOrNull() }
    return promotion.copy(skin = skin)
}

/** The wire skin as the domain's look; null when the app cannot draw it (then: the app's own look). */
internal fun ShopperSkinDTO.toLook(): PromoLook? {
    val layout = when (layout.value) {
        "classic" -> SkinLayout.CLASSIC
        "panel" -> SkinLayout.PANEL
        "header_card" -> SkinLayout.HEADER_CARD
        "full_picture" -> SkinLayout.FULL_PICTURE
        "picture_beside" -> SkinLayout.PICTURE_BESIDE
        "tile" -> SkinLayout.TILE
        "strip" -> SkinLayout.STRIP
        else -> return null
    }
    val settings = if (layout == SkinLayout.CLASSIC) null else (settings?.toDomain() ?: return null)
    return PromoLook(
        skinId = id,
        layout = layout,
        size = when (size.value) {
            "large" -> SkinSize.LARGE
            "small" -> SkinSize.SMALL
            "strip" -> SkinSize.STRIP
            else -> SkinSize.MEDIUM
        },
        settings = settings,
        picture = picture?.let {
            SkinPicture(
                url = it.url,
                widths = it.imageWidths.orEmpty().map(Double::toInt),
                width = it.width.toInt(),
                height = it.height.toInt(),
                alt = it.alt,
                focusX = it.focusX,
                focusY = it.focusY,
            )
        },
    )
}

private fun textSize(v: String) = when (v) {
    "xs" -> SkinTextSize.XS
    "sm" -> SkinTextSize.SM
    "lg" -> SkinTextSize.LG
    "xl" -> SkinTextSize.XL
    "2xl" -> SkinTextSize.XXL
    else -> SkinTextSize.MD
}

private fun weight(v: String) = when (v) {
    "medium" -> SkinWeight.MEDIUM
    "semibold" -> SkinWeight.SEMIBOLD
    "bold" -> SkinWeight.BOLD
    else -> SkinWeight.REGULAR
}

private fun WireTextStyle.toDomain() = SkinTextStyle(colour, textSize(size.value), weight(weight.value), lines.toInt())

private fun WireBackground.toDomain() = SkinBackground(colour, picture.value == "show", tint?.let { SkinTint(it.colour, it.strength) })

private fun buttonStyle(v: String) = when (v) {
    "filled" -> SkinButtonStyle.FILLED
    "outline" -> SkinButtonStyle.OUTLINE
    "link" -> SkinButtonStyle.LINK
    else -> SkinButtonStyle.NONE
}

private fun chipStyle(v: String) = when (v) {
    "solid" -> SkinChipStyle.SOLID
    "filled" -> SkinChipStyle.FILLED
    else -> SkinChipStyle.DASHED
}

private fun decorationSet(v: String) = when (v) {
    "produce" -> SkinDecorationSet.PRODUCE
    "bakery" -> SkinDecorationSet.BAKERY
    "drinks" -> SkinDecorationSet.DRINKS
    "seasonal-winter" -> SkinDecorationSet.SEASONAL_WINTER
    "seasonal-summer" -> SkinDecorationSet.SEASONAL_SUMMER
    "celebration" -> SkinDecorationSet.CELEBRATION
    else -> SkinDecorationSet.FOOD
}

internal fun WireSettings.toDomain(): SkinSettings = SkinSettings(
    background = background.toDomain(),
    label = SkinLabel(label.show, label.words, label.colour, textSize(label.size.value), label.tracking.value == "wide"),
    headline = headline.toDomain(),
    supporting = SkinSupporting(
        supporting.show,
        SkinTextStyle(supporting.colour, textSize(supporting.size.value), weight(supporting.weight.value), supporting.lines.toInt()),
    ),
    button = SkinButton(buttonStyle(button.style.value), button.fill, button.text, button.words, button.icon),
    chip = SkinChip(chip.show, chipStyle(chip.style.value), chip.fill, chip.text),
    decorations = SkinDecorations(decorations.show, decorationSet(decorations.set.value), decorations.colour, decorations.strength),
    align = when (align.value) {
        "center" -> SkinAlign.CENTER
        "end" -> SkinAlign.END
        else -> SkinAlign.START
    },
    shape = SkinShape(
        radius = when (shape.radius.value) {
            "none" -> SkinRadius.NONE
            "sm" -> SkinRadius.SM
            "md" -> SkinRadius.MD
            "lg" -> SkinRadius.LG
            else -> SkinRadius.XL
        },
        spacing = when (shape.spacing.value) {
            "compact" -> SkinSpacing.COMPACT
            "roomy" -> SkinSpacing.ROOMY
            else -> SkinSpacing.REGULAR
        },
        outline = shape.outline,
    ),
    body = body?.let { SkinBody(it.colour, it.tagColour) },
    textCorner = textCorner?.let {
        when (it.value) {
            "top-start" -> SkinTextCorner.TOP_START
            "center" -> SkinTextCorner.CENTER
            "bottom-end" -> SkinTextCorner.BOTTOM_END
            else -> SkinTextCorner.BOTTOM_START
        }
    },
    pictureAtStart = pictureSide?.value == "start",
    pictureContain = pictureFit?.value == "contain",
    dark = dark?.let { d ->
        SkinColours(
            background = d.background?.toDomain(),
            label = d.label?.let { SkinLabel(it.show, it.words, it.colour, textSize(it.size.value), it.tracking.value == "wide") },
            headline = d.headline?.toDomain(),
            supporting = d.supporting?.let { SkinSupporting(it.show, SkinTextStyle(it.colour, textSize(it.size.value), weight(it.weight.value), it.lines.toInt())) },
            button = d.button?.let { SkinButton(buttonStyle(it.style.value), it.fill, it.text, it.words, it.icon) },
            chip = d.chip?.let { SkinChip(it.show, chipStyle(it.style.value), it.fill, it.text) },
            decorations = d.decorations?.let { SkinDecorations(it.show, decorationSet(it.set.value), it.colour, it.strength) },
            body = d.body?.let { SkinBody(it.colour, it.tagColour) },
        )
    },
)
