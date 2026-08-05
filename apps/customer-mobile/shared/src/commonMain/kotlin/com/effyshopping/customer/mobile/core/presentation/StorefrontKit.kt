package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.nav.LocalNavBack
import com.effyshopping.customer.mobile.design.EffyColor
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.customer.mobile.resources.ic_close
import com.effyshopping.customer.mobile.resources.ic_orders_outlined
import com.effyshopping.mobile.design.EffyBanner
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.rememberMotionSpec
import com.effyshopping.mobile.kit.ui.widthClassFor
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import com.effyshopping.customer.mobile.resources.ic_visibility
import com.effyshopping.customer.mobile.resources.ic_visibility_off

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
 * Is the RESOLVED theme dark?
 *
 * ⚠ NOT `isSystemInDarkTheme()`. `EffyTheme` takes an explicit `AppearanceMode` (Light / Dark /
 * Follow-System, 017), so a shopper who forces Light on a dark device would get every value below
 * picked for dark while the rest of the screen rendered light. Reading the luminance of the resolved
 * `background` asks the theme what it actually is, which is true under all three modes.
 */
@Composable
@ReadOnlyComposable
private fun isDarkAppearance(): Boolean = MaterialTheme.colorScheme.background.luminance() < 0.5f

/**
 * ── SURFACE ROLES ───────────────────────────────────────────────────────────────────────────────
 *
 * ⚠ 026 REVERSED 025's SURFACE INVERSION, because the tokens it was built on no longer exist.
 *
 * 025 set `page = surface(card)` and `tint = background`, which worked when `background` was a grey
 * `#EFEFF1` and `card` was white: the inversion made the page white and tiles grey.
 *
 * Under the monochrome palette `background` and `card` are BOTH `#ffffff` in light. Keeping the
 * inversion would have made every product-image plate, hero and category tile **pure white on a pure
 * white page — invisible** — and in dark it would have painted the page `#333333` instead of the
 * `#1a1a1a` ground. The inversion was a fix for a specific token arrangement, not a principle.
 *
 * Roles are now chosen per appearance from the ramp so that **skeleton is always one step stronger
 * than tint in BOTH appearances**, which a single M3 slot pair cannot deliver (the ramp runs in
 * opposite directions either side of the ground).
 */
object EffySurface {
    /** The page ground. `#ffffff` light, `#1a1a1a` dark. */
    val page: Color
        @Composable @ReadOnlyComposable get() = MaterialTheme.colorScheme.background

    /** A tinted tile, band or panel raised on the page — product images, hero, category tiles. */
    val tint: Color
        @Composable @ReadOnlyComposable get() =
            if (isDarkAppearance()) EffyColor.Dark.secondary else EffyColor.Light.accent

    /** Loading placeholders. Deliberately stronger than [tint] so a skeleton reads as "not content". */
    val skeleton: Color
        @Composable @ReadOnlyComposable get() =
            if (isDarkAppearance()) EffyColor.Dark.accent else EffyColor.Light.muted
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
enum class DisplaySize(internal val sp: Int, internal val lineHeightSp: Int, internal val trackingEm: Float) {
    /**
     * H1 — 64sp. ⚠ The source specifies a 0.8× line height (51sp) and its own Onboarding screen wraps
     * to FOUR lines at that setting without clipping, because a browser simply lets line boxes
     * OVERLAP. Compose does not: it clips any glyph that overflows its line box, so 51sp would shear
     * the descenders off every "y" and "g" — and only on a device, never in a short-title screenshot.
     * 64sp (1.0×) is the tightest leading that cannot clip General Sans at this size.
     */
    Hero(64, 64, -0.05f),
    /** H2 — 32, the screen title ("Discover", "My Cart"). */
    Page(32, 34, -0.05f),
    /** H3 — 24, a section heading. Tracking returns to 0 below H2, as in the source. */
    Section(24, 29, 0f),
    /** H4 — 20. */
    Sub(20, 24, 0f),
}

/**
 * A page or section title in the storefront's display type.
 *
 * ⚠ 026 CHANGED THREE THINGS HERE, all to match the source design language:
 *
 *  1. NO LONGER UPPERCASED. The source sets its titles in sentence case — "Discover", "My Cart",
 *     "Details". Uppercasing them destroys the tight-tracking effect the type is built around, and
 *     also breaks screen readers, which spell out all-caps strings letter by letter.
 *  2. WEIGHT IS SEMIBOLD (600), NOT BOLD (700). General Sans ships Regular/Medium/SemiBold in this
 *     app — there is NO Bold face. Asking Compose for `FontWeight.Bold` now produces SYNTHETIC
 *     bolding, which smears the glyphs at display size. The source never uses 700 either.
 *  3. TRACKING IS PER-SIZE. −5% on H1/H2 (the source's signature), 0 below that — see [DisplaySize].
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
        text,
        modifier = modifier,
        color = color,
        textAlign = textAlign,
        style = MaterialTheme.typography.headlineLarge.copy(
            fontSize = size.sp.sp,
            lineHeight = size.lineHeightSp.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = size.trackingEm.em,
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
            // ⚠ heightIn is NOT decoration. Material 3's TextButton defaults to a 40dp min height,
            // below Principle V's 48dp minimum — and 028 turned this from an affordance with no
            // callers at all (026 deleted the rails that used it) into the primary way into a scoped
            // result set, repeated on every section down the screen. A 40dp target missed by a thumb
            // three times in a row is how a shopper concludes the store is broken.
            TextButton(
                onClick = onSeeAll,
                modifier = Modifier
                    .heightIn(min = EffyMinTouchTarget)
                    // ⚠ "See all" is enough to READ, beside a heading a sighted shopper takes in at
                    // the same glance. It is not enough to HEAR: 028 puts three to six of these down
                    // one screen, and a screen reader would announce the identical label every time
                    // with nothing to say which one leads where.
                    .semantics { contentDescription = "See all $title" },
            ) { Text("See all") }
        }
    }
}

// ── Controls (026) ──────────────────────────────────────────────────────────────────────────────
//
// ⚠ WHY THESE ARE HERE AND NOT IN packages/mobile-kit. `mobile-kit` already exports
// `EffyPrimaryAction`, but it is a PILL (CircleShape) and it is shared with shop-mobile, which this
// feature restyles NOT AT ALL (screen-inventory contract: a structural diff there is a scope error).
// The source design's button is a rounded RECTANGLE. Changing the shared one would silently restyle
// an operator console nobody asked to change — the same reasoning this file's header already gives
// for the surface inversion.

/** Minimum touch target. Principle V makes fat-finger-friendly targets a REQUIREMENT, not polish. */
val EffyMinTouchTarget = 48.dp

/**
 * The button shape — a small-radius ROUNDED RECTANGLE, not a pill.
 *
 * ⚠ Every button in this app was `CircleShape`. The source design language uses a rounded rectangle
 * throughout, and the difference is not cosmetic at this scale: a full pill on a 54dp-tall
 * full-width CTA reads as a chip, which is why the old buttons looked lightweight next to the source.
 * Defined once here so "what shape is a button" cannot drift back to per-screen answers.
 *
 * Circles are still correct for genuinely circular things — the account avatar, the quantity
 * stepper's ± targets — and those keep `CircleShape` deliberately.
 */
val EffyButtonShape: RoundedCornerShape @Composable get() = RoundedCornerShape(EffyRadius.sm)

/** The source's primary CTA: full-width, solid accent, ~54dp tall, small radius, optional leading icon. */
@Composable
fun EffyPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
) {
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val spec = rememberMotionSpec(MotionRole.Press)
    val scale by animateFloatAsState(
        targetValue = if (pressed && spec.usesScale) 0.98f else 1f,
        animationSpec = tween(durationMillis = spec.durationMillis),
        label = "primaryButtonPress",
    )

    // ⚠ Disabled is NOT the source's white-on-#CCCCCC, which measures 1.61:1 and is unreadable in
    // sunlight. It is the tuned `--disabled` pair (3.16:1). Contrast wins over fidelity (FR-015a).
    val bg = if (enabled) MaterialTheme.colorScheme.primary else EffyDisabled.fill
    val fg = if (enabled) MaterialTheme.colorScheme.onPrimary else EffyDisabled.label

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .scale(scale)
            .clip(RoundedCornerShape(EffyRadius.sm))
            .background(bg)
            .clickable(enabled = enabled, interactionSource = interactions, indication = null, onClick = onClick)
            .padding(horizontal = EffySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) leading()
        Text(label, style = MaterialTheme.typography.titleSmall, color = fg)
    }
}

/** The source's secondary button: the page surface inside a hairline border. */
@Composable
fun EffySecondaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    /**
     * An optional mark before the label — currently only "Continue with Google" (036 FR-038).
     *
     * ⚠ A SLOT ON THE SHARED BUTTON, NOT A BESPOKE GOOGLE BUTTON. Google requires its own unrecoloured
     * mark beside the label, and the alternative was a second bordered button that would drift from
     * this one's height, radius and disabled colour the first time either changed.
     */
    leading: (@Composable () -> Unit)? = null,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 54.dp)
            .clip(RoundedCornerShape(EffyRadius.sm))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(EffyRadius.sm))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading?.invoke()
            Text(
                label,
                style = MaterialTheme.typography.titleSmall,
                color = if (enabled) MaterialTheme.colorScheme.onSurface else EffyDisabled.label,
            )
        }
    }
}

/**
 * The disabled pair, read from the generated tokens.
 *
 * ⚠ Material 3's `ColorScheme` has no disabled slot, so `EffyColor` carries `disabled` /
 * `disabledForeground` as raw tokens. Reading them here keeps FR-004 true — no screen writes a hex.
 */
object EffyDisabled {
    val fill: Color
        @Composable @ReadOnlyComposable get() =
            if (isDarkAppearance()) EffyColor.Dark.disabled else EffyColor.Light.disabled
    val label: Color
        @Composable @ReadOnlyComposable get() =
            if (isDarkAppearance()) EffyColor.Dark.disabledForeground else EffyColor.Light.disabledForeground
}

/**
 * A pill chip — the source's category row and sort control.
 *
 * Selected is a SOLID accent fill, which is the source's own treatment and also means the state is
 * carried by fill + label colour together, never by colour alone (FR-040).
 */
@Composable
fun EffyChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .heightIn(min = EffyMinTouchTarget)
            .clip(CircleShape)
            .then(
                if (selected) Modifier.background(MaterialTheme.colorScheme.primary)
                else Modifier.border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = EffySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/**
 * THE BORDERLESS LIST ROW (026 T047) — image · name · meta · price, with a trailing slot.
 *
 * ⚠ This is the source design's OWN third card variant, and adopting it is what satisfies the
 * constitution's no-card rule from INSIDE the design language rather than as a deviation from it.
 * The source lays cart lines out as bordered containers; Principle V forbids cards outside product
 * tiles, and this variant is the source's own answer. No exception is claimed and none is needed.
 */
@Composable
fun EffyListRow(
    name: String,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    meta: String? = null,
    price: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .heightIn(min = EffyMinTouchTarget)
            .padding(vertical = EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        if (imageUrl != null) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(EffyRadius.sm))
                    .background(EffySurface.tint),
            ) {
                ProductImage(imageUrl, name, modifier = Modifier.fillMaxSize())
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                name,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (meta != null) {
                Text(
                    meta,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (price != null) {
                Text(
                    price,
                    modifier = Modifier.padding(top = EffySpacing.xs),
                    style = MaterialTheme.typography.titleSmall,
                )
            }
        }
        if (trailing != null) trailing()
    }
}

/**
 * A NAVIGATION ROW — leading icon, label, trailing chevron, hairline beneath.
 *
 * ⚠ This is the source design's Account pattern, and it replaces a column of full-width FILLED
 * buttons. Ten primary-coloured buttons stacked down a settings screen is the single loudest thing
 * in the old app: every destination shouted equally, so none read as more important than another.
 * The source (and every production settings screen) uses quiet rows and reserves the filled
 * treatment for the one action that commits something.
 *
 * It is also the constitution's preferred layout — "prefer tables, lists, sectioned pages, tabs and
 * detail rows" — so this moves the screen toward Principle V rather than away from it.
 *
 * [destructive] tints the label and icon with the error token AND is expected to carry a word that
 * says so ("Sign out"), because meaning may never rest on colour alone (FR-040).
 */
@Composable
fun EffyNavRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: (@Composable () -> Unit)? = null,
    supporting: String? = null,
    destructive: Boolean = false,
    showChevron: Boolean = true,
) {
    val tint = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .heightIn(min = 56.dp)
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            if (leading != null) {
                CompositionLocalProvider(LocalContentColor provides tint) { leading() }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.bodyLarge, color = tint)
                if (supporting != null) {
                    Text(
                        supporting,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (showChevron) {
                // ⚠ The shared icon set has no chevron, so this is `ic_arrow_back` rotated 180°.
                // A real production glyph turned around, NOT a "›" text character — 025 FR-029
                // banned text glyphs standing in for icons, and a rotated arrow keeps that true.
                Icon(
                    painterResource(Res.drawable.ic_arrow_back),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp).rotate(180f),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        EffyHairline()
    }
}

/**
 * A LABELLED FIELD — the source's form control: a label ABOVE a bordered box, not Material's
 * floating label.
 *
 * ⚠ The difference is not decorative. Material's `OutlinedTextField` animates its label into a notch
 * cut in the border, which is a Material signature — it makes every Effy form read as a stock Android
 * form regardless of palette. The source puts a plain, always-visible label above a plain box, which
 * is also better for accessibility: the label never becomes a placeholder and never disappears once
 * the field has content.
 *
 * [error] paints the border AND shows helper text beneath — colour is never the only signal (FR-040).
 */
@Composable
fun EffyField(
    /**
     * ⚠ NULLABLE. Pass `null` inside an [EffySheet] whose title already names the field — otherwise
     * the shopper reads "First name" twice, once as the heading and once as the label, which is what
     * the first build of 034's editor actually did.
     */
    label: String?,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
    singleLine: Boolean = true,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: (@Composable () -> Unit)? = null,
) {
    val focus = remember { MutableInteractionSource() }
    val focused by focus.collectIsFocusedAsState()
    val borderColor = when {
        error != null -> MaterialTheme.colorScheme.error
        focused -> MaterialTheme.colorScheme.onSurface
        else -> MaterialTheme.colorScheme.outlineVariant
    }

    Column(modifier = modifier.fillMaxWidth()) {
        if (label != null) {
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(bottom = EffySpacing.s),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clip(RoundedCornerShape(EffyRadius.sm))
                .border(1.dp, borderColor, RoundedCornerShape(EffyRadius.sm))
                .padding(horizontal = EffySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.weight(1f)) {
                if (value.isEmpty() && placeholder != null) {
                    Text(
                        placeholder,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = singleLine,
                    keyboardOptions = keyboardOptions,
                    visualTransformation = visualTransformation,
                    interactionSource = focus,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = MaterialTheme.colorScheme.onSurface,
                    ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.onSurface),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (trailing != null) trailing()
        }
        if (error != null) {
            Text(
                error,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = EffySpacing.xs),
            )
        }
    }
}

/** The source's "Or" separator: hairline — word — hairline. */
@Composable
fun EffyOrDivider(label: String = "Or", modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HorizontalDivider(modifier = Modifier.weight(1f), color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/**
 * The source's inline link line — "Don't have an account? **Join**".
 *
 * The action half is UNDERLINED, not merely coloured, because under a monochrome palette a coloured
 * link is only a lightness difference from body text (FR-040).
 */
@Composable
fun EffyInlineLink(
    prompt: String,
    action: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(prompt, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            action,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = FontWeight.SemiBold,
                textDecoration = TextDecoration.Underline,
            ),
            modifier = Modifier
                .heightIn(min = EffyMinTouchTarget)
                .clickable(onClick = onClick)
                .padding(vertical = EffySpacing.md),
        )
    }
}

/**
 * The back arrow on its own, occupying a full touch target whether or not it draws.
 *
 * The source design uses it two ways: inside the app bar on ordinary pushed screens, and **bare above
 * the headline** on the focused auth screens, which have no bar. Both read [LocalNavBack] by default,
 * so neither can be shown where it would do nothing — or omitted where it is the only way out.
 *
 * The box is reserved even when the arrow is absent, so a title centred beside it does not shift.
 */
@Composable
fun EffyBackArrow(
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = LocalNavBack.current,
) {
    Box(modifier = modifier.size(EffyMinTouchTarget), contentAlignment = Alignment.CenterStart) {
        if (onBack != null) {
            Icon(
                painterResource(Res.drawable.ic_arrow_back),
                contentDescription = "Back",
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onBack),
            )
        }
    }
}

/**
 * THE APP BAR — back arrow · centred title · optional trailing action.
 *
 * The source design puts this on every pushed screen. It is customer-local rather than in
 * `mobile-kit` for the reason this file's header gives: `EffyTopBar` there is shared with shop-mobile,
 * which this feature does not restyle.
 *
 * ⚠ [onBack] DEFAULTS TO THE NAVIGATOR — the arrow appears on a pushed screen and is absent at a tab
 * root, with nothing passed in. See [LocalNavBack] for why that decision was taken away from screens.
 * Pass it explicitly only to override: a non-navigational back action, or `null` to suppress it.
 */
@Composable
fun EffyAppBar(
    title: String,
    modifier: Modifier = Modifier,
    onBack: (() -> Unit)? = LocalNavBack.current,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(horizontal = EffySpacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EffyBackArrow(onBack = onBack)
        Text(
            title,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Box(modifier = Modifier.size(EffyMinTouchTarget), contentAlignment = Alignment.CenterEnd) {
            if (trailing != null) trailing()
        }
    }
}

/**
 * The source's segmented toggle — an active white pill sliding inside a tinted track.
 *
 * Used for Ongoing / Completed on orders. The active segment is carried by FILL and WEIGHT together,
 * so the selection survives grayscale (FR-040).
 */
@Composable
fun <T> EffySegmentedToggle(
    options: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(EffyRadius.sm))
            .background(EffySurface.tint)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEach { option ->
            val active = option == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(EffyRadius.sm))
                    .then(if (active) Modifier.background(EffySurface.page) else Modifier)
                    .clickable { onSelect(option) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label(option),
                    style = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                    ),
                    color = if (active) {
                        MaterialTheme.colorScheme.onSurface
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }
    }
}

/**
 * The source's empty state: a centred outline icon, a headline, an explanation, and one way out.
 *
 * FR-044 requires empty cart, favourites and order history each to offer a route back into the
 * catalogue — so [actionLabel]/[onAction] are the point of this component, not decoration.
 */
@Composable
fun EffyEmptyState(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: DrawableResource = Res.drawable.ic_orders_outlined,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(EffySpacing.xxxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            painterResource(icon),
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        EffyDisplay(
            title,
            size = DisplaySize.Sub,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = EffySpacing.lg),
        )
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = EffySpacing.s),
        )
        if (actionLabel != null && onAction != null) {
            EffyPrimaryButton(
                actionLabel,
                onClick = onAction,
                modifier = Modifier.padding(top = EffySpacing.xl),
            )
        }
    }
}

/** A label/value detail row — the source's order-summary and specifics pattern. */
@Composable
fun EffyDetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    emphasised: Boolean = false,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyLarge,
            color = if (emphasised) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
        Text(
            value,
            style = if (emphasised) {
                MaterialTheme.typography.titleSmall
            } else {
                MaterialTheme.typography.bodyLarge
            },
        )
    }
}

/**
 * A tappable label / value / chevron row — the account area's editing affordance (034 FR-010).
 *
 * ⚠ SEPARATE FROM `EffyDetailRow` ABOVE, WHICH STAYS AS IT IS. That one is a DISPLAY row: no click,
 * no trailing slot, value right-aligned against the label. This one stacks label over value, is
 * activatable, and carries a chevron — a different job, and merging them would give the display row
 * a click target it must not have (it is used inside receipts).
 *
 * ⚠ WHY A ROW RATHER THAN AN INLINE FIELD, since that is the real argument: a row with a live input
 * in it cannot also show a verified state, a "managed by Google" state, or a pending-change state
 * without becoming cramped. A value-and-chevron row is a DISPLAY surface, so it can carry status; an
 * input row is an ENTRY surface and cannot.
 *
 * `editable = false` keeps the row activatable but drops the chevron and shows `trailingNote` —
 * because a row that silently ignores a tap is indistinguishable from a broken one (FR-022).
 */
@Composable
fun EffyValueRow(
    label: String,
    value: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    editable: Boolean = true,
    placeholder: String = "Not set",
    trailingNote: String? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            // FR-055 — 48dp is the ACTIVATION AREA, not the glyph. Feature 033 shipped a 32dp
            // control directly beneath a comment claiming it met the minimum; the number is stated
            // here so the next reader can check it rather than trust it.
            .heightIn(min = EffyMinTouchTarget)
            .clickable(onClick = onClick)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                value?.takeIf { it.isNotBlank() } ?: placeholder,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(EffySpacing.md))
        if (editable) {
            Icon(
                painter = painterResource(Res.drawable.ic_arrow_back),
                contentDescription = null,
                modifier = Modifier.size(18.dp).rotate(180f),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (trailingNote != null) {
            Text(
                trailingNote,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * ONE FIELD, ONE SHEET (034 US1) — the mobile half of the per-field editing model.
 *
 * ⚠ THE DIRTY-CHECK IS MANDATORY, NOT POLISH (FR-018 / FR-019).
 *
 * A changed value must never be discarded silently, and on Android there are THREE ways out: a
 * downward drag, a scrim tap, and the system back gesture. `onDismissRequest` covers the scrim and
 * back; it does NOT intercept the drag, which needs `confirmValueChange` on the sheet state. Wiring
 * only one leaves the other route discarding work. NN/g additionally found that the same downward
 * swipe often lands on the notification shade instead — so an accidental dismissal is not a rare case.
 *
 * ⚠ AND THE CONFIRMATION IS AN ALERT, NOT A SECOND SHEET. Stacking sheets is what FR-023 forbids;
 * FR-023a records this exemption explicitly.
 *
 * @param dirty whether the editor holds unsaved changes — the caller owns the comparison, because
 *   only it knows what "unchanged" means for its field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EffySheet(
    title: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dirty: Boolean = false,
    /** The committing action. Omit only for a sheet that commits nothing. */
    primaryLabel: String? = null,
    onPrimary: (() -> Unit)? = null,
    primaryEnabled: Boolean = true,
    cancelLabel: String = "Cancel",
    discardTitle: String = "Discard your changes?",
    discardBody: String = "What you typed here will not be saved.",
    content: @Composable ColumnScope.() -> Unit,
) {
    val confirmingDiscardState = remember { mutableStateOf(false) }
    var confirmingDiscard by confirmingDiscardState

    // ⚠⚠ READ BEFORE TOUCHING THE `confirmValueChange` LAMBDA. ⚠⚠
    //
    // `rememberModalBottomSheetState` delegates to
    //     rememberSaveable(skipPartiallyExpanded, confirmValueChange, skipHiddenState, saver = …)
    // so **the lambda is a KEY**. Any recomposition that produces a NEW lambda instance discards the
    // SheetState and rebuilds it with `initialValue = Hidden` — and the sheet then animates Hidden →
    // Expanded, which the shopper sees as the sheet dropping and springing back.
    //
    // The first build captured `dirty` directly. On the FIRST keystroke `dirty` flips false → true,
    // Compose's lambda memoisation emits a new instance, the key changes, and the sheet dipped —
    // once, on the first character only, because every later keystroke leaves `dirty` true and reuses
    // the memoised instance. A perfect little Heisenbug: invisible in tests, obvious on a device.
    //
    // The fix is to make the lambda ONE STABLE INSTANCE that reads the current values through State
    // at call time, so the key never changes. `remember {}` with no keys guarantees that; both values
    // it reads are MutableState/State, so it always sees the latest without being recreated.
    val dirtyState = rememberUpdatedState(dirty)
    val confirmValueChange = remember {
        { target: SheetValue ->
            if (target == SheetValue.Hidden && dirtyState.value) {
                confirmingDiscardState.value = true
                false
            } else {
                true
            }
        }
    }

    // Intercepts the DRAG. Returning false vetoes the state change, so the sheet stays put while the
    // alert asks. `onDismissRequest` below covers the scrim tap and the back gesture.
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = confirmValueChange,
    )

    ModalBottomSheet(
        onDismissRequest = { if (dirty) confirmingDiscard = true else onDismiss() },
        sheetState = sheetState,
        // FR-024 — bounded on large screens. A full-bleed sheet on a tablet is a 1000dp-wide strip
        // holding one text field, with a long journey between the label and the action.
        sheetMaxWidth = 640.dp,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                // FR-016 — the sheet rides above the keyboard, so neither Save nor a field error can
                // be hidden by it.
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = EffySpacing.xl)
                .padding(bottom = EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            // ⚠ NO CLOSE (X) BUTTON, and no header Row — both were removed after the first build.
            //
            // The X sat opposite the title and did exactly what Cancel does one row below it. Two
            // controls for one action is not redundancy that helps; it is a second thing to read, and
            // it forced a full-height header row that pushed the title down into a band of dead space
            // under the drag handle.
            //
            // FR-017 still holds — it requires an EXPLICIT, non-gesture way out, in addition to the
            // drag, because a path-based gesture cannot be the only route to a function and the drag
            // handle is widely missed. **Cancel is that control.** It is visible, permanent, keyboard-
            // and screen-reader reachable, and it is the one a shopper actually reads.
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(top = EffySpacing.s),
            )

            content()

            // The action pair, owned HERE so every account sheet is identical (034 — "one design").
            // ⚠ Save first, Cancel BELOW it and DE-WEIGHTED (FR-014/FR-015): Cancel sits under the
            // thumb's resting position, so two equally-weighted filled buttons turn a mis-tap into
            // silent data loss.
            if (primaryLabel != null && onPrimary != null) {
                EffyPrimaryButton(primaryLabel, onClick = onPrimary, enabled = primaryEnabled)
            }
            TextButton(
                onClick = { if (dirty) confirmingDiscard = true else onDismiss() },
                modifier = Modifier.fillMaxWidth().heightIn(min = EffyMinTouchTarget),
            ) {
                Text(cancelLabel, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }

    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = { confirmingDiscard = false },
            title = { Text(discardTitle) },
            text = { Text(discardBody) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDiscard = false
                    onDismiss()
                }) { Text("Discard") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDiscard = false }) { Text("Keep editing") }
            },
        )
    }
}

/**
 * A password input with a reveal toggle — the ONE password field in this app (034).
 *
 * ⚠ THE TOGGLE IS AN ACCESSIBILITY CONTROL, NOT A CONVENIENCE. WCAG 2.2 SC 3.3.8 (Accessible
 * Authentication) exists because making someone type a credential they cannot read, with no way to
 * check it, is a barrier — worst for anyone using a password manager, a screen reader, or a phone
 * keyboard that hides what it just typed. GOV.UK's research went further and dropped their "confirm
 * password" field once they shipped a reveal, on the grounds that seeing the password beats typing it
 * twice and hoping you made the same mistake both times.
 *
 * ⚠ IT EXISTS BECAUSE THERE WERE THREE DESIGNS FOR ONE CONTROL. Sign-in and sign-up each drew a text
 * "Show"/"Hide" `TextButton`; the recovery screen had no toggle at all; and 034's password screens
 * added an eye icon. Same control, three answers, one of them missing.
 *
 * ⚠ Each field owns its own state. Sharing it across a form would reveal a shopper's CURRENT password
 * because they wanted to check the new one.
 *
 * ⚠ Hidden by default and deliberately NOT `rememberSaveable`: a revealed password must not survive
 * backgrounding the app and returning to it somewhere public.
 */
@Composable
fun EffyPasswordField(
    label: String?,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    error: String? = null,
) {
    var revealed by remember { mutableStateOf(false) }
    EffyField(
        label = label,
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        placeholder = placeholder,
        error = error,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation =
            if (revealed) VisualTransformation.None else PasswordVisualTransformation(),
        trailing = {
            IconButton(
                onClick = { revealed = !revealed },
                // FR-055 — the ACTIVATION AREA is the target, not the 24dp glyph inside it.
                modifier = Modifier.size(EffyMinTouchTarget),
            ) {
                Icon(
                    painter = painterResource(
                        if (revealed) Res.drawable.ic_visibility_off else Res.drawable.ic_visibility,
                    ),
                    // States what the control DOES next — what a screen-reader user needs, rather
                    // than a description of the current state.
                    contentDescription = if (revealed) "Hide password" else "Show password",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
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
 *
 * ⚠ Tightened 20dp from 28dp alongside the 028 type reduction. The old value was set against a
 * `bodyLarge` name and a `titleLarge` price; with both a step smaller, 28dp read as a hole between
 * rows rather than as separation.
 */
val ProductGridRowGap = EffySpacing.xl

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
    /**
     * An optional overlay on the image, top-right (033). Used by the save control.
     *
     * ⚠ A SLOT ON THE ONE CARD, not a second card. Every product tile in this app reaches this
     * composable — Home rails via EffyRailTile, and Search / Browse / Category / "see all" all render
     * one SearchScreen — so a slot here is the whole surface. Wrapping at each call site instead
     * would give four slightly different positions, which is exactly the drift EffyRailTile's own
     * comment warns about.
     *
     * ⚠ Defaults to null, so every existing call site is unchanged.
     */
    imageOverlay: (@Composable BoxScope.() -> Unit)? = null,
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

            // ⚠ LAST, so it sits above the unavailable scrim. A shopper must still be able to
            // un-save something that went out of stock — burying the control under the scrim would
            // strand it in their list.
            imageOverlay?.invoke(this)
        }

        // The name is body type, NOT display type. It is a label on a tile, not a heading on a page —
        // set at heading weight it competes with the section header above the grid and a screen of
        // tiles reads as a wall of shouting.
        Text(
            product.name,
            modifier = Modifier.padding(top = EffySpacing.s),
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )

        // ⚠ The web card's rating row sits here. Nothing to render until reviews exist.

        // Pushes every price row in a row of tiles onto the same baseline.
        if (fillHeight) Spacer(Modifier.weight(1f))

        Row(
            modifier = Modifier.padding(top = EffySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            // The price stays the largest thing on the tile — it is what the shopper is scanning for.
            Text(
                money(product.priceAmount, product.currency),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            )

            if (percentOff != null && product.compareAtAmount != null) {
                // Reference information, so smaller than the price actually being charged. Rendering
                // both at the same size makes a shopper read twice to work out which number they pay.
                Text(
                    money(product.compareAtAmount, product.currency),
                    style = MaterialTheme.typography.bodySmall.copy(
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
    // ⚠ SHIMMERS. This used to be a flat `.background(skeleton)` — a static grey box, which under a
    // monochrome palette is indistinguishable from a piece of UI that has simply rendered grey and
    // finished. The movement is the entire difference between "loading" and "broken", because there
    // is no hue available to carry that meaning instead.
    Box(modifier = modifier.clip(RoundedCornerShape(radius)).effyShimmer())
}

/**
 * The shimmer treatment, as a Modifier so every placeholder in the app shares one implementation.
 *
 * A band of slightly lighter neutral travelling across the skeleton colour. ⚠ Reduced motion is
 * honoured (FR-045): when a shopper has asked for less movement the sweep is dropped and a **static**
 * plate remains — the space is still reserved and still reads as "not content", only the animation
 * goes.
 */
@Composable
fun Modifier.effyShimmer(): Modifier {
    val spec = rememberMotionSpec(MotionRole.Press)
    val base = EffySurface.skeleton
    val highlight = EffySurface.tint

    if (!spec.usesScale) return this.background(base)

    val transition = rememberInfiniteTransition(label = "shimmer")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmerSweep",
    )

    return this.drawWithCache {
        // The band travels from off the leading edge to past the trailing one, so it never appears
        // to pop into existence at either end.
        val width = size.width
        val start = (progress * 2f - 0.5f) * width
        val brush = Brush.linearGradient(
            colors = listOf(base, highlight, base),
            start = Offset(start, 0f),
            end = Offset(start + width * 0.6f, size.height),
        )
        onDrawBehind {
            drawRect(base)
            drawRect(brush)
        }
    }
}

// ── Home rails (028) ────────────────────────────────────────────────────────────────────────────

/**
 * Vertical gap between Home's blocks. ONE value, applied by the LazyColumn — so SC-007's "identical
 * gap everywhere" is true by construction rather than by inspection of each call site.
 *
 * ⚠ COMPOSED from two scale steps rather than hardcoded, because the spacing scale jumps 20 → 40 and
 * 24 is the value this screen wants. `xl + xs` keeps every number on this screen traceable to the
 * design-system SSOT; a literal `24.dp` would be the first off-scale spacing value in the app, and
 * the second one would be easy.
 */
val HomeSectionGap = EffySpacing.xl + EffySpacing.xs

/** Horizontal gap between tiles inside a rail. */
val RailItemGap = EffySpacing.md

/**
 * How much of the window ONE rail tile occupies (028 T016, research R4).
 *
 * ⚠ The peek is the whole point. A rail whose last visible tile ends flush at the screen edge reads
 * as a complete set, and a shopper never drags it. At 0.42 a compact window shows two tiles plus a
 * clear sliver of the third, which is the affordance FR-015 asks for.
 *
 * On wider windows the fraction SHRINKS rather than the tile growing. A tablet showing two
 * half-screen-wide products would be a phone layout stretched, which is exactly what FR-046 forbids
 * — more tiles fit instead.
 *
 * Pure, so the sizing rule is unit-testable without a device.
 */
// ⚠ NONE of these may divide into 1.0 evenly. An even divisor fits a whole number of tiles across
// the window, so the row ends FLUSH at the edge with no sliver — and a flush row reads as a complete
// set that nobody drags. `0.20` was the first value here and it is exactly `1/5`; the sizing test
// caught it before any device did.
fun railTileWidthFraction(width: WindowWidth): Float = when (width) {
    WindowWidth.COMPACT -> 0.42f
    WindowWidth.MEDIUM -> 0.28f
    WindowWidth.EXPANDED -> 0.22f
}

/**
 * A product tile sized for a horizontally scrolling rail (028 T018).
 *
 * Reuses [EffyProductCard] wholesale — same imagery treatment, name, price, sale indication,
 * availability and press feedback (FR-022). The rail does not get its own product presentation; a
 * second product tile is how two screens start disagreeing about what a sale looks like.
 *
 * ⚠ `fillHeight = false`. In a rail each tile sizes to its own content, and the row's height is set
 * by the tallest — which is what keeps a section under FR-017's half-viewport ceiling. `fillHeight`
 * is a grid concern (stretching items to a uniform row height) and would fight the ceiling here.
 */
@Composable
fun EffyRailTile(
    product: ProductCard,
    onClick: (String) -> Unit,
    width: Dp,
    modifier: Modifier = Modifier,
    /**
     * Passed straight through to [EffyProductCard]'s image slot (033) — the save control.
     *
     * ⚠ A pass-through, not a second placement. If the rail positioned its own heart, a product in a
     * Home rail and the same product in the search grid would carry the control in two slightly
     * different places, which is precisely the drift this composable's own doc comment warns about.
     */
    imageOverlay: (@Composable BoxScope.() -> Unit)? = null,
) {
    // ⚠ TAKES A RESOLVED Dp, NOT A FRACTION — and this is a bug fix, not a preference.
    //
    // This used to wrap the tile in `BoxWithConstraints` and compute `maxWidth * fraction` here. A
    // LazyRow measures its children with an **unbounded main axis**, so inside a rail item `maxWidth`
    // is effectively infinite: the multiplication stayed infinite, `Modifier.width(...)` bounded
    // nothing, every tile sized to its own text, and the square image plate expanded into a void the
    // height of the screen. On device it looked like the images had failed and the names had lost
    // their wrapping — which is exactly what it was.
    //
    // ⚠ `railTileWidthFraction`'s unit test passed throughout, because it tests the FUNCTION and never
    // that the fraction is applied to a bounded width. The caller resolves the width where constraints
    // are real (the LazyColumn's BoxWithConstraints) and hands a concrete Dp down.
    EffyProductCard(product, onClick, modifier = modifier.width(width), imageOverlay = imageOverlay)
}

/**
 * The width a banner renders at, given the space available (029 T025).
 *
 * ⚠ PURE, so the bound is testable without a device. On a phone the banner takes the full available
 * width; beyond [EffyBanner.maxRenderWidth] it stops growing and is centred instead — otherwise a
 * tablet in landscape gets a promotional slab several hundred dp tall, which is not a banner but a
 * billboard.
 */
fun bannerRenderWidth(available: Dp): Dp =
    if (available <= EffyBanner.maxRenderWidth) available else EffyBanner.maxRenderWidth

/**
 * The scrim laid over banner artwork so the message stays legible.
 *
 * ⚠ FIXED in both appearances, and it is the ramp's darkest step — not a new colour, and not
 * `colorScheme.surface`, which inverts. A photograph does not change between light and dark mode, so
 * neither can the thing that makes type readable over it. Full reasoning on [EffyPromoBanner].
 */
private val BannerScrim = EffyColor.Dark.background

/**
 * A promotional banner (028 T041; shape and legibility rebuilt by 029).
 *
 * ── ⚠ THE RECORDED NO-CARD EXCEPTION ────────────────────────────────────────────────────────────
 *
 * Principle V says do not lay content out in card-style containers. This IS one, and the plan's
 * Complexity Tracking carries the justification: a promotion is a discrete, self-contained, tappable
 * offer that must be separable from the merchandising around it, and constitution v1.11.0 removed
 * every hue from the palette — so **colour is not available as the separator**. A bounded panel is
 * what remains. 029 does not widen that exception; it CONSTRAINS it, by fixing the shape.
 *
 * ── ⚠ WHY NOTHING IS EVER CROPPED ───────────────────────────────────────────────────────────────
 *
 * The box is locked to [EffyBanner.ratio] and conformant artwork shares it, so the scale is uniform
 * and **no cropping occurs at all**. FR-013's "fill without stretching, crop only outside the safe
 * area" sounds like it needs crop arithmetic; locking both ends removes the case entirely. That is
 * also why the server-side conformance check matters more than anything in this function — if
 * non-conformant artwork ever reached here, this is where it would show.
 *
 * ── ⚠ THE SCRIM IS DOING ALL THE WORK ───────────────────────────────────────────────────────────
 *
 * The message is LIVE TEXT over the artwork (FR-031), which keeps it legible at any text size and
 * readable by a screen reader — but it also means the platform is responsible for contrast over an
 * image it has never seen. 028 used a flat 72% fill across the whole banner: that works, and washes
 * out the entire photograph. This is a GRADIENT — opaque where the type is, clear where it is not —
 * so the artwork survives and the type stays readable.
 *
 * ── ⚠ WHY THE SCRIM DOES NOT FOLLOW THE APPEARANCE ──────────────────────────────────────────────
 *
 * It used to. The scrim was `colorScheme.surface`, so in light mode it was a WHITE wash — and that
 * was wrong twice over. It washed the photograph pale, and it left dark type sitting on a
 * semi-transparent white film over a busy image, which is the worst contrast case there is: the
 * effective background under each glyph is whatever the photo happens to be doing there.
 *
 * The artwork is the SAME PICTURE in light and dark mode. So the treatment that makes type legible
 * over it cannot be the one thing on the screen that inverts. Over artwork the scrim is therefore
 * **fixed dark with fixed light type, in both appearances** — the standard for text over
 * photography, and the only version whose contrast can be reasoned about at all, because the darkest
 * step of the ramp at 92% is a known quantity and a stranger's photograph is not.
 *
 * ⚠ Both fixed values are ramp steps ([EffyColor.Dark]), not new colours — this stays inside the
 * monochrome palette. With NO artwork there is nothing to be legible over, so the panel keeps the
 * theme's own colours and does follow the appearance.
 *
 * ⚠ There is no hue to separate text from picture. If a banner reads badly on device the fix is more
 * contrast within the neutral ramp, **never a colour** — that would fail `check-no-emerald.sh` and
 * violate Principle V.
 */
@Composable
fun EffyPromoBanner(
    title: String,
    subtitle: String?,
    terms: String?,
    code: String?,
    imageUrl: String?,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    // Over artwork the treatment is fixed; with no artwork it follows the theme. See the note above.
    val overArtwork = imageUrl != null
    val titleColor =
        if (overArtwork) EffyColor.Dark.foreground else MaterialTheme.colorScheme.onSurface
    val supportColor =
        if (overArtwork) EffyColor.Dark.mutedForeground else MaterialTheme.colorScheme.onSurfaceVariant
    val chipOutline =
        if (overArtwork) EffyColor.Dark.mutedForeground else MaterialTheme.colorScheme.outline

    BoxWithConstraints(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val width = bannerRenderWidth(maxWidth)

        Box(
            modifier = Modifier
                .width(width)
                // ⚠ The ratio is applied BEFORE anything is drawn, so the box has its final height
                // from the first frame — nothing below shifts when the artwork lands (FR-016/SC-005).
                .aspectRatio(EffyBanner.ratio)
                .clip(RoundedCornerShape(EffyRadius.md))
                .background(EffySurface.tint)
                // ⚠ Null onClick = NOT TAPPABLE — the designed response to a target the app does not
                // understand. A tap that does nothing is worse than no tap.
                .then(
                    if (onClick != null) {
                        Modifier.clickable(onClickLabel = title, onClick = onClick)
                    } else {
                        Modifier
                    },
                ),
        ) {
            if (imageUrl != null) {
                // The TITLE is the accessible name, not the artwork — the banner's meaning is its
                // text, and describing the picture too would make a screen reader say it twice.
                ProductImage(imageUrl, title, modifier = Modifier.matchParentSize())

                // ⚠ VERTICAL, not diagonal — and that is a fix, not a preference.
                //
                // The scrim was a bottom-left→top-right diagonal, which put its WEAKEST point exactly
                // where the type needs it most. The text column is bottom-anchored and stacks title
                // FIRST, so the title is its topmost line: with a subtitle, a terms line and a code
                // chip below it, the largest and most important text sits ~50% up the banner, where
                // the diagonal had already faded to near nothing.
                //
                // A vertical ramp matches the shape of what it is protecting — the text zone is a
                // full-width band across the bottom (`banner-canvas.json` marks it 50% tall, inset 6%
                // from the bottom), so the scrim covers that band uniformly and leaves the top third
                // of the photograph untouched.
                Box(
                    modifier = Modifier.matchParentSize().background(
                        Brush.verticalGradient(
                            colorStops = arrayOf(
                                0.00f to BannerScrim.copy(alpha = 0.00f),
                                0.28f to BannerScrim.copy(alpha = 0.20f),
                                0.50f to BannerScrim.copy(alpha = 0.62f),
                                0.75f to BannerScrim.copy(alpha = 0.85f),
                                1.00f to BannerScrim.copy(alpha = 0.92f),
                            ),
                        ),
                    ),
                )
            }

            // The text zone, positioned from the SAME constants the operator's template marks — so
            // the region they were told to keep quiet is exactly the region covered here.
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth(EffyBanner.textWidth)
                    .padding(
                        start = width * EffyBanner.textInsetLeft,
                        bottom = width / EffyBanner.ratio * EffyBanner.textInsetBottom,
                        end = EffySpacing.s,
                    ),
                verticalArrangement = Arrangement.Bottom,
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = titleColor,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        modifier = Modifier.padding(top = EffySpacing.xs),
                        style = MaterialTheme.typography.bodySmall,
                        color = supportColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!terms.isNullOrBlank()) {
                    // FR-037d: a condition reaches the shopper here, not first at payment.
                    Text(
                        terms,
                        modifier = Modifier.padding(top = EffySpacing.xs),
                        style = MaterialTheme.typography.labelSmall,
                        color = supportColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (!code.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .padding(top = EffySpacing.s)
                            .clip(RoundedCornerShape(EffyRadius.sm))
                            .border(1.dp, chipOutline, RoundedCornerShape(EffyRadius.sm))
                            .padding(horizontal = EffySpacing.s, vertical = 2.dp),
                    ) {
                        Text(
                            code,
                            style = MaterialTheme.typography.labelMedium.copy(
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.08.em,
                            ),
                            color = titleColor,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/**
 * One category shortcut: an icon above a label (028 T030).
 *
 * ── ⚠ NO CONTAINER, NO BORDER, NO FILL ──────────────────────────────────────────────────────────
 *
 * This is Principle V's "no card layouts" doctrine being FOLLOWED, not excepted. The obvious thing
 * to build here is a tile — a bordered box with an icon in it — and the doctrine exists precisely to
 * stop that reflex. A labelled glyph in a row is not a card, and it does not need to become one to
 * be tappable.
 *
 * The whole target is [EffyMinTouchTarget] tall at minimum, so the tap area is the shortcut rather
 * than the 24dp glyph inside it.
 */
@Composable
fun EffyCategoryShortcut(
    label: String,
    icon: DrawableResource,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .widthIn(min = 64.dp, max = 88.dp)
            .clip(RoundedCornerShape(EffyRadius.sm))
            .clickable(onClickLabel = label, onClick = onClick)
            .padding(vertical = EffySpacing.s, horizontal = EffySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The tint disc is a SHAPE the glyph sits on, not a container around content — it gives the
        // icon a consistent optical weight when one glyph is dense and the next is sparse.
        Box(
            modifier = Modifier.size(52.dp).clip(CircleShape).background(EffySurface.tint),
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(26.dp))
        }
        Text(
            label,
            modifier = Modifier.padding(top = EffySpacing.s),
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Home's loading state — the SHAPE of the screen that is coming (FR-041).
 *
 * ── ⚠ WHAT WAS WRONG ────────────────────────────────────────────────────────────────────────────
 *
 * The first version laid its rail tiles out with `fillMaxWidth(0.42f)` inside a `Row`. Fractions in a
 * Row COMPOUND: the first child took 42% of the row, and the second took 42% of what was left. So the
 * placeholder showed one large tile beside one small one — a shape no real rail has ever had — and
 * stopped well short of the trailing edge, leaving dead white where the content would be.
 *
 * A skeleton whose proportions do not match the content is worse than no skeleton. The shopper reads
 * it as the layout, and then the layout changes under them.
 *
 * This now mirrors [EffyRailTile] and the real section header exactly: the same tile width, the same
 * gaps, the same "See all" on the right, and enough tiles to run off the trailing edge so the peek is
 * there before the products are.
 */
@Composable
fun EffyHomeSkeleton(modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        // ⚠ Resolved from the REAL constraints, exactly as HomeBlockList does. The placeholder and
        // the content must agree about tile width or the screen jumps when the data lands.
        val tileWidth = maxWidth * railTileWidthFraction(widthClassFor(maxWidth))

        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(HomeSectionGap),
        ) {
            CategoryRowSkeleton()

            // THREE sections, not two — two left a band of empty page below the fold on a tall
            // phone, which is the "lots of white space" a skeleton exists to prevent.
            repeat(3) {
                Column {
                    SectionHeaderSkeleton()
                    RailSkeleton(tileWidth)
                }
            }
        }
    }
}

/**
 * Matches [EffyCategoryShortcut]: a 52dp disc with a label beneath.
 *
 * ⚠ A **LazyRow**, like the real category row — not a plain Row. See [RailSkeleton] for why that
 * distinction is load-bearing rather than stylistic.
 */
@Composable
private fun CategoryRowSkeleton() {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        contentPadding = PaddingValues(horizontal = EffySpacing.md),
        userScrollEnabled = false,
    ) {
        items(6) {
            Column(
                modifier = Modifier.width(72.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                EffySkeletonBlock(Modifier.size(52.dp), radius = EffyRadius.default)
                EffySkeletonBlock(
                    Modifier.padding(top = EffySpacing.s).width(44.dp).height(11.dp),
                    radius = EffyRadius.sm,
                )
            }
        }
    }
}

/** Matches [EffySectionHeader] — a title on the left AND a "See all" on the right. */
@Composable
private fun SectionHeaderSkeleton() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EffySkeletonBlock(Modifier.width(132.dp).height(24.dp), radius = EffyRadius.sm)
        EffySkeletonBlock(Modifier.width(56.dp).height(16.dp), radius = EffyRadius.sm)
    }
}

/**
 * Matches a real rail: tiles at the resolved width, the real gap, and one running off the edge.
 *
 * ── ⚠ WHY THIS IS A LazyRow AND NOT A Row ───────────────────────────────────────────────────────
 *
 * A `Row` allocates its width SEQUENTIALLY: each child is measured with `maxWidth = whatever is
 * left`, and `Modifier.width(164.dp)` is **coerced into that remaining space** rather than honoured.
 * So the first tile got its full width, the second got the remainder, the third got scraps — and
 * `aspectRatio(1f)` then resolved those wrong widths into wrong heights. Two attempts at this file
 * fought that with fractions and then with `clipToBounds()`; neither could work, because the tiles
 * were already mis-measured before anything was clipped.
 *
 * A `LazyRow` measures children with an **unbounded main axis**, so `width(tileWidth)` is exact —
 * and it clips at the viewport by itself, which is what produces the peek.
 *
 * The deeper rule: **a skeleton should use the same layout primitives as the content it stands in
 * for.** Then it cannot diverge from the thing it is imitating, which is the only job it has.
 */
@Composable
private fun RailSkeleton(tileWidth: Dp) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(top = EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(RailItemGap),
        contentPadding = PaddingValues(horizontal = EffySpacing.lg),
        // Not scrollable: it is a placeholder, and a shopper dragging it would be interacting with
        // nothing. It still lays out and clips exactly as the real rail does.
        userScrollEnabled = false,
    ) {
        items(4) {
            EffyProductCardSkeleton(Modifier.width(tileWidth))
        }
    }
}

/** A product-tile-shaped skeleton, so a loading grid has the proportions of the grid that replaces it. */

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
