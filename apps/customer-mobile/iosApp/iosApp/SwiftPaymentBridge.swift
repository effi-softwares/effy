import Foundation
import Shared

/// The iOS payment bridge (019 US3). Swift implements the Kotlin `IosPaymentBridge` protocol, and
/// `IosPaymentDriver` on the Kotlin side adapts it back to the common `PaymentDriver` `suspend`
/// contract — the same shape as `SwiftAuthBridge`/`IosAuthDriver`.
///
/// ⚠ OPERATOR-GATED PLACEHOLDER — card payment on iOS does NOT work yet.
///
/// This file exists because `MainViewController(authBridge:paymentBridge:)` requires a bridge, so
/// without it the Xcode target does not compile at all. It is deliberately the SAME honest placeholder
/// as `AndroidPaymentDriver`: it returns `failed` rather than pretending to present a sheet, so no
/// caller can mistake a silent no-op for a completed payment.
///
/// To make it real (019 T003/T006/T054 — an Xcode task, not a Kotlin one):
///   1. Add the **StripePaymentSheet** SPM package to `iosApp.xcodeproj`
///      (`https://github.com/stripe/stripe-ios-spm`). It is NOT currently a dependency of this project.
///   2. `import StripePaymentSheet`, then in `presentPaymentSheet`:
///        - `STPAPIClient.shared.publishableKey = publishableKey`
///        - build `PaymentSheet(paymentIntentClientSecret: clientSecret, configuration: …)`
///        - present it from the top-most `UIViewController`
///        - map its `PaymentSheetResult` to `BridgePaymentResult`:
///          `.completed` → `"completed"`, `.canceled` → `"canceled"`, `.failed(e)` → `"failed"` + message.
///   3. Invoke `onResult` exactly once, on the main thread. `IosPaymentDriver` resumes a
///      `CancellableContinuation` with it, and resuming twice would crash.
///
/// The publishable key is a NAME, not a secret (019 R3) — the Stripe SECRET never leaves core-api.
/// Until this is wired, web checkout is the live payment path on both platforms.
final class SwiftPaymentBridge: NSObject, IosPaymentBridge {

    func presentPaymentSheet(
        clientSecret: String,
        publishableKey: String,
        onResult: @escaping (BridgePaymentResult) -> Void
    ) {
        // Mirrors AndroidPaymentDriver's message so both platforms fail identically and visibly.
        onResult(
            BridgePaymentResult(
                outcome: "failed",
                message: "Card payment on iOS is being enabled — please use the web checkout for now."
            )
        )
    }
}
