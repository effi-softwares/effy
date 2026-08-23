import UIKit
import SwiftUI
import Shared

struct ComposeView: UIViewControllerRepresentable {
    let authBridge: SwiftAuthBridge
    let paymentBridge: SwiftPaymentBridge
    let crashBridge: SwiftCrashBridge
    let analyticsBridge: SwiftAnalyticsBridge

    func makeUIViewController(context: Self.Context) -> UIViewController {
        // Swift hands its bridges to the shared Kotlin entry point, which wraps each in its driver
        // contract: IosAuthBridge → AuthDriver (013 D5), IosPaymentBridge → PaymentDriver (019 US3),
        // and (050) IosCrashBridge → CrashReporter, IosAnalyticsBridge → AnalyticsDriver. Kotlin/Native
        // can call none of Amplify Swift / Stripe iOS / Firebase / PostHog iOS directly.
        MainViewControllerKt.MainViewController(
            authBridge: authBridge,
            paymentBridge: paymentBridge,
            crashBridge: crashBridge,
            analyticsBridge: analyticsBridge
        )
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Self.Context) {}
}

struct ContentView: View {
    let authBridge: SwiftAuthBridge
    let paymentBridge: SwiftPaymentBridge
    let crashBridge: SwiftCrashBridge
    let analyticsBridge: SwiftAnalyticsBridge

    var body: some View {
        ComposeView(
            authBridge: authBridge,
            paymentBridge: paymentBridge,
            crashBridge: crashBridge,
            analyticsBridge: analyticsBridge
        )
        .ignoresSafeArea()
    }
}
