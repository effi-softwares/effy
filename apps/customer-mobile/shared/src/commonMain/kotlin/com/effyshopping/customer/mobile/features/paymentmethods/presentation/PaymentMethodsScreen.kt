package com.effyshopping.customer.mobile.features.paymentmethods.presentation

import org.jetbrains.compose.resources.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.PaddingValues
import com.effyshopping.customer.mobile.resources.lucide_lock
import com.effyshopping.customer.mobile.resources.lucide_credit_card
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.core.presentation.EffyTextLink
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.core.presentation.EffyConfirmSheet
import com.effyshopping.customer.mobile.core.presentation.EffyNotice
import com.effyshopping.customer.mobile.core.presentation.EffyGroupDivider
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyEmptyState
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.features.paymentmethods.domain.KeptCard
import com.effyshopping.mobile.design.EffySpacing

/**
 * Payment methods: the cards a shopper kept, as rows beside the address book, so a card can be removed
 * without starting a checkout.
 */
@Composable
fun PaymentMethodsScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel {
        PaymentMethodsViewModel(container.listPaymentMethods, container.removePaymentMethod)
    }
    val state by vm.state.collectAsStateWithLifecycle()

    // 087 (PaymentMethods board): a pushed page with Back (it had none - FR-029). Removing a card
    // asks first, in a sheet.
    var confirming by remember { mutableStateOf<KeptCard?>(null) }
    Column(Modifier.fillMaxSize()) {
        EffyAppBar(title = "Payment methods")
        when {
            state.loading -> CardsSkeleton()

            // A failed read is not an empty list.
            state.loadFailed -> EffyErrorState(
                title = "We couldn't load your saved cards",
                body = "This doesn't affect them. Check your connection and try again.",
                onRetry = vm::load,
            )

            // An honest empty state that explains, with no dead controls (US6 scenario 4).
            state.cards.isEmpty() -> EffyEmptyState(
                title = "No saved cards",
                body = "When you pay, you can choose to save your card for next time - it will appear here.",
                icon = Res.drawable.lucide_credit_card,
            )

            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(EffySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                state.error?.let { message -> item(key = "error") { EffyInlineError(message) } }
                item(key = "cards") {
                    EffyGroup {
                        state.cards.forEachIndexed { index, card ->
                            CardRow(card = card, removing = state.removing == card.id, onRemove = { confirming = card })
                            if (index < state.cards.lastIndex) EffyGroupDivider()
                        }
                    }
                }
                item(key = "note") {
                    EffyNotice(
                        "Effy never sees or stores your card number - only the last four digits, so you can tell your cards apart.",
                        icon = Res.drawable.lucide_lock,
                    )
                }
            }
        }
    }

    confirming?.let { card ->
        EffyConfirmSheet(
            title = "Remove this card?",
            body = "${brandName(card.brand)} ending ${card.last4} won't be offered at checkout any more. You can save it again next time you pay.",
            confirmLabel = "Remove card",
            icon = Res.drawable.lucide_credit_card,
            destructive = true,
            onConfirm = {
                confirming = null
                vm.remove(card.id)
            },
            onDismiss = { confirming = null },
        )
    }
}

/** The kept cards before they read: the same group, rows laid out as [CardRow] lays them out. */
@Composable
private fun CardsSkeleton() {
    val type = MaterialTheme.typography
    EffyLoading(Modifier.fillMaxSize(), label = "Loading your cards") {
        Column(Modifier.fillMaxSize().padding(EffySpacing.lg)) {
            EffyGroup {
                repeat(2) { i ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = EffySize.rowWithSubtitle).padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
                        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        EffySkeletonBlock(Modifier.size(22.dp), radius = 4.dp)
                        Column(Modifier.weight(1f)) {
                            EffySkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = 0.45f)
                            EffySkeletonText(type.bodySmall, Modifier.fillMaxWidth(), widthFraction = 0.3f)
                        }
                    }
                    if (i == 0) EffyGroupDivider()
                }
            }
        }
    }
}

@Composable
private fun CardRow(card: KeptCard, removing: Boolean, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = EffySize.rowWithSubtitle).padding(start = EffySpacing.lg, end = EffySpacing.xs, top = EffySpacing.s, bottom = EffySpacing.s),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(painterResource(Res.drawable.lucide_credit_card), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f)) {
            Text("${brandName(card.brand)} •••• ${card.last4}", style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum"))
            if (card.unusableReason != null) {
                // An unusable card states its reason - with an icon, never red.
                EffyInlineError(card.unusableReason)
            } else {
                Text(
                    "Expires ${card.expMonth.toString().padStart(2, '0')} / ${card.expYear.toString().takeLast(2)}" +
                        if (card.isDefault) " · Default" else "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        // Disabled while a removal is in flight, so a second tap cannot start another.
        EffyTextLink(if (removing) "Removing…" else "Remove", onClick = onRemove, enabled = !removing)
    }
}

/** "visa" → "Visa". The provider's brand words, title-cased; unknown brands read as "Card". */
private fun brandName(brand: String?): String = when (brand?.lowercase()) {
    null, "", "unknown" -> "Card"
    "amex" -> "American Express"
    "mastercard" -> "Mastercard"
    else -> brand.replaceFirstChar { it.uppercase() }
}
