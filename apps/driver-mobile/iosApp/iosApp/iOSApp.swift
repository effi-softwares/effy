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
