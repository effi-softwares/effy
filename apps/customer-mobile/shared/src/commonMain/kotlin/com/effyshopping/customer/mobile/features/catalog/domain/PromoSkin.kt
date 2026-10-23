package com.effyshopping.customer.mobile.features.catalog.domain

/**
 * How a promotion looks in one place: the skin staff designed, as the group read resolved it. The twin of
 * `packages/shared-types/src/promotion-skins.ts`, held to it by `promotion-skins.fixtures.json` (embedded
 * in `PromoSkinFixture.kt`). Change the TypeScript first. [SkinLayout.classic], or no [PromoLook], means the
 * app's own look.
 */
data class PromoLook(
    val skinId: String,
    val layout: SkinLayout,
    val size: SkinSize,
    /** Null for [SkinLayout.classic]. */
    val settings: SkinSettings?,
    val picture: SkinPicture?,
)

enum class SkinLayout { CLASSIC, PANEL, HEADER_CARD, FULL_PICTURE, PICTURE_BESIDE, TILE, STRIP }

enum class SkinSize { LARGE, MEDIUM, SMALL, STRIP }

enum class SkinTextSize(val px: Int) { XS(12), SM(14), MD(16), LG(20), XL(24), XXL(32) }

enum class SkinWeight(val value: Int) { REGULAR(400), MEDIUM(500), SEMIBOLD(600), BOLD(700) }

enum class SkinAlign { START, CENTER, END }

enum class SkinSpacing(val px: Int) { COMPACT(16), REGULAR(24), ROOMY(32) }

enum class SkinRadius(val px: Int) { NONE(0), SM(4), MD(6), LG(8), XL(10) }

enum class SkinButtonStyle { FILLED, OUTLINE, LINK, NONE }

enum class SkinChipStyle { DASHED, SOLID, FILLED }

enum class SkinDecorationSet { FOOD, PRODUCE, BAKERY, DRINKS, SEASONAL_WINTER, SEASONAL_SUMMER, CELEBRATION }

enum class SkinTextCorner { TOP_START, BOTTOM_START, CENTER, BOTTOM_END }

/** `#rrggbb`. */
typealias SkinColour = String

data class SkinTextStyle(val colour: SkinColour, val size: SkinTextSize, val weight: SkinWeight, val lines: Int)

data class SkinTint(val colour: SkinColour, val strength: Double)

data class SkinBackground(val colour: SkinColour, val showPicture: Boolean, val tint: SkinTint?)

data class SkinLabel(val show: Boolean, val words: String, val colour: SkinColour, val size: SkinTextSize, val wide: Boolean)

data class SkinSupporting(val show: Boolean, val style: SkinTextStyle)

data class SkinButton(val style: SkinButtonStyle, val fill: SkinColour, val text: SkinColour, val words: String, val icon: Boolean)

data class SkinChip(val show: Boolean, val style: SkinChipStyle, val fill: SkinColour, val text: SkinColour)

data class SkinDecorations(val show: Boolean, val set: SkinDecorationSet, val colour: SkinColour, val strength: Double)

data class SkinBody(val colour: SkinColour, val tagColour: SkinColour)

data class SkinShape(val radius: SkinRadius, val spacing: SkinSpacing, val outline: SkinColour?)

/** The parts of a skin that may differ in the dark appearance. */
data class SkinColours(
    val background: SkinBackground? = null,
    val label: SkinLabel? = null,
    val headline: SkinTextStyle? = null,
    val supporting: SkinSupporting? = null,
    val button: SkinButton? = null,
    val chip: SkinChip? = null,
    val decorations: SkinDecorations? = null,
    val body: SkinBody? = null,
)

data class SkinSettings(
    val background: SkinBackground,
    val label: SkinLabel,
    val headline: SkinTextStyle,
    val supporting: SkinSupporting,
    val button: SkinButton,
    val chip: SkinChip,
    val decorations: SkinDecorations,
    val align: SkinAlign,
    val shape: SkinShape,
    val body: SkinBody? = null,
    val textCorner: SkinTextCorner? = null,
    val pictureAtStart: Boolean = false,
    val pictureContain: Boolean = false,
    val dark: SkinColours? = null,
)

data class SkinPicture(
    val url: String,
    val widths: List<Int>,
    val width: Int,
    val height: Int,
    val alt: String,
    val focusX: Double,
    val focusY: Double,
)

data class SkinGeometry(val minHeight: Int, val pictureRatio: Double, val wordsWidth: Double, val decorations: Boolean)

/** The rules both renderers share — see the file comment. */
object PromoSkinRules {
    const val AUTO = "auto"

    private val GEOMETRY: Map<SkinLayout, Map<SkinSize, SkinGeometry>> = mapOf(
        SkinLayout.PANEL to mapOf(
            SkinSize.LARGE to SkinGeometry(320, 16.0 / 9, 0.55, true),
            SkinSize.MEDIUM to SkinGeometry(152, 16.0 / 9, 0.62, true),
        ),
        SkinLayout.HEADER_CARD to mapOf(
            SkinSize.MEDIUM to SkinGeometry(300, 16.0 / 9, 0.55, true),
            SkinSize.SMALL to SkinGeometry(240, 16.0 / 9, 0.7, true),
        ),
        SkinLayout.FULL_PICTURE to mapOf(
            SkinSize.LARGE to SkinGeometry(320, 16.0 / 9, 0.6, false),
            SkinSize.MEDIUM to SkinGeometry(200, 16.0 / 9, 0.8, false),
        ),
        SkinLayout.PICTURE_BESIDE to mapOf(
            SkinSize.LARGE to SkinGeometry(280, 1.0, 0.5, false),
            SkinSize.MEDIUM to SkinGeometry(180, 1.0, 0.55, false),
            SkinSize.STRIP to SkinGeometry(88, 1.0, 0.8, false),
        ),
        SkinLayout.TILE to mapOf(
            SkinSize.SMALL to SkinGeometry(180, 1.0, 1.0, true),
            SkinSize.MEDIUM to SkinGeometry(220, 1.0, 1.0, true),
        ),
        SkinLayout.STRIP to mapOf(SkinSize.STRIP to SkinGeometry(64, 1.0, 0.7, false)),
    )

    /** The geometry at a size the layout fits; null when it does not (or for classic). */
    fun geometry(layout: SkinLayout, size: SkinSize): SkinGeometry? = GEOMETRY[layout]?.get(size)

    /** The largest size the layout fits — what to draw at when the given size does not fit. */
    fun defaultSize(layout: SkinLayout): SkinSize = SkinSize.entries.firstOrNull { GEOMETRY[layout]?.containsKey(it) == true } ?: SkinSize.MEDIUM

    fun buttonWords(settings: SkinSettings, hasCode: Boolean): String? = when {
        settings.button.style == SkinButtonStyle.NONE -> null
        settings.button.words == AUTO -> if (hasCode) "Copy code" else "View offer"
        else -> settings.button.words
    }

    fun labelWords(settings: SkinSettings, hasCode: Boolean): String? = when {
        !settings.label.show -> null
        settings.label.words == AUTO -> if (hasCode) "Code" else "Offer"
        else -> settings.label.words
    }

    /** The colours in force: the dark overrides merged over the light ones in the dark appearance. */
    fun coloursFor(settings: SkinSettings, dark: Boolean): SkinSettings {
        val d = settings.dark ?: return settings
        if (!dark) return settings
        return settings.copy(
            background = d.background ?: settings.background,
            label = d.label ?: settings.label,
            headline = d.headline ?: settings.headline,
            supporting = d.supporting ?: settings.supporting,
            button = d.button ?: settings.button,
            chip = d.chip ?: settings.chip,
            decorations = d.decorations ?: settings.decorations,
            body = d.body ?: settings.body,
        )
    }

    /** `#rrggbb` as 0xAARRGGBB, fully opaque; null for anything else. */
    fun argb(hex: String): Long? {
        if (hex.length != 7 || hex[0] != '#') return null
        val rgb = hex.substring(1).toLongOrNull(16) ?: return null
        return 0xFF000000L or rgb
    }
}
