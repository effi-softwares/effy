package com.effyshopping.customer.mobile.core.payment

import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume

/**
 * The Android side of the payment boundary (019 US3), mirroring [IosPaymentDriver]. Stripe's Android
 * `PaymentSheet` cannot be built from the Application-scoped [AppContainer] — it must be registered
 * against an Activity's `ActivityResultRegistry` in `onCreate`. So `MainActivity` owns the real sheet
 * and [attach]es a [PaymentPresenter] that presents it; THIS class adapts that callback-based presenter
 * back to the common [PaymentDriver] `suspend` contract, and stays free of any Stripe type (the Stripe
 * dependency lives in the app module, not `shared`).
 *
 * Lifecycle: the Activity calls [attach] in `onCreate` and [detach] in `onDestroy`. If a payment is
 * requested while nothing is attached (no foreground Activity), it fails cleanly rather than hanging.
 * The publishable key is a NAME, not a secret (R3) — the Stripe SECRET never leaves core-api.
 */
class AndroidPaymentDriver : PaymentDriver {

    private val presenter = AtomicReference<PaymentPresenter?>(null)

    /** The in-flight continuation resolver; [PaymentResult] is delivered here by the Activity callback. */
    private val pending = AtomicReference<((PaymentResult) -> Unit)?>(null)

    /** Called by MainActivity once its ActivityResult-registered PaymentSheet exists. */
    fun attach(paymentPresenter: PaymentPresenter) {
        presenter.set(paymentPresenter)
    }

    /** Called by MainActivity in onDestroy — a stale Activity must not receive later presentations. */
    fun detach(paymentPresenter: PaymentPresenter) {
        presenter.compareAndSet(paymentPresenter, null)
    }

    /** Called by the Activity's Stripe PaymentSheet result callback. Resolves at most one waiter. */
    fun deliverResult(result: PaymentResult) {
        pending.getAndSet(null)?.invoke(result)
    }

    override suspend fun presentPaymentSheet(clientSecret: String, publishableKey: String): PaymentResult =
        suspendCancellableCoroutine { cont ->
            val active = presenter.get()
            if (active == null) {
                cont.resume(PaymentResult.Failed("Payment is not ready — please try again."))
                return@suspendCancellableCoroutine
            }
            pending.set { result -> if (cont.isActive) cont.resume(result) }
            cont.invokeOnCancellation { pending.set(null) }
            active.present(clientSecret, publishableKey)
        }
}

/**
 * Bridges the shared driver to the Activity-owned Stripe PaymentSheet. Implemented in `androidApp`,
 * where the Stripe SDK lives; the result comes back via [AndroidPaymentDriver.deliverResult].
 */
fun interface PaymentPresenter {
    fun present(clientSecret: String, publishableKey: String)
}
