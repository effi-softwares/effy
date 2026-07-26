import SwiftUI
import Shared
import Amplify
import AWSCognitoAuthPlugin

@main
struct iOSApp: App {

    /// One bridge each for the app's lifetime; the Kotlin side wraps them in the AuthDriver and
    /// PaymentDriver. Both are held here (not rebuilt per view) so a SwiftUI re-render cannot hand
    /// Compose a fresh driver mid-session.
    private let authBridge = SwiftAuthBridge()
    private let paymentBridge = SwiftPaymentBridge()

    init() {
        configureAmplify()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(authBridge: authBridge, paymentBridge: paymentBridge)
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
