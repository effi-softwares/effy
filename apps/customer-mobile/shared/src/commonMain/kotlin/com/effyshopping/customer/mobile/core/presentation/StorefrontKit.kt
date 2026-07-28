package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.mobile.kit.ui.rememberMotionSpec

/**
 * The customer storefront's shared visual vocabulary (025).
 *
 * This is the MOBILE COUNTERPART of `apps/customer-web/components/storefront/kit.tsx`. The two files
 * exist so that "what a product tile looks like" and "how a section is headed" are each decided once
 * per surface rather than once per screen — before this, the product tile was written out three
 * times in three screens with three slightly different treatments.
 *
 * ── WHY THIS IS APP-LOCAL AND NOT IN packages/mobile-kit ────────────────────────────────────────
 *
 * The surface inversion below is a decision about the CUSTOMER STOREFRONT, not about mobile in
 * general. `shop-mobile` is signed off (014) and shares `mobile-kit`; putting these there would
 * silently restyle an operator console that nobody asked to change. `mobile-kit` keeps the
 * audience-neutral primitives (page container, field, app bar); this file keeps the storefront's
 * look. If shop-mobile ever wants a product tile, that is the moment to promote one — not before.
 */

/**
 * ── THE PAGE SURFACE IS WHITE ───────────────────────────────────────────────────────────────────
 *
 * Compose's default mapping (generated, do not edit) is `background` = `#EFEFF1` with a white `card`
 * raised on top — the console arrangement. The web storefront INVERTS that: the page is `card`
 * (white in light, `#262626` in dark) and tinted tiles use `background`. See `kit.tsx` `pageSurface`.
 *
 * ⚠ Mobile never applied the inversion, which is the whole of the "mobile looks dull" gap:
 *   - `App.kt` painted the page `background`, so every screen sat on grey rather than white.
 *   - every tile painted `surfaceVariant` — `#D4D4D4`, THREE steps darker than the web's `#EFEFF1`
 *     tile — and drew a 1.dp border the web has nowhere.
 *
 * Naming the three roles here fixes it without touching a single token: `EffyTokens.kt` is generated
 * from `tokens.css` and diff-guarded, so no colour moves, `tokens:check` passes unchanged, and the
 * WCAG gate is not involved. Dark mode keeps working because the inversion is expressed in tokens
 * that already flip (`card` #FFFFFF→#262626, `background` #EFEFF1→#171717).
 */
object EffySurface {
    /** The page. White in light, `#262626` in dark. */
    val page: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.surface

    /** A tinted tile, band or panel raised on the page — product images, hero, category tiles. */
    val tint: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.background

    /** Loading placeholders. Deliberately stronger than [tint] so a skeleton reads as "not content". */
    val skeleton: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.surfaceVariant
}

/**
 * Sizes for [EffyDisplay], mirroring the web `Display` component's `hero | page | section | sub`.
 *
 * ⚠ Line heights sit just ABOVE the font size (≈1.05), not below it. The web sets `leading-[0.95]`,
 * which a browser renders by overlapping line boxes; Compose clips glyphs that overflow the line box
 * instead, and the failure only shows on a device with a two-line heading — the one case a simulator
 * screenshot of a short title never produces. The type still reads as a tight display block; it just
 * cannot lose the top of a capital.
 */
enum class DisplaySize(internal val sp: Int, internal val lineHeightSp: Int) {
    Hero(40, 42),
    Page(32, 34),
    Section(26, 28),
    Sub(20, 22),
}

/**
 * A page or section title in the storefront's display type.
 *
 * Matches the web's `Display`: UPPERCASE, tight negative tracking (`-0.02em`), and leading tight
 * enough that multi-line headings set as a solid block rather than a loose list — see [DisplaySize]
 * for why mobile's leading is a shade looser than the web's.
 *
 * ⚠ Weight is `Bold` (700), where the web uses `font-extrabold` (800). The mobile font set ships
 * Regular/SemiBold/Bold only — adding a fourth weight means shipping another `.ttf` through
 * `packages/design-system/mobile-assets` and regenerating all three Compose themes. Recorded rather
 * than faked: asking Compose for `ExtraBold` without the file produces SYNTHETIC bolding, which
 * looks worse at display size than the real 700 does.
 */
@Composable
fun EffyDisplay(
    text: String,
    modifier: Modifier = Modifier,
    size: DisplaySize = DisplaySize.Section,
    color: Color = MaterialTheme.colorScheme.onSurface,
    textAlign: TextAlign? = null,
) {
    Text(
        text.uppercase(),
        modifier = modifier,
        color = color,
        textAlign = textAlign,
        style = MaterialTheme.typography.headlineLarge.copy(
            fontSize = size.sp.sp,
            lineHeight = size.lineHeightSp.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = (-0.02).em,
        ),
    )
}

/**
 * A merchandising section header: title on the left, an optional "See all" on the right.
 *
 * ⚠ LEFT-aligned, where the web centres its rail headings. That is the one place the two surfaces
 * deliberately differ: a centred heading works beside a 1280px-wide rail, but on a 390dp phone it
 * detaches the title from the row it belongs to and leaves no room for the "See all" the web puts on
 * the same line. Same type, same weight, same case — different alignment, for the same reason the
 * bottom bar is not a top nav.
 */
@Composable
fun EffySectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    onSeeAll: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        EffyDisplay(title, size = DisplaySize.Section, modifier = Modifier.weight(1f, fill = false))
        if (onSeeAll != null) {
            TextButton(onClick = onSeeAll) { Text("See all") }
        }
    }
}

/** The hairline the web closes each merchandising section with. */
@Composable
fun EffyHairline(modifier: Modifier = Modifier) {
    HorizontalDivider(
        modifier = modifier.padding(horizontal = EffySpacing.lg),
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

// ── The product grid ────────────────────────────────────────────────────────────────────────────
//
// One rhythm for every product listing, mirroring web's `productGrid` constant. Those values were
// written out per screen on the web too, which is exactly why tuning the gutters there meant editing
// three files and keeping them in step.

/** Horizontal gutter between tiles. */
val ProductGridGutter = EffySpacing.lg

/**
 * Vertical gutter between rows — deliberately LARGER than the horizontal one, as on the web.
 * A tile already stacks its own name and price under its image; without extra vertical air the next
 * row reads as a continuation of the row above rather than as a new row.
 */
val ProductGridRowGap = 28.dp

/** Page padding around a product grid. */
val ProductGridPadding = PaddingValues(EffySpacing.lg)

/**
 * A product tile — Principle V's recorded no-card exception (a scannable product grid IS the right
 * pattern and no better layout exists). Product DETAIL stays card-free.
 *
 * Built to the same spec as `apps/customer-web/app/(shop)/_components/ProductCard.tsx`:
 *
 *  1. EQUAL HEIGHT across a row. The image is a fixed 1:1 box and the price row is pushed to the
 *     bottom with a [Spacer], so a two-line name never shunts its neighbour's price out of line.
 *     Ragged price rows are the most common reason a product grid looks amateur.
 *  2. THE IMAGE FILLS ITS AREA — `ProductImage` already crops, so the photograph reaches every edge
 *     instead of floating letterboxed inside the tile.
 *  3. NO BORDER, NO SHADOW. The tint alone separates the product from the page. ⚠ The three tiles
 *     this replaces all drew a `1.dp` outline the web has nowhere; on a grid it fragments the page
 *     into boxes.
 *
 * ⚠ ONE ELEMENT OF THE WEB CARD IS ABSENT: the star rating. This platform has no reviews, so there
 * is nothing to render and invented stars would be a lie printed on every tile. The slot is marked
 * below; when reviews exist it goes there and nothing else about the card changes.
 *
 * [fillHeight] is for grids (`Modifier.height(IntrinsicSize)` is not available inside a lazy grid,
 * so the caller stretches items instead); rails leave it false and size to content.
 */
@Composable
fun EffyProductCard(
    product: ProductCard,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    fillHeight: Boolean = false,
) {
    val percentOff = discountPercent(product.priceAmount, product.compareAtAmount)

    // ── Press feedback (025 FR-036 / FR-037) ────────────────────────────────────────────────────
    //
    // ⚠ A bare `clickable` gives a ripple on Android and NOTHING on iOS, so on an iPhone a tile
    // could be tapped with no acknowledgement at all until the next screen arrived. The web card
    // grows slightly on hover; a phone has no hover, so the equivalent is a press.
    //
    // The scale comes from the motion system, so a shopper who asked for reduced motion gets the
    // navigation without the squeeze — the STATE CHANGE survives, only the movement goes (FR-037).
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val spec = rememberMotionSpec(MotionRole.Press)
    val scale by animateFloatAsState(
        targetValue = if (pressed && spec.usesScale) 0.97f else 1f,
        animationSpec = tween(durationMillis = spec.durationMillis),
        label = "productCardPress",
    )

    Column(
        modifier = modifier
            .then(if (fillHeight) Modifier.fillMaxSize() else Modifier)
            .scale(scale)
            .clickable(
                interactionSource = interactions,
                // Null indication: the scale IS the feedback, and a ripple over a full-bleed
                // photograph reads as a smudge rather than as a response.
                indication = null,
            ) { onClick(product.id) },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(EffySurface.tint),
            contentAlignment = Alignment.Center,
        ) {
            ProductImage(product.imageUrl, product.name, modifier = Modifier.fillMaxSize())

            if (!product.available) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("Unavailable", style = MaterialTheme.typography.labelLarge)
                }
            }
        }

        // The name is body type, NOT display type. It is a label on a tile, not a heading on a page —
        // set at heading weight it competes with the section header above the grid and a screen of
        // tiles reads as a wall of shouting.
        Text(
            product.name,
            modifier = Modifier.padding(top = EffySpacing.md),
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        // ⚠ The web card's rating row sits here. Nothing to render until reviews exist.

        // Pushes every price row in a row of tiles onto the same baseline.
        if (fillHeight) Spacer(Modifier.weight(1f))

        Row(
            modifier = Modifier.padding(top = EffySpacing.s),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            // The price stays the largest thing on the tile — it is what the shopper is scanning for.
            Text(
                money(product.priceAmount, product.currency),
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )

            if (percentOff != null && product.compareAtAmount != null) {
                // Reference information, so smaller than the price actually being charged. Rendering
                // both at the same size makes a shopper read twice to work out which number they pay.
                Text(
                    money(product.compareAtAmount, product.currency),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        textDecoration = TextDecoration.LineThrough,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                DiscountChip(percentOff)
            }
        }
    }
}

/**
 * The soft discount chip. `error` is Effy's terracotta — the token that already means "negative", so
 * no new colour enters the system for this.
 */
@Composable
fun DiscountChip(percentOff: Int, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.1f))
            .padding(horizontal = EffySpacing.s, vertical = 2.dp),
    ) {
        Text(
            "-$percentOff%",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

/**
 * A rectangular loading placeholder.
 *
 * Content-shaped skeletons (FR-032) are assembled from these, so every screen's placeholder uses one
 * colour and one radius rather than each screen picking its own.
 */
@Composable
fun EffySkeletonBlock(modifier: Modifier = Modifier, radius: androidx.compose.ui.unit.Dp = EffyRadius.md) {
    Box(modifier = modifier.clip(RoundedCornerShape(radius)).background(EffySurface.skeleton))
}

/** A product-tile-shaped skeleton, so a loading grid has the proportions of the grid that replaces it. */
@Composable
fun EffyProductCardSkeleton(modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        EffySkeletonBlock(Modifier.fillMaxWidth().aspectRatio(1f))
        EffySkeletonBlock(
            Modifier.padding(top = EffySpacing.md).fillMaxWidth(0.85f).height(16.dp),
            radius = EffyRadius.sm,
        )
        EffySkeletonBlock(
            Modifier.padding(top = EffySpacing.s).width(72.dp).height(20.dp),
            radius = EffyRadius.sm,
        )
    }
}

/**
 * The quantity stepper (025 FR-036 — 48dp minimum touch target).
 *
 * ⚠ Was written twice, in `ProductDetailScreen` and `CartScreen`, with different sizes and different
 * lower bounds. One implementation means the product page and the cart cannot disagree about what
 * "decrease" does at quantity 1.
 */
@Composable
fun EffyQuantityStepper(
    quantity: Int,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    minimum: Int = 1,
    maximum: Int = 99,
) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(EffySurface.tint)
            .heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StepperButton("−", "Decrease quantity", enabled = quantity > minimum) { onChange(quantity - 1) }
        Text(
            "$quantity",
            // ⚠ `widthIn`, not `width`: at maximum text size a two-digit quantity is wider than 40dp,
            // and a fixed width would clip the second digit — turning 12 into 1 on screen while the
            // cart charges for 12. A quantity is not a place to truncate.
            modifier = Modifier.widthIn(min = 40.dp),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleSmall,
        )
        StepperButton("+", "Increase quantity", enabled = quantity < maximum) { onChange(quantity + 1) }
    }
}

@Composable
private fun StepperButton(
    glyph: String,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(enabled = enabled, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            glyph,
            style = MaterialTheme.typography.titleMedium,
            color = if (enabled) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
            },
        )
    }
}
