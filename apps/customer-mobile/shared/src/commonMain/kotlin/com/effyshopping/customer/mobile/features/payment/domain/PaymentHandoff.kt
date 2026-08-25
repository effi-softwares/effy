package com.effyshopping.customer.mobile.features.payment.domain

import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent

/**
 * Carries the created [CheckoutIntent] from the checkout screen to the payment screen (051 US1).
 *
 * ⚠ WHY THIS IS NOT A NAVIGATION ARGUMENT. Every [com.effyshopping.customer.mobile.core.nav.CustomerNavKey]
 * is `@Serializable` and PERSISTED across process death, and this object holds a payment client secret.
 * Putting it in a route would write that secret to device storage and resurrect it days later — so the
 * route is a bare marker and the intent travels here, in memory only.
 *
 * ⚠ AND THAT IS DELIBERATE, NOT A LIMITATION. A process killed mid-payment SHOULD land the shopper back
 * at checkout rather than on a payment screen holding a stale intent: the order still exists, unpaid,
 * and pressing pay again creates a fresh intent for it.
 */
class PaymentHandoff {

    /** The intent awaiting payment, or null when there is none in flight. */
    var pending: CheckoutIntent? = null
        private set

    /**
     * Hand an intent to the payment screen.
     *
     * Overwrites any previous one: a shopper who backed out of payment and pressed pay again is paying
     * for the SAME order through a NEW intent, and the old one must not be what the screen confirms.
     */
    fun offer(intent: CheckoutIntent) {
        pending = intent
    }

    /** Release it once the payment screen is gone. */
    fun clear() {
        pending = null
    }
}
