package com.effyshopping.customer.mobile.features.paymentmethods.presentation

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
 * Payment methods (051 US6) — the cards a shopper chose to keep.
 *
 * ⚠ WHY IT EXISTS when removal is already reachable at the payment step: that means a shopper who
 * wants to remove a card has to START A CHECKOUT to do it, and card removal is a trust action people
 * take precisely when they are NOT shopping. The address book set the expectation; this is its sibling
 * (Clarification Q1, FR-024a).
 *
 * ⚠ A LIST OF ROWS, NEVER CARDS (Principle V) — same as the address book beside it.
 */
@Composable
fun PaymentMethodsScreen(container: AppContainer, onBack: () -> Unit) {
    val vm = viewModel {
        PaymentMethodsViewModel(container.listPaymentMethods, container.removePaymentMethod)
    }
    val state by vm.state.collectAsStateWithLifecycle()

    Scaffold { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text(
                text = "Payment methods",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(top = EffySpacing.lg),
            )

            when {
                state.loading -> Centered { CircularProgressIndicator() }

                // ⚠ A FAILED READ IS NOT AN EMPTY LIST. Rendering "you have no cards" here would tell a
                // shopper with saved cards something false about their own account (FR-036).
                state.loadFailed -> Centered {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
                    ) {
                        Text(
                            text = "We couldn't load your saved cards just now. This doesn't affect them.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        TextButton(onClick = vm::load) { Text("Try again") }
                    }
                }

                // ⚠ An honest empty state that EXPLAINS, with no dead controls: a card is kept while
                // paying and cannot be added from this screen (US6 scenario 4).
                state.cards.isEmpty() -> Centered {
                    Text(
                        text = "You haven't saved any cards yet. When you pay, you can choose to save " +
                            "your card for next time — it will appear here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }

                else -> {
                    state.error?.let { message ->
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                        items(state.cards, key = { it.id }) { card ->
                            CardRow(
                                card = card,
                                removing = state.removing == card.id,
                                onRemove = { vm.remove(card.id) },
                            )
                        }
                    }
                    Text(
                        text = "Effy never sees or stores your card number — only the last four digits, " +
                            "so you can tell your cards apart.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun CardRow(card: KeptCard, removing: Boolean, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = EffySpacing.s),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = "•••• ${card.last4}",
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                // ⚠ An unusable card states its reason; it is never left for the shopper to work out
                // why a card they can see cannot be used (FR-023).
                text = card.unusableReason
                    ?: "Expires ${card.expMonth.toString().padStart(2, '0')} / ${card.expYear.toString().takeLast(2)}",
                style = MaterialTheme.typography.bodySmall,
                color = if (card.usable) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.error
                },
            )
        }
        // ⚠ Disabled while a removal is in flight, so a second tap cannot start another (FR-041).
        TextButton(onClick = onRemove, enabled = !removing) {
            Text(if (removing) "Removing…" else "Remove")
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(EffySpacing.lg),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
