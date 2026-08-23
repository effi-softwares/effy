import UIKit
import SwiftUI
import Shared

struct ComposeView: UIViewControllerRepresentable {
    let authBridge: SwiftAuthBridge

    func makeUIViewController(context: Self.Context) -> UIViewController {
        // Swift hands its bridge to the shared Kotlin entry point, which wraps it in the AuthDriver.
        MainViewControllerKt.MainViewController(authBridge: authBridge)
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Self.Context) {}
}

struct ContentView: View {
    let authBridge: SwiftAuthBridge

    var body: some View {
        ComposeView(authBridge: authBridge)
            .ignoresSafeArea()
    }
}
