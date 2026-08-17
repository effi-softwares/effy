import Foundation
import Shared
import StripePaymentSheet
import UIKit

/// The iOS payment bridge (019 US3). Swift implements the Kotlin `IosPaymentBridge` protocol, and
/// `IosPaymentDriver` on the Kotlin side adapts it back to the common `PaymentDriver` `suspend`
/// contract — the same shape as `SwiftAuthBridge`/`IosAuthDriver`.
///
/// It presents Stripe's `PaymentSheet` for the PaymentIntent whose `clientSecret` core-api minted
/// (the Stripe SECRET never leaves core-api — the publishable key is a NAME, 019 R3), then maps the
/// result back to a flat `BridgePaymentResult` and calls `onResult` **exactly once, on the main
/// thread**. `IosPaymentDriver` resumes a `CancellableContinuation` with it; resuming twice would
/// crash, which is why the sheet is presented once and each Stripe outcome maps to a single callback.
final class SwiftPaymentBridge: NSObject, IosPaymentBridge {

    /// The presented sheet is held here for the lifetime of the presentation — `PaymentSheet` must
    /// outlive `present(from:completion:)`, and a local would be deallocated the moment this method
    /// returns, silently cancelling the flow.
    private var paymentSheet: PaymentSheet?

    func presentPaymentSheet(
        clientSecret: String,
        publishableKey: String,
        onResult: @escaping (BridgePaymentResult) -> Void
    ) {
        // Stripe SDK calls must run on the main thread; the Kotlin caller may invoke us off it.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            STPAPIClient.shared.publishableKey = publishableKey

            var configuration = PaymentSheet.Configuration()
            configuration.merchantDisplayName = "Effy"
            // Card-only for now — mirrors the web Payment Element scope. Wallets (Apple Pay) are a
            // later slice and need a merchant id + capability, which this build does not carry.

            let sheet = PaymentSheet(paymentIntentClientSecret: clientSecret, configuration: configuration)
            self.paymentSheet = sheet

            guard let presenter = Self.topMostViewController() else {
                self.paymentSheet = nil
                onResult(BridgePaymentResult(outcome: "failed", message: "Could not present payment."))
                return
            }

            sheet.present(from: presenter) { [weak self] result in
                self?.paymentSheet = nil
                switch result {
                case .completed:
                    onResult(BridgePaymentResult(outcome: "completed", message: nil))
                case .canceled:
                    onResult(BridgePaymentResult(outcome: "canceled", message: nil))
                case .failed(let error):
                    onResult(BridgePaymentResult(outcome: "failed", message: error.localizedDescription))
                }
            }
        }
    }

    /// Walks from the key window's root down through presented/nav/tab controllers to the controller
    /// Stripe should present from. Compose runs inside a single hosting controller, so the root is
    /// usually the answer, but this handles an already-presented sheet or an alert on top.
    private static func topMostViewController() -> UIViewController? {
        let keyWindow = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }

        var top = keyWindow?.rootViewController
        while true {
            if let presented = top?.presentedViewController {
                top = presented
            } else if let nav = top as? UINavigationController {
                top = nav.visibleViewController ?? nav
            } else if let tab = top as? UITabBarController {
                top = tab.selectedViewController ?? tab
            } else {
                break
            }
        }
        return top
    }
}
