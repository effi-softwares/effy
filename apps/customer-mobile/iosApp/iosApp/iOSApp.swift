import SwiftUI
import Shared
import FirebaseCore
import Amplify
import AWSCognitoAuthPlugin

@main
struct iOSApp: App {

    /// One bridge each for the app's lifetime; the Kotlin side wraps them in their driver contracts.
    /// Held here (not rebuilt per view) so a SwiftUI re-render cannot hand Compose a fresh driver
    /// mid-session. The payment element is NOT one of these — it is registered as a factory below,
    /// because each payment screen needs its own.
    private let authBridge = SwiftAuthBridge()
    // 050 — one observability bridge each for the app's lifetime; the Kotlin side wraps them.
    private let crashBridge = SwiftCrashBridge()
    private let analyticsBridge = SwiftAnalyticsBridge()

    init() {
        // 050 — connect Firebase (Crashlytics + FCM). Safe to call once; must run before any Firebase
        // use. Requires the firebase-ios-sdk SPM package (see setup notes) or this will not compile.
        FirebaseApp.configure()
        configureAmplify()

        // 051 — the in-app payment element.
        //
        // ⚠ A FACTORY, not a single shared instance, unlike the bridges above. Each payment screen needs
        // its OWN element because each carries a live PaymentIntent; sharing one across screens would
        // confirm the wrong intent — which is a shopper being charged for the wrong order, not a glitch.
        //
        // ⚠ If this registration is ever removed, the Kotlin side falls back to a handle that refuses
        // honestly and says payments are unavailable. It does NOT silently do nothing.
        IosPaymentElementRegistry.shared.factory = { SwiftPaymentElementBridge() }
    }

    var body: some Scene {
        WindowGroup {
            ContentView(
                authBridge: authBridge,
                crashBridge: crashBridge,
                analyticsBridge: analyticsBridge
            )
            .ignoresSafeArea()
        }
    }

    /// Configure Amplify from the in-code config string built in shared Kotlin (no
    /// `amplifyconfiguration.json`, D12). A failure must not crash the app — the guest experience
    /// still works and the driver returns no session, landing on Guest.
    private func configureAmplify() {
        do {
            try Amplify.add(plugin: AWSCognitoAuthPlugin())
            let json = AppConfigKt.buildAmplifyOutputsJson()
            try Amplify.configure(with: .data(Data(json.utf8)))
        } catch {
            print("Amplify configuration failed: \(error)")
        }
    }
}
