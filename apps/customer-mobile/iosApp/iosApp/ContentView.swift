import UIKit
import SwiftUI
import Shared

struct ComposeView: UIViewControllerRepresentable {
    let authBridge: SwiftAuthBridge
    let crashBridge: SwiftCrashBridge
    let analyticsBridge: SwiftAnalyticsBridge

    func makeUIViewController(context: Self.Context) -> UIViewController {
        // Swift hands its bridges to the shared Kotlin entry point, which wraps each in its driver
        // contract: IosAuthBridge → AuthDriver (013 D5), and (050) IosCrashBridge → CrashReporter,
        // IosAnalyticsBridge → AnalyticsDriver. Kotlin/Native can call none of Amplify Swift / Firebase
        // / PostHog iOS directly. The payment element is registered separately, in iOSApp (051).
        MainViewControllerKt.MainViewController(
            authBridge: authBridge,
            crashBridge: crashBridge,
            analyticsBridge: analyticsBridge
        )
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Self.Context) {}
}

struct ContentView: View {
    let authBridge: SwiftAuthBridge
    let crashBridge: SwiftCrashBridge
    let analyticsBridge: SwiftAnalyticsBridge

    var body: some View {
        ComposeView(
            authBridge: authBridge,
            crashBridge: crashBridge,
            analyticsBridge: analyticsBridge
        )
        .ignoresSafeArea()
    }
}
