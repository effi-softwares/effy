import Foundation
import Shared
import StripePaymentSheet
import UIKit

/// The iOS in-app payment element bridge (051 T050).
///
/// Swift conforms to the Kotlin `IosPaymentElementBridge` protocol and owns Stripe's
/// `EmbeddedPaymentElement`; the Kotlin `actual` embeds the element's `view` in Compose through
/// `UIKitView` and drives confirmation. Same shape as the retired `SwiftPaymentBridge` (019) and
/// `SwiftAuthBridge`/`IosAuthDriver` (013).
///
/// ⚠ WHY AN EMBEDDED ELEMENT RATHER THAN `PaymentSheet`. The sheet is a modal that owns its own chrome,
/// amount and button — nothing about it can be made to look like Effy beyond colours, so FR-028 ("every
/// part Effy is permitted to draw MUST be drawn by Effy") is unmeetable with it. The embedded element
/// renders only the method list; the screen around it is ours.
final class SwiftPaymentElementBridge: NSObject, IosPaymentElementBridge {

    /// Held for the element's lifetime. A local would deallocate the moment `create` returns, taking
    /// the live PaymentIntent with it.
    private var element: EmbeddedPaymentElement?
    private var onChange: ((BridgeElementSelection) -> Void)?

    /// ⚠ Exactly one confirmation callback, cleared as it fires. The Kotlin side resumes a
    /// `CancellableContinuation` with it, and resuming twice traps — so a second invocation must be
    /// impossible rather than merely unlikely.
    private var pendingConfirm: ((BridgePaymentResult) -> Void)?

    func create(
        clientSecret: String,
        publishableKey: String,
        merchantName: String,
        amountMinor: Int64,
        currency: String,
        billing: BridgeBillingDetails?,
        onReady: @escaping (BridgeElementReady) -> Void,
        onChange: @escaping (BridgeElementSelection) -> Void
    ) {
        self.onChange = onChange

        // Stripe SDK calls must run on the main thread; the Kotlin caller may invoke us off it.
        Task { @MainActor [weak self] in
            guard let self else { return }

            STPAPIClient.shared.publishableKey = publishableKey

            var configuration = EmbeddedPaymentElement.Configuration()
            configuration.merchantDisplayName = merchantName

            // ⚠ COLLECT NOTHING WE ALREADY HOLD (FR-014/FR-015). `attachDefaultsToPaymentMethod = true`
            // is what makes this lossless rather than merely shorter: the address still reaches the
            // bank for authorisation, sourced from Effy's record instead of the shopper's keyboard.
            //
            // ⚠ MUTATED IN PLACE, never constructed. `BillingDetailsCollectionConfiguration` is a public
            // struct that declares no public initializer, so its memberwise init is internal to
            // StripePaymentSheet and unreachable from here. The default instance already sitting on the
            // configuration is the only one we can get hold of.
            configuration.billingDetailsCollectionConfiguration.name = .never
            configuration.billingDetailsCollectionConfiguration.email = .never
            configuration.billingDetailsCollectionConfiguration.phone = .never
            configuration.billingDetailsCollectionConfiguration.address = .never
            configuration.billingDetailsCollectionConfiguration.attachDefaultsToPaymentMethod = true

            if let billing {
                var details = PaymentSheet.BillingDetails()
                details.name = billing.name
                details.email = billing.email
                details.address = PaymentSheet.Address(
                    city: billing.city,
                    country: billing.country,
                    line1: billing.line1,
                    line2: billing.line2,
                    postalCode: billing.postalCode,
                    state: billing.state
                )
                configuration.defaultBillingDetails = details
            }

            // ⚠ Effy draws the mandate text itself, beside its own pay button. Turning this off WITHOUT
            // rendering it in the screen would be a compliance failure, not a style choice.
            configuration.embeddedViewDisplaysMandateText = false

            // The deferred flow: the order and its intent already exist, so the handler hands back the
            // client secret core-api issued. The Stripe SECRET never leaves core-api (019 R3).
            let intentConfiguration = PaymentSheet.IntentConfiguration(
                mode: .payment(
                    amount: Int(amountMinor),
                    currency: currency.uppercased()
                )
            ) { _, _, intentCreationCallback in
                intentCreationCallback(.success(clientSecret))
            }

            do {
                let created = try await EmbeddedPaymentElement.create(
                    intentConfiguration: intentConfiguration,
                    configuration: configuration
                )
                created.delegate = self
                // ⚠ ON THE ELEMENT, not the Configuration — verified against the 24.25.0 source, where
                // `presentingViewController` is a property of `EmbeddedPaymentElement` itself. Without
                // it the form sheet has nothing to present from: the shopper taps a method and nothing
                // happens at all (research R17).
                created.presentingViewController = Self.topViewController()
                self.element = created

                onReady(
                    BridgeElementReady(
                        view: created.view,
                        heightPoints: Double(created.view.systemLayoutSizeFitting(
                            UIView.layoutFittingCompressedSize
                        ).height),
                        error: nil
                    )
                )
            } catch {
                // ⚠ A shopper who cannot pay must be TOLD, in words they can act on — never a raw SDK
                // error string, which is written for a developer reading a dashboard (FR-036).
                onReady(
                    BridgeElementReady(
                        view: nil,
                        heightPoints: 0,
                        error: "We couldn't load payment options. Check your connection and try again."
                    )
                )
            }
        }
    }

    func confirm(onResult: @escaping (BridgePaymentResult) -> Void) {
        Task { @MainActor [weak self] in
            guard let self, let element = self.element else {
                onResult(BridgePaymentResult(outcome: "failed", message: "Payment isn't ready — please try again."))
                return
            }
            self.pendingConfirm = onResult
            let result = await element.confirm()
            guard let pending = self.pendingConfirm else { return }
            self.pendingConfirm = nil

            switch result {
            case .completed:
                pending(BridgePaymentResult(outcome: "completed", message: nil))
            case .canceled:
                pending(BridgePaymentResult(outcome: "canceled", message: nil))
            case .failed(let error):
                pending(BridgePaymentResult(outcome: "failed", message: error.localizedDescription))
            }
        }
    }

    func dispose() {
        Task { @MainActor [weak self] in
            self?.element?.delegate = nil
            self?.element = nil
            self?.onChange = nil
            self?.pendingConfirm = nil
        }
    }

    /// The presenting controller for the element's form sheet. Walks to the top of the stack because
    /// the Compose host controller may itself be presented.
    @MainActor
    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
}

// MARK: - EmbeddedPaymentElementDelegate

extension SwiftPaymentElementBridge: EmbeddedPaymentElementDelegate {

    /// ⚠ THE HEIGHT CALLBACK IS LOAD-BEARING, not cosmetic. The element grows when a method is selected
    /// (a form expands beneath the row). A Compose interop view keeps the height it was measured at, so
    /// without forwarding this the card fields render below the visible box and the shopper cannot
    /// reach them — with nothing on screen suggesting anything is wrong.
    func embeddedPaymentElementDidUpdateHeight(embeddedPaymentElement: EmbeddedPaymentElement) {
        publishSelection(from: embeddedPaymentElement)
    }

    func embeddedPaymentElementDidUpdatePaymentOption(embeddedPaymentElement: EmbeddedPaymentElement) {
        publishSelection(from: embeddedPaymentElement)
    }

    /// ⚠ `@MainActor` because `EmbeddedPaymentElement` is. The delegate methods above inherit that
    /// isolation from the `@MainActor` protocol they witness; this helper is not a witness, so it would
    /// otherwise be nonisolated and unable to touch `paymentOption` or `view`.
    @MainActor
    private func publishSelection(from element: EmbeddedPaymentElement) {
        let option = element.paymentOption
        onChange?(
            BridgeElementSelection(
                label: option?.label,
                // `mandateText` is an NSAttributedString; the screen renders plain text beside the pay
                // button, so the string value is what crosses the bridge.
                mandateText: option?.mandateText?.string,
                heightPoints: Double(element.view.systemLayoutSizeFitting(
                    UIView.layoutFittingCompressedSize
                ).height)
            )
        )
    }
}
