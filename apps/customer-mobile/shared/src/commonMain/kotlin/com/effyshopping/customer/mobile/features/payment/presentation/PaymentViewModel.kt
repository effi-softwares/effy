package com.effyshopping.customer.mobile.features.payment.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.payment.PaymentBillingDetails
import com.effyshopping.customer.mobile.core.payment.PaymentElementConfig
import com.effyshopping.customer.mobile.core.payment.PaymentElementHandle
import com.effyshopping.customer.mobile.core.payment.PaymentResult
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.ConfirmOrder
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The payment screen's ViewModel (051 US1) — `ViewModel → UseCase → Driver` (Principle VI).
 *
 * ⚠ THE SCREEN CARRIES THE AMOUNT AND NOTHING ELSE (FR-003). No basket lines, no address, no delivery
 * row: the shopper confirmed all of it on the step before, and restating it invites a second review
 * instead of a payment. That is why this state holds a total and a currency and no order content.
 */
data class PaymentUiState(
    val amount: String = "",
    val currency: String = "AUD",
    /** True while a confirmation is in flight. The pay control reads this and refuses a second press. */
    val paying: Boolean = false,
    /** A refusal the shopper can act on — never a provider error code (FR-036). */
    val error: String? = null,
    /** Set once the payment is accepted; the screen navigates to the receipt. */
    val paidOrderId: String? = null,
)

class PaymentViewModel(
    private val intent: CheckoutIntent,
    private val confirmOrder: ConfirmOrder,
    private val publishableKey: String,
    private val merchantName: String,
) : ViewModel() {

    private val _state = MutableStateFlow(
        PaymentUiState(amount = intent.grandTotalAmount, currency = intent.currency),
    )
    val state: StateFlow<PaymentUiState> = _state.asStateFlow()

    /**
     * What the platform element needs. Assembled here, from the intent — the element decides nothing.
     *
     * ⚠ `billingDetails` is the half that makes the short form legal. The element is configured to
     * collect no address and no name, so if these are absent the provider refuses the payment outright
     * (FR-015/FR-016).
     */
    val elementConfig: PaymentElementConfig = PaymentElementConfig(
        clientSecret = intent.clientSecret,
        publishableKey = publishableKey,
        merchantName = merchantName,
        amountMinor = minorUnits(intent.grandTotalAmount),
        currency = intent.currency,
        billingDetails = intent.billingDetails?.let {
            PaymentBillingDetails(
                name = it.name,
                email = it.email,
                line1 = it.line1,
                line2 = it.line2,
                city = it.city,
                state = it.state,
                postalCode = it.postalCode,
                country = it.country,
            )
        },
        customerSessionSecret = intent.customerSessionSecret,
    )

    /**
     * Pay.
     *
     * ⚠ `paying` is cleared on EVERY path, including success. The web form's defect was clearing it only
     * on a validation error, so the control stayed disabled reading "Paying…" through the navigation —
     * and forever if that navigation failed (research R12 D2, FR-041).
     */
    fun pay(handle: PaymentElementHandle) {
        if (_state.value.paying) return
        _state.value = _state.value.copy(paying = true, error = null)
        viewModelScope.launch {
            try {
                when (val result = handle.confirm()) {
                    PaymentResult.Completed -> {
                        // ⚠ Best-effort, and a failure here is deliberately swallowed. The webhook is
                        // authoritative; a shopper who has paid must never be shown a failure because a
                        // fallback confirmation call did not land (FR-039).
                        runCatching { confirmOrder(intent.orderId) }
                        _state.value = _state.value.copy(paying = false, paidOrderId = intent.orderId)
                    }
                    PaymentResult.Canceled ->
                        // Not a failure and not worth a message: the shopper chose to back out, and
                        // nothing was charged.
                        _state.value = _state.value.copy(paying = false)
                    is PaymentResult.Failed ->
                        _state.value = _state.value.copy(paying = false, error = result.message)
                }
            } catch (e: AppException) {
                _state.value = _state.value.copy(paying = false, error = message(e.error))
            }
        }
    }

    fun dismissError() {
        _state.value = _state.value.copy(error = null)
    }

    /**
     * ⚠ Every message is OURS, and every one of them says what the shopper can do next (FR-036). None
     * of them is "something went wrong" — a shopper told only that has no way to decide whether to wait,
     * try another card, or give up. The `else` branch still names the consequence that matters most:
     * nothing was charged.
     */
    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.Network -> "No connection. Nothing has been charged — check your network and try again."
        AppError.Unavailable -> "We're having trouble taking payments right now. Nothing has been charged; try again shortly."
        else -> "We couldn't take that payment. Nothing has been charged — try again, or use a different payment method."
    }
}

/**
 * Convert a 2-dp decimal money string to minor units.
 *
 * ⚠ NEVER VIA A FLOAT. Money crosses the wire as a decimal STRING precisely so no float ever touches it
 * (027 R13); parsing to Double here to multiply by 100 would reintroduce the rounding this platform
 * spent three stacked defects removing.
 */
internal fun minorUnits(amount: String): Long {
    val negative = amount.startsWith("-")
    val body = if (negative) amount.substring(1) else amount
    val dot = body.indexOf('.')
    val whole = if (dot < 0) body else body.substring(0, dot)
    val frac = if (dot < 0) "" else body.substring(dot + 1)
    val cents = (whole.filter { it.isDigit() }.ifEmpty { "0" }).toLong() * 100 +
        (frac.padEnd(2, '0').take(2).ifEmpty { "0" }).toLong()
    return if (negative) -cents else cents
}
