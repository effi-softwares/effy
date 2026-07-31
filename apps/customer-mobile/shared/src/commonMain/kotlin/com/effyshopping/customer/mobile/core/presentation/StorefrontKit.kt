package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.nav.LocalNavBack
import com.effyshopping.customer.mobile.design.EffyColor
import com.effyshopping.customer.mobile.features.catalog.domain.ProductCard
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.customer.mobile.resources.ic_orders_outlined
import com.effyshopping.mobile.design.EffyRadius
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.mobile.kit.ui.MotionRole
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.rememberMotionSpec
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

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
            TextButton(onClick = onSeeAll) { Text("See all") }
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
        Text(
            label,
            style = MaterialTheme.typography.titleSmall,
            color = if (enabled) MaterialTheme.colorScheme.onSurface else EffyDisabled.label,
        )
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
    label: String,
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
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(bottom = EffySpacing.s),
        )
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
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
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

// ── Home rails (028) ────────────────────────────────────────────────────────────────────────────

/** Vertical gap between Home's blocks. ONE value, applied by the LazyColumn — so SC-007's "identical
 *  gap everywhere" is true by construction rather than by inspection of each call site. */
val HomeSectionGap = EffySpacing.xl

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
    widthFraction: Float,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier) {
        // The fraction is of the WINDOW, resolved here so the caller passes intent rather than dp.
        EffyProductCard(product, onClick, modifier = Modifier.width(maxWidth * widthFraction))
    }
}

/**
 * A promotional banner (028 T041).
 *
 * ── ⚠ THE RECORDED NO-CARD EXCEPTION ────────────────────────────────────────────────────────────
 *
 * Principle V says do not lay content out in card-style containers. This IS one, and the plan's
 * Complexity Tracking carries the justification: a promotion is a discrete, self-contained, tappable
 * offer that has to be separable from the merchandising around it, and constitution v1.11.0 removed
 * every hue from the palette — so **colour is not available as the separator**. A bounded panel is
 * what remains.
 *
 * ── ⚠ AND THIS IS THE HARD PART OF THE WHOLE FEATURE ────────────────────────────────────────────
 *
 * A promotional banner conventionally works by being the loudest thing on the page. That instrument
 * is gone. What is left is **scale, weight and negative space**, which is why this is wide and short
 * with generous padding rather than tall and busy.
 *
 * If it reads too quietly on a device, the fix is more contrast WITHIN the neutral ramp — never a new
 * colour. A colour here would fail `check-no-emerald.sh` and violate Principle V; it is a
 * constitution violation, not a design choice.
 *
 * Text is REAL TEXT, never baked into [imageUrl] (FR-033) — image-baked copy is illegible at small
 * sizes and invisible to a screen reader. Artwork sits behind a scrim that guarantees contrast.
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
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(EffyRadius.md))
            .background(EffySurface.tint)
            // ⚠ Null onClick = NOT TAPPABLE. That is the designed response to an unrecognised target
            // (research R7): a tap that does nothing is worse than no tap.
            .then(if (onClick != null) Modifier.clickable(onClickLabel = title, onClick = onClick) else Modifier),
    ) {
        if (imageUrl != null) {
            // The TITLE is the accessible name, not the artwork — the banner's meaning is its text
            // (FR-033), and describing the picture as well would make a screen reader say it twice.
            ProductImage(imageUrl, title, modifier = Modifier.matchParentSize())
            // The scrim is what lets real text sit over arbitrary artwork and stay legible. Without
            // it a light photograph and light text produce an unreadable banner, and nobody notices
            // until an operator uploads one.
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.72f)),
            )
        }

        Column(modifier = Modifier.padding(EffySpacing.lg)) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    modifier = Modifier.padding(top = EffySpacing.xs),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (!terms.isNullOrBlank()) {
                // FR-037d: a condition must reach the shopper here, not first at payment.
                Text(
                    terms,
                    modifier = Modifier.padding(top = EffySpacing.xs),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (!code.isNullOrBlank()) {
                Box(
                    modifier = Modifier
                        .padding(top = EffySpacing.md)
                        .clip(RoundedCornerShape(EffyRadius.sm))
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(EffyRadius.sm))
                        .padding(horizontal = EffySpacing.md, vertical = EffySpacing.xs),
                ) {
                    Text(
                        code,
                        style = MaterialTheme.typography.labelLarge.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.08.em,
                        ),
                    )
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

/** A rail-shaped skeleton — the section that is coming, not a bare spinner (FR-041). */
@Composable
fun EffyHomeSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(HomeSectionGap),
    ) {
        // The category row.
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            repeat(4) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    EffySkeletonBlock(Modifier.size(56.dp), radius = EffyRadius.md)
                    EffySkeletonBlock(
                        Modifier.padding(top = EffySpacing.s).width(44.dp).height(12.dp),
                        radius = EffyRadius.sm,
                    )
                }
            }
        }

        // Two sections' worth of header + rail.
        repeat(2) {
            Column {
                EffySkeletonBlock(
                    Modifier.padding(horizontal = EffySpacing.lg).width(140.dp).height(22.dp),
                    radius = EffyRadius.sm,
                )
                Row(
                    modifier = Modifier
                        .padding(top = EffySpacing.md)
                        .padding(horizontal = EffySpacing.lg)
                        .fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(RailItemGap),
                ) {
                    repeat(2) {
                        EffyProductCardSkeleton(Modifier.fillMaxWidth(0.42f))
                    }
                }
            }
        }
    }
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
