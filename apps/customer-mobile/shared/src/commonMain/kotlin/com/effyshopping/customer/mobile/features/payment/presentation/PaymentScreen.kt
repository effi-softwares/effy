package com.effyshopping.customer.mobile.features.payment.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.effyshopping.customer.mobile.core.payment.PaymentElementContent
import com.effyshopping.customer.mobile.core.payment.PaymentElementHandle
import com.effyshopping.customer.mobile.core.payment.rememberPaymentElement
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton

/**
 * THE PAYMENT SCREEN (051 US1) — the mobile counterpart of the web payment step.
 *
 * ⚠ IT CARRIES NO ORDER CONTENT. No basket lines, no delivery address, no delivery-speed row (FR-003).
 * The shopper confirmed all of that on the checkout screen; repeating it here invites a second review
 * instead of a payment. The ONE order-derived thing on the screen is the amount, because you cannot ask
 * someone to pay without saying how much.
 *
 * ⚠ WHAT THE PROVIDER DRAWS IS EXACTLY ONE THING: the method list, via [PaymentElementContent]. The
 * heading, the amount, the pay button, the mandate text, the trust line and every message are Effy's
 * (FR-028). That is the whole reason this screen embeds an element instead of presenting the provider's
 * modal sheet, which owns all of those.
 */
@Composable
fun PaymentScreen(
    viewModel: PaymentViewModel,
    onPaid: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val element = rememberPaymentElement(viewModel.elementConfig)

    // The receipt reads the webhook-authoritative order state; this only navigates there.
    LaunchedEffect(state.paidOrderId) {
        state.paidOrderId?.let(onPaid)
    }

    Column(modifier = modifier.fillMaxSize()) {
        // ⚠ The back arrow is NOT passed: `EffyAppBar` reads it from the stack position (026), so this
        // screen gets one because it sits above checkout — and correctly loses it if it ever becomes a
        // stack root. Backing out here abandons an UNPAID order, which is a supported outcome: nothing
        // has been charged, and paying again creates a fresh intent for the same order.
        EffyAppBar(title = "Payment")

        // ⚠ Branch OUTSIDE the composable body rather than returning early from the middle of it. An
        // early `return` past a `collectAsState` call makes the slot table's shape depend on a nullable
        // value, which is the kind of subtlety that produces a recomposition bug nobody can reproduce —
        // on a payment screen, of all places. Two explicit branches cost four lines and cannot do that.
        if (element == null) {
            PreparingPayment(Modifier)
        } else {
            PaymentContent(viewModel, element, state, Modifier)
        }
    }
}

@Composable
private fun PaymentContent(
    viewModel: PaymentViewModel,
    element: PaymentElementHandle,
    state: PaymentUiState,
    modifier: Modifier,
) {
    val elementState by element.state.collectAsStateWithLifecycle()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        // ── The amount ───────────────────────────────────────────────────────────────────────────
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "Total due",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                Text(
                    text = formatAmount(state.amount, state.currency),
                    style = MaterialTheme.typography.displaySmall,
                )
                Text(
                    text = state.currency,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = "Includes GST and delivery. This is the exact amount we will charge.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // ── The provider's method list — the only pixels it owns on this screen ───────────────────
        PaymentElementContent(element, Modifier.fillMaxWidth())

        // ⚠ A shopper who cannot pay must be TOLD why. An inert screen with no message is
        // indistinguishable from a broken app (FR-036).
        elementState.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        state.error?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        // ⚠ MANDATE TEXT IS A COMPLIANCE REQUIREMENT, and it must sit near the pay control. The element
        // is configured NOT to draw its own (`embeddedViewDisplaysMandateText(false)`), so this is the
        // only place it appears — removing it would be a compliance failure, not a style change.
        elementState.mandateText?.let { mandate ->
            Text(
                text = mandate,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // ── Effy's own pay control ───────────────────────────────────────────────────────────────
        EffyPrimaryButton(
            // Naming the method is what stops "Pay" being a leap of faith — the shopper can see WHAT
            // they are about to pay with, not just how much.
            label = elementState.selectedLabel
                ?.let { "Pay ${formatAmount(state.amount, state.currency)} with $it" }
                ?: "Pay ${formatAmount(state.amount, state.currency)}",
            onClick = { viewModel.pay(element) },
            modifier = Modifier.fillMaxWidth(),
            // ⚠ Disabled until a method is chosen AND no payment is already in flight. The second half
            // is FR-041: a double press must not start a second payment.
            enabled = elementState.canConfirm && !state.paying,
            loading = state.paying,
        )

        Text(
            text = "Encrypted end to end. Effy never sees or stores your card number.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun PreparingPayment(modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Preparing payment…",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** "14.60" + "AUD" → "$14.60". Money is a decimal string end to end; no float ever touches it. */
internal fun formatAmount(amount: String, currency: String): String =
    if (currency.equals("AUD", ignoreCase = true)) "$$amount" else "$amount $currency"
