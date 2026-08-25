package com.effyshopping.customer.mobile.core.payment

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlinx.coroutines.flow.StateFlow

/**
 * The IN-APP payment element (051 US1) — the payment method list rendered INSIDE an Effy screen.
 *
 * ⚠ WHY THIS REPLACES [PaymentDriver.presentPaymentSheet]. That call presents the provider's full modal
 * sheet: its chrome, its amount, its button, its layout. Nothing about it can be made to look like Effy
 * beyond colours and a corner radius, so FR-028 ("every part of the payment step that Effy is permitted
 * to draw MUST be drawn by Effy") is unmeetable with it. The embedded element renders only the method
 * list and its forms; Effy supplies the screen, the amount, the trust copy and the pay button.
 *
 * ⚠ THE ELEMENT IS PLATFORM CODE AND CANNOT BE BUILT IN commonMain. Android has a Compose
 * `EmbeddedPaymentElement`; iOS has a Swift one. So this file declares the SHAPE and each platform
 * supplies it — the same seam [AuthDriver] and [PaymentDriver] already use (013 D5, research R8).
 */

/**
 * Everything the element needs to render and confirm. Assembled by the ViewModel from the intent
 * response; nothing here is decided by the element itself.
 */
data class PaymentElementConfig(
    /** Authorizes confirming exactly this PaymentIntent. Never a secret key (019 R3). */
    val clientSecret: String,
    /** The client's OWN publishable key — a name, not a secret. */
    val publishableKey: String,
    /** Shown by wallet sheets as the payee. */
    val merchantName: String,
    /** Minor units, for wallet buttons that display the amount themselves. */
    val amountMinor: Long,
    val currency: String,
    /**
     * ⚠ SUPPLIED BY EFFY, NOT COLLECTED FROM THE SHOPPER (FR-015/FR-016). The element is configured to
     * collect NO billing address and NO name; these are attached at confirmation instead. Passing null
     * here while collection is off means the payment is refused — the two halves ship together.
     */
    val billingDetails: PaymentBillingDetails?,
    /**
     * Authorizes the provider-owned saved-card list for this shopper. Null means no saved cards are
     * shown — which is correct for a shopper who has never paid, and wrong for one who has.
     */
    val customerSessionSecret: String?,
    /**
     * The provider customer the session belongs to (051 US3).
     *
     * ⚠ Required ALONGSIDE the secret — the provider's `createWithCustomerSession(id, clientSecret)`
     * takes both, and a session without its id cannot be attached. Null whenever
     * [customerSessionSecret] is null: a shopper who has never paid has no provider record, which is
     * not an error.
     */
    val customerId: String?,
)

// ⚠ There is deliberately NO font-resource id on this config. A font resource is an Android concept,
// and putting an `Int` here that only one platform can interpret would leak a platform detail into the
// shared contract. Each platform resolves its own typeface (research R8).

/** The billing details Effy attaches on the shopper's behalf. Mirrors the wire DTO, minus its nulls. */
data class PaymentBillingDetails(
    val name: String?,
    val email: String?,
    val line1: String,
    val line2: String?,
    val city: String,
    val state: String,
    val postalCode: String,
    /** ISO-3166 alpha-2. Always "AU" while Effy sells in one country. */
    val country: String,
)

/**
 * What Effy's own screen renders around the element.
 *
 * ⚠ [selectedLabel] is what lets the pay button say what it will do ("Pay with Visa 4242") rather than
 * a bare "Pay". [mandateText] is a COMPLIANCE requirement, not decoration: the element is configured not
 * to draw its own, so the screen must, near the pay control.
 */
data class PaymentElementState(
    val ready: Boolean = false,
    val selectedLabel: String? = null,
    val mandateText: String? = null,
    /** A failure from configuring the element — a shopper cannot pay, and must be told why. */
    val error: String? = null,
) {
    /** A method is chosen and the element is ready to confirm. */
    val canConfirm: Boolean get() = ready && selectedLabel != null
}

/**
 * A live element. Held by the screen for as long as it is on-screen; confirmation is a suspend call so
 * the ViewModel can own the busy state rather than the element owning it.
 */
interface PaymentElementHandle {
    val state: StateFlow<PaymentElementState>

    /**
     * Confirm the payment with whatever the shopper selected.
     *
     * ⚠ Returns [PaymentResult.Completed] for a payment the provider has ACCEPTED, which is not the same
     * as settled. The receipt reads the webhook-authoritative order state and is what tells the shopper
     * they have paid (FR-039/FR-040).
     */
    suspend fun confirm(): PaymentResult
}

/**
 * Create (and remember) the element for a configuration.
 *
 * ⚠ Called from a `@Composable`, because the Android element is Compose-scoped and cannot be built from
 * a container or a ViewModel. Returns null while the platform is still preparing it.
 */
@Composable
expect fun rememberPaymentElement(config: PaymentElementConfig): PaymentElementHandle?

/** Render the provider's method list. Everything around it is Effy's. */
@Composable
expect fun PaymentElementContent(handle: PaymentElementHandle, modifier: Modifier)
