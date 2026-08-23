import SwiftUI
import Shared
import FirebaseCore
import Amplify
import AWSCognitoAuthPlugin

@main
struct iOSApp: App {

    /// One bridge for the app's lifetime; the Kotlin side wraps it in the AuthDriver.
    private let authBridge = SwiftAuthBridge()
    // 050 — observability bridges for the app lifetime; the Kotlin side wraps them.
    private let crashBridge = SwiftCrashBridge()
    private let analyticsBridge = SwiftAnalyticsBridge()

    init() {
        // 050 — connect Firebase (Crashlytics + FCM). Safe to call once; must run before any Firebase
        // use. Requires the firebase-ios-sdk SPM package (see setup notes) or this will not compile.
        FirebaseApp.configure()
        configureAmplify()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(authBridge: authBridge, crashBridge: crashBridge, analyticsBridge: analyticsBridge)
        }
    }

    /// Configure Amplify from the in-code config string built in shared Kotlin (no
    /// `amplifyconfiguration.json`, 013 D12). A failure must not crash the app — the driver returns no
    /// session, so the app lands on the sign-in screen.
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
