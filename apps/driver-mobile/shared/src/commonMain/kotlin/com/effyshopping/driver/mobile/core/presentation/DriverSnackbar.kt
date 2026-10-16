package com.effyshopping.driver.mobile.core.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.design.EffyStorefrontShape
import kotlinx.coroutines.delay

/** What a snackbar says, and its one optional action ("Undo"). */
data class DriverSnack(val message: String, val actionLabel: String? = null, val onAction: (() -> Unit)? = null)

/**
 * A short confirmation at the bottom ("Delivered · 2 left", "Collected"). Inverse surface — ink on the
 * light theme, paper on the dark one — so it reads over any screen. It dismisses itself after
 * [durationMillis] (3 s when it carries Undo, as the canvas's auto-complete bar).
 */
@Composable
fun DriverSnackbar(
    snack: DriverSnack?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    durationMillis: Long = if (snack?.actionLabel != null) 3_000 else 2_500,
) {
    LaunchedEffect(snack) {
        if (snack != null) {
            delay(durationMillis)
            onDismiss()
        }
    }
    AnimatedVisibility(
        visible = snack != null,
        enter = fadeIn() + slideInVertically { it / 2 },
        exit = fadeOut() + slideOutVertically { it / 2 },
        modifier = modifier,
    ) {
        val s = snack ?: return@AnimatedVisibility
        val scheme = MaterialTheme.colorScheme
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .clip(EffyStorefrontShape.card)
                .background(scheme.inverseSurface)
                .heightIn(min = 52.dp)
                .padding(start = 16.dp, end = 4.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(s.message, color = scheme.inverseOnSurface, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f).padding(vertical = 12.dp))
            if (s.actionLabel != null && s.onAction != null) {
                Text(
                    s.actionLabel,
                    color = scheme.inverseOnSurface, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier
                        .heightIn(min = DriverSize.target)
                        .clickable(role = Role.Button) { s.onAction.invoke(); onDismiss() }
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                )
            }
        }
    }
}
