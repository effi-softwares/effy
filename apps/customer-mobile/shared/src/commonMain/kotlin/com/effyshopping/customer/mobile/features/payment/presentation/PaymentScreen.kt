package com.effyshopping.customer.mobile.features.payment.presentation

import androidx.compose.ui.backhandler.BackHandler
import org.jetbrains.compose.resources.painterResource
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import com.effyshopping.customer.mobile.resources.lucide_lock
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.customer.mobile.design.EffyStorefrontShape
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonBlock
import com.effyshopping.customer.mobile.core.presentation.EffyPinnedBar
import com.effyshopping.customer.mobile.core.presentation.EffyInlineError
import com.effyshopping.customer.mobile.core.presentation.EffyCard
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
 * The payment screen - the mobile counterpart of the web payment step.
 *
 * It carries no order content. No basket lines, no delivery address, no delivery-speed row.
 * The shopper confirmed all of that on the checkout screen; repeating it here invites a second review
 * instead of a payment. The one order-derived thing on the screen is the amount, because you cannot ask
 * someone to pay without saying how much.
 *
 * What the provider draws is exactly one thing: the method list, via [PaymentElementContent]. The
 * heading, the amount, the pay button, the mandate text, the trust line and every message are Effy's.
 * That is the whole reason this screen embeds an element instead of presenting the provider's
 * modal sheet, which owns all of those.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
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

    // While a payment is being confirmed, Back (the button, Android's gesture and the iOS
    // edge swipe, which all route through the back handler) is swallowed: leaving mid-confirmation would
    // strand the shopper not knowing whether they paid.
    BackHandler(enabled = state.paying) { }

    Column(modifier = modifier.fillMaxSize()) {
        // The back arrow is not passed: `EffyAppBar` reads it from the stack position, so this
        // screen gets one because it sits above checkout - and correctly loses it if it ever becomes a
        // stack root. Backing out here abandons an unpaid order, which is a supported outcome: nothing
        // has been charged, and paying again creates a fresh intent for the same order.
        EffyAppBar(title = "Payment")

        // Branch outside the composable body rather than returning early from the middle of it. An
        // early `return` past a `collectAsState` call makes the slot table's shape depend on a nullable
        // value, which is the kind of subtlety that produces a recomposition bug nobody can reproduce
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

    // 087 (Payment board): the total in a card, the provider's element, the mandate - and Effy's own
    // pay control pinned at the bottom above the home indicator.
    Column(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
        ) {
            EffyCard {
                Text("Total due", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                // `displaySmall` is now a defined storefront slot (30 Bold); it fell back to the
                // platform font before.
                Text(formatAmount(state.amount, state.currency), style = MaterialTheme.typography.displaySmall.copy(fontFeatureSettings = "tnum"))
                Text(
                    "Includes GST and delivery. This is the exact amount we will charge.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = EffySpacing.xs),
                )
            }

            // The provider's method list - the only pixels it owns on this screen
            PaymentElementContent(element, Modifier.fillMaxWidth())

            // A shopper who cannot pay must be told why - with an icon, never red.
            elementState.error?.let { EffyInlineError(it) }
            state.error?.let { EffyInlineError(it) }

            // Mandate text is a compliance requirement, near the pay control; the element draws none.
            elementState.mandateText?.let { mandate ->
                Text(mandate, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        EffyPinnedBar {
            EffyPrimaryButton(
                // Naming the method is what stops "Pay" being a leap of faith.
                label = elementState.selectedLabel
                    ?.let { "Pay ${formatAmount(state.amount, state.currency)} with $it" }
                    ?: "Pay ${formatAmount(state.amount, state.currency)}",
                onClick = { viewModel.pay(element) },
                // A double press must not start a second payment.
                enabled = elementState.canConfirm && !state.paying,
                loading = state.paying,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Icon(painterResource(Res.drawable.lucide_lock), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                Text("Encrypted end to end. Effy never sees or stores your card number.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun PreparingPayment(modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(EffySpacing.lg),
        verticalArrangement = Arrangement.Top,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The shape of what is coming, not a sentence on its own.
        EffySkeletonBlock(Modifier.fillMaxWidth().height(120.dp), radius = EffyStorefrontShape.lg)
        EffySkeletonBlock(Modifier.padding(top = EffySpacing.lg).fillMaxWidth().height(180.dp), radius = EffyStorefrontShape.lg)
        Text("Preparing payment…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = EffySpacing.md))
    }
}

/** "14.60" + "AUD" → "$14.60". Money is a decimal string end to end; no float ever touches it. */
internal fun formatAmount(amount: String, currency: String): String =
    if (currency.equals("AUD", ignoreCase = true)) "$$amount" else "$amount $currency"
