import SwiftUI
import Shared
import Amplify
import AWSCognitoAuthPlugin

@main
struct iOSApp: App {

    /// One bridge for the app's lifetime; the Kotlin side wraps it in the AuthDriver.
    private let authBridge = SwiftAuthBridge()

    init() {
        configureAmplify()
    }

    var body: some Scene {
        WindowGroup {
            ContentView(authBridge: authBridge)
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
