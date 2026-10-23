package com.effyshopping.customer.mobile.core.presentation

import androidx.compose.foundation.layout.Box
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_check
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * The snackbar host — one per screen, at the bottom, above the tab bar or pinned bar (Patterns board:
 * "one action at most, above the tab bar"). Place it last in a `Box` with `Alignment.BottomCenter`.
 *
 * The snackbar is the storefront toast: white, hairline border, soft shadow, a check icon, the message,
 * and at most one blue action ("Undo"). It slides up on arrival (fades under reduced motion).
 */
@Composable
fun EffySnackbarHost(hostState: SnackbarHostState, modifier: Modifier = Modifier) {
    // The padding belongs to the snackbar, never the host: an empty host must take no space. With
    // the padding on the host it reserved 24dp under every header even with no message showing.
    SnackbarHost(hostState = hostState, modifier = modifier.fillMaxWidth()) { data ->
        Box(Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md)) { EffySnackbar(data) }
    }
}

@Composable
private fun EffySnackbar(data: SnackbarData) {
    val full = effyMotionFull()
    AnimatedVisibility(
        visibleState = androidx.compose.runtime.remember { androidx.compose.animation.core.MutableTransitionState(false).apply { targetState = true } },
        enter = if (full) slideInVertically(tween(EffyStorefrontMotion.StandardMillis)) { it } + fadeIn() else fadeIn(tween(EffyStorefrontMotion.ReducedFadeMillis)),
        exit = if (full) slideOutVertically { it } + fadeOut() else fadeOut(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .shadow(10.dp, EffyStorefrontShape.card, ambientColor = Color.Black.copy(alpha = 0.1f), spotColor = Color.Black.copy(alpha = 0.1f))
                .clip(EffyStorefrontShape.card)
                .background(MaterialTheme.colorScheme.background)
                .border(1.dp, MaterialTheme.colorScheme.outline, EffyStorefrontShape.card)
                .padding(start = EffySpacing.lg, end = EffySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Icon(painterResource(Res.drawable.lucide_check), contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
            Text(
                data.visuals.message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f).padding(vertical = EffySpacing.md),
            )
            val action = data.visuals.actionLabel
            if (action != null) {
                EffyTextLink(action, onClick = { data.performAction() })
            }
        }
    }
}
