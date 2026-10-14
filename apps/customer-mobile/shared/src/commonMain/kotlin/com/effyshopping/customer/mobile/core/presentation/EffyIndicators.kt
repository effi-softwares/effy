package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.effyshopping.customer.mobile.core.theme.EffyRoles
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_minus
import com.effyshopping.customer.mobile.resources.lucide_plus
import com.effyshopping.customer.mobile.resources.lucide_triangle_alert
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.DrawableResource
import org.jetbrains.compose.resources.painterResource

/** An icon in a 48dp target (fields, headers, rows). */
@Composable
fun EffyIconButton(
    icon: DrawableResource,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconSize: Dp = 22.dp,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    enabled: Boolean = true,
) {
    val interactions = remember { MutableInteractionSource() }
    Box(
        modifier = modifier
            .size(EffySize.target)
            .effyPress(interactions, 0.9f)
            .clip(CircleShape)
            .clickable(enabled = enabled, interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = contentDescription, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(icon), contentDescription = contentDescription, tint = if (enabled) tint else EffyDisabled.label, modifier = Modifier.size(iconSize))
    }
}

/**
 * The quantity stepper — Lucide minus / plus in 48dp targets, the count rolling between them.
 *
 * [primary] fills it blue with white glyphs (the product tile's stepper, Product card board);
 * otherwise it is the zinc pill-less control on the cart and product page. 6dp corners.
 */
@Composable
fun EffyQuantityStepper(
    quantity: Int,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
    minimum: Int = 1,
    maximum: Int = 99,
    primary: Boolean = false,
    /** White, for a stepper drawn inside a border (the product page's buy bar). */
    outlined: Boolean = false,
    /** Below the minimum the decrease button removes — say so to a screen reader. */
    decreaseLabel: String = "Decrease quantity",
) {
    val tick = EffyHaptics.tick()
    val fill = when {
        primary -> MaterialTheme.colorScheme.primary
        outlined -> MaterialTheme.colorScheme.background
        else -> EffySurface.tint
    }
    val fg = if (primary) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = modifier
            .height(EffySize.target)
            .clip(EffyStorefrontShape.control)
            .background(fill),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StepperButton(Res.drawable.lucide_minus, decreaseLabel, quantity > minimum, fg) { tick(); onChange(quantity - 1) }
        EffyNumberRoll(
            "$quantity",
            modifier = Modifier.widthIn(min = 28.dp),
            style = MaterialTheme.typography.titleSmall.copy(fontFeatureSettings = "tnum", textAlign = TextAlign.Center),
            color = fg,
        )
        StepperButton(Res.drawable.lucide_plus, "Increase quantity", quantity < maximum, fg) { tick(); onChange(quantity + 1) }
    }
}

@Composable
private fun StepperButton(icon: DrawableResource, label: String, enabled: Boolean, tint: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(EffySize.target)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painterResource(icon),
            contentDescription = label,
            tint = if (enabled) tint else tint.copy(alpha = 0.35f),
            modifier = Modifier.size(18.dp),
        )
    }
}

/** A count badge — Effy blue, white figures, a 2dp white ring, "99+" above 99. */
@Composable
fun EffyBadge(count: Int, modifier: Modifier = Modifier) {
    if (count <= 0) return
    Box(
        modifier = modifier
            .heightIn(min = 20.dp)
            .widthIn(min = 20.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.background)
            .padding(2.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary)
            .padding(horizontal = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (count > 99) "99+" else "$count",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"),
            color = MaterialTheme.colorScheme.onPrimary,
        )
    }
}

/** What a status pill says about where something is. The closed mapping (Orders, Order boards). */
enum class EffyStatusKind {
    /** Paid, delivered — Effy green on its tint. */
    Done,
    /** Being packed, on the way — Effy blue on its tint. */
    InProgress,
    /** Something went wrong — black on zinc, with an alert icon (no red). */
    Problem,
    /** Cancelled, refunded, inert — muted. */
    Inert,
}

/** A status pill — the one round lozenge, around a word. */
@Composable
fun EffyStatusPill(text: String, kind: EffyStatusKind, modifier: Modifier = Modifier) {
    val (bg, fg) = when (kind) {
        EffyStatusKind.Done -> EffyRoles.brandMuted to EffyRoles.brand
        EffyStatusKind.InProgress -> EffyRoles.primaryMuted to MaterialTheme.colorScheme.primary
        EffyStatusKind.Problem -> EffySurface.tint to MaterialTheme.colorScheme.onSurface
        EffyStatusKind.Inert -> EffySurface.tint to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        modifier = modifier.clip(CircleShape).background(bg).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (kind == EffyStatusKind.Problem) {
            Icon(painterResource(Res.drawable.lucide_triangle_alert), contentDescription = null, tint = fg, modifier = Modifier.size(12.dp))
        } else {
            Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
        }
        Text(text, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = fg)
    }
}

/**
 * A storefront CARD — white, 1dp hairline, 8dp corners, the hairline `shadow-xs` (constitution
 * v3.3.0: on the storefront, card layouts are the pattern — an address, a delivery choice, a summary).
 * [selected] draws the blue edge and light-blue tint of a chosen card.
 */
@Composable
fun EffyCard(
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    onClick: (() -> Unit)? = null,
    padding: Dp = EffySpacing.lg,
    content: @Composable ColumnScope.() -> Unit,
) {
    val interactions = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.effyPress(interactions, 0.99f) else Modifier)
            .shadow(1.dp, EffyStorefrontShape.card, ambientColor = Color.Black.copy(alpha = 0.05f), spotColor = Color.Black.copy(alpha = 0.05f))
            .clip(EffyStorefrontShape.card)
            .background(if (selected) EffyRoles.primaryMuted else MaterialTheme.colorScheme.background)
            .border(
                if (selected) 2.dp else 1.dp,
                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                EffyStorefrontShape.card,
            )
            .then(
                if (onClick != null) Modifier.clickable(interactionSource = interactions, indication = null, role = Role.Button, onClick = onClick)
                else Modifier,
            )
            .padding(padding),
        content = content,
    )
}

/** "Sale" — the green badge on a product (Product card board). */
@Composable
fun EffySaleBadge(modifier: Modifier = Modifier, text: String = "Sale") {
    Box(
        modifier = modifier
            .clip(EffyStorefrontShape.small)
            .background(EffyRoles.brand)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = EffyRoles.brandForeground)
    }
}

/** "25% off" — the saving, said in Effy green beside the struck price. */
@Composable
fun DiscountChip(percentOff: Int, modifier: Modifier = Modifier) {
    Text(
        "$percentOff% off",
        modifier = modifier,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = EffyRoles.brand,
    )
}

/** A circle with an icon in it — empty states, confirm sheets (Patterns board). */
@Composable
fun EffyIconChip(icon: DrawableResource, modifier: Modifier = Modifier, size: Dp = 56.dp) {
    Box(
        modifier = modifier.size(size).clip(CircleShape).background(EffySurface.tint),
        contentAlignment = Alignment.Center,
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(size * 0.45f))
    }
}

/** A tinted info panel — light blue with a primary icon, or green for good news. */
@Composable
fun EffyNotice(
    text: String,
    modifier: Modifier = Modifier,
    icon: DrawableResource? = null,
    positive: Boolean = false,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(EffyStorefrontShape.card)
            .background(if (positive) EffyRoles.brandMuted else EffyRoles.primaryMuted)
            .padding(EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        verticalAlignment = Alignment.Top,
    ) {
        if (icon != null) {
            Icon(
                painterResource(icon),
                contentDescription = null,
                tint = if (positive) EffyRoles.brand else MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 1.dp).size(18.dp),
            )
        }
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

/**
 * The success tick on Order confirmed (Motion board): a green circle whose check DRAWS itself over
 * 600ms, with a success haptic. Under reduced motion the tick is simply there.
 */
@Composable
fun EffySuccessTick(modifier: Modifier = Modifier, size: Dp = 72.dp) {
    val full = effyMotionFull()
    val progress = remember { androidx.compose.animation.core.Animatable(if (full) 0f else 1f) }
    val success = EffyHaptics.success()
    androidx.compose.runtime.LaunchedEffect(Unit) {
        success()
        if (full) progress.animateTo(1f, androidx.compose.animation.core.tween(600, easing = EffyStorefrontMotion.IosEase))
    }
    val green = EffyRoles.brand
    val tint = EffyRoles.brandMuted
    androidx.compose.foundation.Canvas(modifier = modifier.size(size)) {
        drawCircle(tint)
        val p = androidx.compose.ui.graphics.Path().apply {
            moveTo(this@Canvas.size.width * 0.30f, this@Canvas.size.height * 0.52f)
            lineTo(this@Canvas.size.width * 0.44f, this@Canvas.size.height * 0.66f)
            lineTo(this@Canvas.size.width * 0.71f, this@Canvas.size.height * 0.38f)
        }
        val measure = androidx.compose.ui.graphics.PathMeasure().apply { setPath(p, false) }
        val partial = androidx.compose.ui.graphics.Path()
        measure.getSegment(0f, measure.length * progress.value, partial, true)
        drawPath(
            partial,
            green,
            style = androidx.compose.ui.graphics.drawscope.Stroke(
                width = this.size.width * 0.07f,
                cap = androidx.compose.ui.graphics.StrokeCap.Round,
                join = androidx.compose.ui.graphics.StrokeJoin.Round,
            ),
        )
    }
}
