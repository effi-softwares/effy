package com.effyshopping.customer.mobile.core.observability

import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.AnimatedVisibility
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.customer.mobile.core.presentation.effyDuration
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.presentation.EffySecondaryButton
import com.effyshopping.customer.mobile.core.presentation.EffyCard
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton

/**
 * The customer analytics-consent affordance. A non-blocking bottom banner shown only
 * when consent is [ConsentState.unknown]; the shopper can use the app normally behind it.
 *
 * NO analytics SDK loads until [onAccept] (Principle VII). [onDecline] records the refusal so the
 * banner never reappears and nothing is ever collected. Both persist via [ConsentStore] and re-render
 * the shell. Crash reporting is unaffected (Q1). Copy carries no claim beyond "anonymous".
 */
@Composable
fun AnalyticsConsentBanner(
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // 087 (Patterns board): a floating card at the bottom with two equal buttons — declining must be
    // as easy as accepting (the old layout made "Allow" full-width and "No thanks" a small text link).
    // It slides up on arrival (fades under reduced motion).
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    AnimatedVisibility(
        visible = shown,
        enter = slideInVertically(tween(effyDuration(EffyStorefrontMotion.EmphasisedMillis))) { it } + fadeIn(),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(EffySpacing.lg)) {
            EffyCard {
                Text("Help improve Effy", style = MaterialTheme.typography.titleSmall)
                Text(
                    "We use privacy-friendly analytics to make the app better. No personal data is " +
                        "collected — you can change this any time in Account.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
                ) {
                    EffySecondaryButton("No thanks", onClick = onDecline, modifier = Modifier.weight(1f))
                    EffyPrimaryButton(label = "Allow", onClick = onAccept, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/**
 * A persistent opt-in/out toggle for the Account screen — the customer's way back after a
 * decline, and the standing control. Reads/writes the same [ConsentState].
 */
@Composable
fun analyticsConsentSubtitle(state: ConsentState): String = when (state) {
    ConsentState.GRANTED -> "On — anonymous usage data is shared"
    ConsentState.DENIED -> "Off"
    ConsentState.UNKNOWN -> "Off"
}
