package com.effyshopping.customer.mobile.core.payment

import com.effyshopping.customer.mobile.core.theme.LocalEffyDark
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.effyshopping.customer.mobile.shared.R
import com.effyshopping.customer.mobile.design.payment.EffyPaymentAppearance
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentelement.EmbeddedPaymentElement
import com.stripe.android.paymentelement.rememberEmbeddedPaymentElement
import com.stripe.android.paymentsheet.CreateIntentResult
import com.stripe.android.paymentsheet.PaymentSheet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume

/**
 * The Android in-app payment element.
 *
 * The deferred flow is the `CreateIntentCallback` variant, chosen deliberately. Spike S1 found the SDK
 * offers three, and the docs show a different one - `CreateIntentWithConfirmationTokenCallback`, where
 * the server creates and confirms, which would have needed a new endpoint. This variant takes the client
 * secret `POST /v1/checkout/intent` already returns, so the settlement path is untouched.
 *
 * The callback also receives `shouldSavePaymentMethod` - the shopper's save consent, arriving from the
 * element's own checkbox. The server does not decide it and must not.
 */
private class AndroidPaymentElementHandle(
    val element: EmbeddedPaymentElement,
) : PaymentElementHandle {

    private val _state = MutableStateFlow(PaymentElementState())
    override val state: StateFlow<PaymentElementState> = _state.asStateFlow()

    /** Resolves the in-flight confirmation: the sdk's `confirm` is void and answers by callback. */
    private val pending = AtomicReference<((PaymentResult) -> Unit)?>(null)

    fun publish(update: (PaymentElementState) -> PaymentElementState) {
        _state.value = update(_state.value)
    }

    fun deliver(result: PaymentResult) {
        pending.getAndSet(null)?.invoke(result)
    }

    override suspend fun confirm(): PaymentResult = suspendCancellableCoroutine { cont ->
        pending.set { result -> if (cont.isActive) cont.resume(result) }
        cont.invokeOnCancellation { pending.set(null) }
        element.confirm()
    }
}

@Composable
actual fun rememberPaymentElement(config: PaymentElementConfig): PaymentElementHandle? {
    // The SDK reads the publishable key from a process-wide singleton (`PaymentConfiguration.getInstance`,
    // which throws when nothing called `init`), and this is the one place that sets it. `init` persists it,
    // so a device that paid before would hide a missing call; a fresh install would throw.
    val context = LocalContext.current
    // The app's own appearance (Account → Appearance), not the phone's night mode.
    val dark = LocalEffyDark.current
    remember(config.publishableKey) {
        PaymentConfiguration.init(context.applicationContext, config.publishableKey)
    }

    // The builder's result callback fires before `handle` exists, so it reads through this reference
    // rather than capturing a value that is not yet constructed.
    val handleRef = remember { AtomicReference<AndroidPaymentElementHandle?>(null) }

    val builder = remember(config.clientSecret) {
        EmbeddedPaymentElement.Builder(
            createIntentCallback = { _, _ ->
                // The order and its intent already exist - the server created both before this screen
                // opened. Handing back the client secret it issued is the whole of the deferred flow.
                CreateIntentResult.Success(config.clientSecret)
            },
            resultCallback = { result ->
                handleRef.get()?.deliver(
                    when (result) {
                        is EmbeddedPaymentElement.Result.Completed -> PaymentResult.Completed
                        is EmbeddedPaymentElement.Result.Canceled -> PaymentResult.Canceled
                        is EmbeddedPaymentElement.Result.Failed ->
                            PaymentResult.Failed(
                                result.error.message
                                    ?: "We couldn't take that payment. Nothing has been charged.",
                            )
                    },
                )
            },
        )
    }

    val element = rememberEmbeddedPaymentElement(builder)
    val handle = remember(element) { AndroidPaymentElementHandle(element).also(handleRef::set) }

    LaunchedEffect(element, config.clientSecret) {
        when (
            element.configure(
                intentConfiguration = PaymentSheet.IntentConfiguration(
                    mode = PaymentSheet.IntentConfiguration.Mode.Payment(
                        amount = config.amountMinor,
                        currency = config.currency.lowercase(),
                    ),
                ),
                configuration = paymentConfiguration(config, dark),
            )
        ) {
            is EmbeddedPaymentElement.ConfigureResult.Succeeded ->
                handle.publish { it.copy(ready = true, error = null) }
            is EmbeddedPaymentElement.ConfigureResult.Failed ->
                // A shopper who cannot pay must be told. An inert screen with no message is
                // indistinguishable from a broken app.
                handle.publish {
                    it.copy(
                        ready = false,
                        error = "We couldn't load payment options. Check your connection and try again.",
                    )
                }
        }
    }

    // Mirror the element's selection so Effy's own pay button can name what it will do.
    LaunchedEffect(element) {
        element.paymentOption.collect { option ->
            handle.publish {
                it.copy(
                    selectedLabel = option?.label,
                    mandateText = option?.mandateText?.toString(),
                )
            }
        }
    }

    return handle
}

private fun paymentConfiguration(config: PaymentElementConfig, dark: Boolean): EmbeddedPaymentElement.Configuration =
    EmbeddedPaymentElement.Configuration.Builder(config.merchantName)
        // Collect nothing we already hold. `attachDefaultsToPaymentMethod = true` is
        // what makes this lossless rather than merely shorter: the address still reaches the bank for
        // authorisation, sourced from Effy's record instead of the shopper's keyboard.
        .billingDetailsCollectionConfiguration(
            PaymentSheet.BillingDetailsCollectionConfiguration(
                name = PaymentSheet.BillingDetailsCollectionConfiguration.CollectionMode.Never,
                phone = PaymentSheet.BillingDetailsCollectionConfiguration.CollectionMode.Never,
                email = PaymentSheet.BillingDetailsCollectionConfiguration.CollectionMode.Never,
                address = PaymentSheet.BillingDetailsCollectionConfiguration.AddressCollectionMode.Never,
                attachDefaultsToPaymentMethod = true,
            ),
        )
        .apply {
            config.billingDetails?.let { b ->
                defaultBillingDetails(
                    PaymentSheet.BillingDetails(
                        address = PaymentSheet.Address(
                            line1 = b.line1,
                            line2 = b.line2,
                            city = b.city,
                            state = b.state,
                            postalCode = b.postalCode,
                            country = b.country,
                        ),
                        name = b.name,
                        email = b.email,
                    ),
                )
            }
            // The shopper's kept cards, rendered by the element's own list.
            //
            // `payment_method_save` on the session is what renders the element's save checkbox and
            // lets the provider set `allow_redisplay` from what the shopper actually ticked. That is
            // why the intent must not also carry `setup_future_usage`: combining them is a documented
            // integration error and would keep a card the shopper declined.
            //
            // Both halves or neither. A secret without its customer id cannot be attached, so this
            // is deliberately a single guarded block rather than two independent lets.
            val session = config.customerSessionSecret
            val customerId = config.customerId
            if (session != null && customerId != null) {
                customer(
                    PaymentSheet.CustomerConfiguration.createWithCustomerSession(
                        id = customerId,
                        clientSecret = session,
                    ),
                )
            }
        }
        // Effy draws the mandate text itself, beside its own pay button. Turning this off without
        // rendering it in the screen would be a compliance failure, not a style choice.
        .embeddedViewDisplaysMandateText(false)
        // The typeface is a real Android font resource. General Sans lives in
        // `shared/src/androidMain/res/font/` for exactly this reason - the Compose Resources copy has no
        // R.font id, and passing none renders the payment form in the system font beside Effy's own type
        // with nothing failing to compile.
        .appearance(EffyPaymentAppearance.of(R.font.geist, dark))
        .build()

@Composable
actual fun PaymentElementContent(handle: PaymentElementHandle, modifier: Modifier) {
    val android = handle as? AndroidPaymentElementHandle ?: return
    // The provider's method list - the only pixels on this screen it owns.
    Box(modifier) { android.element.Content() }
}
