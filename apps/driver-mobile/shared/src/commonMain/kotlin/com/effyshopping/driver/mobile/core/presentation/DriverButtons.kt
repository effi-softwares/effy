package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import org.jetbrains.compose.resources.DrawableResource

/** How a button looks (the canvas's component sheet). */
enum class DriverButtonStyle {
    /** Effy blue — the one next action on a screen. */
    Primary,
    /** Bordered — a second action beside the primary. */
    Outline,
    /** No border — a quiet action ("Back to the run"). */
    Ghost,
    /** Black — a problem or a destructive action. ⚠ Never red (v3.5.0). */
    Problem,
}

/**
 * The driver app's button. [style] picks the look; [tall] is the 56 dp primary height for an action
 * pinned at the bottom, otherwise 52 dp.
 */
@Composable
fun DriverButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: DriverButtonStyle = DriverButtonStyle.Primary,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: DrawableResource? = null,
    trailingIcon: DrawableResource? = null,
    tall: Boolean = true,
) {
    val scheme = MaterialTheme.colorScheme
    val (fill, fg) = when {
        !enabled -> scheme.surfaceVariant to scheme.onSurfaceVariant
        style == DriverButtonStyle.Primary -> scheme.primary to scheme.onPrimary
        style == DriverButtonStyle.Problem -> scheme.onSurface to scheme.surface
        else -> Color.Transparent to scheme.onSurface
    }
    val shape = EffyStorefrontShape.card
    Row(
        modifier = modifier
            .heightIn(min = if (tall) DriverSize.primary else DriverSize.secondary)
            .clip(shape)
            .background(fill)
            .then(if (style == DriverButtonStyle.Outline) Modifier.border(1.dp, scheme.outline, shape) else Modifier)
            .clickable(enabled = enabled && !loading, role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = fg, strokeWidth = 2.dp)
        } else if (icon != null) {
            DriverIcon(icon, tint = fg, size = 18.dp)
        }
        Text(label, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), color = fg, maxLines = 1)
        if (trailingIcon != null && !loading) DriverIcon(trailingIcon, tint = fg, size = 18.dp)
    }
}

/**
 * The bar the next action sits in, pinned to the bottom of a screen above the home indicator, with a
 * hairline above it (the canvas's `ef-actionbar`).
 */
@Composable
fun DriverActionBar(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background)) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = DriverSize.gutter, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content,
        )
    }
}
