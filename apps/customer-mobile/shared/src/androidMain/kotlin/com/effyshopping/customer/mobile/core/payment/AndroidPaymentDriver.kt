package com.effyshopping.customer.mobile.core.payment

/**
 * ⚠ OPERATOR-GATED PLACEHOLDER (019 US3). The real Android payment path uses the Stripe Android
 * **PaymentSheet**, which must be registered against an Activity's `ActivityResultRegistry` — it cannot
 * be constructed from the Application-scoped [AppContainer]. Wiring it is a device task:
 *   1. add `com.stripe:stripe-android` (paymentsheet) to `shared/build.gradle.kts` androidMain (T003),
 *   2. in `MainActivity`, create the sheet (`rememberPaymentSheet { result -> … }` or
 *      `PaymentSheet(activity, callback)`) with `STRIPE_PUBLISHABLE_KEY` from `AppConfig`,
 *   3. bridge its result callback to this `suspend` contract via a `CancellableContinuation` (exactly as
 *      [IosPaymentDriver] adapts the Swift bridge).
 *
 * Until wired, this returns [PaymentResult.Failed] so the Android app compiles and runs.
 *
 * ⚠ CORRECTED 2026-07-26: this comment previously claimed the iOS Swift bridge "IS implemented". It was
 * not — `SwiftPaymentBridge.swift` did not exist, and the Xcode target had not compiled since 019 added
 * the `paymentBridge` parameter to `MainViewController`. iOS now ships the SAME honest placeholder.
 * **Neither mobile platform can take a card payment yet; web checkout is the live path on both.**
 */
class AndroidPaymentDriver : PaymentDriver {
    override suspend fun presentPaymentSheet(clientSecret: String, publishableKey: String): PaymentResult =
        PaymentResult.Failed("Card payment on Android is being enabled — please use the web checkout for now.")
}
