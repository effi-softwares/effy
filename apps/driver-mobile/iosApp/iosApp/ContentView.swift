import UIKit
import SwiftUI
import Shared

struct ComposeView: UIViewControllerRepresentable {
    let authBridge: SwiftAuthBridge
    let crashBridge: SwiftCrashBridge
    let analyticsBridge: SwiftAnalyticsBridge
    let pushBridge: SwiftPushBridge

    func makeUIViewController(context: Self.Context) -> UIViewController {
        // Swift hands its bridge to the shared Kotlin entry point, which wraps it in the AuthDriver.
        MainViewControllerKt.MainViewController(
            authBridge: authBridge, crashBridge: crashBridge, analyticsBridge: analyticsBridge, pushBridge: pushBridge
        )
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Self.Context) {}
}

struct ContentView: View {
    let authBridge: SwiftAuthBridge
    let crashBridge: SwiftCrashBridge
    let analyticsBridge: SwiftAnalyticsBridge
    let pushBridge: SwiftPushBridge

    var body: some View {
        ComposeView(authBridge: authBridge, crashBridge: crashBridge, analyticsBridge: analyticsBridge, pushBridge: pushBridge)
            .ignoresSafeArea()
    }
}
