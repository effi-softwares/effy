import Foundation
import Shared
import FirebaseMessaging

/// iOS push bridge (050). Swift implements the Kotlin `IosPushBridge` protocol with Firebase Messaging
/// (which Kotlin/Native cannot call); `IosPushTokenProvider` on the Kotlin side wraps it into the common
/// `PushTokenProvider`, so `AppContainer` registers the token at `/driver/v1/devices` exactly as on Android.
///
/// Firebase gives an FCM token only after `AppDelegate` has handed it Apple's (APNs) token. Without the push
/// entitlement - a free Apple account, see docs/observability-apple-blockers.md - Apple never gives one, so
/// `fetchToken` answers "" and the listener is never called. Nothing else depends on it.
final class SwiftPushBridge: NSObject, IosPushBridge, MessagingDelegate {
    private var listener: ((String) -> Void)?
    private var latest: String?

    /// Call after `FirebaseApp.configure()` - Messaging cannot be touched before it. (This object is built as
    /// a stored property of `iOSApp`, which runs before `init()`'s body, so it cannot do this itself.)
    func start() {
        Messaging.messaging().delegate = self
    }

    func fetchToken(onResult: @escaping (String) -> Void) {
        Messaging.messaging().token { token, _ in onResult(token ?? "") }
    }

    func setTokenListener(listener: @escaping (String) -> Void) {
        self.listener = listener
        // A token Firebase produced before Kotlin started listening still has to reach the backend.
        if let latest { listener(latest) }
    }

    func deleteToken(onDone: @escaping () -> Void) {
        Messaging.messaging().deleteToken { _ in onDone() }
    }

    // MessagingDelegate: the first token once APNs answers, and every rotation after it.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        latest = fcmToken
        listener?(fcmToken)
    }
}
