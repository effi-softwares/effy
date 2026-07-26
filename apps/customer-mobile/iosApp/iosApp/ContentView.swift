import UIKit
import SwiftUI
import Shared

struct ComposeView: UIViewControllerRepresentable {
    let authBridge: SwiftAuthBridge
    let paymentBridge: SwiftPaymentBridge

    func makeUIViewController(context: Self.Context) -> UIViewController {
        // Swift hands its bridges to the shared Kotlin entry point, which wraps each in its driver
        // contract: IosAuthBridge → AuthDriver (013 D5), IosPaymentBridge → PaymentDriver (019 US3).
        // Kotlin/Native can call neither Amplify Swift nor the Stripe iOS SDK directly.
        MainViewControllerKt.MainViewController(authBridge: authBridge, paymentBridge: paymentBridge)
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Self.Context) {}
}

struct ContentView: View {
    let authBridge: SwiftAuthBridge
    let paymentBridge: SwiftPaymentBridge

    var body: some View {
        ComposeView(authBridge: authBridge, paymentBridge: paymentBridge)
            .ignoresSafeArea()
    }
}
