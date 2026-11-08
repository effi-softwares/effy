import UIKit
import UserNotifications
import FirebaseMessaging
import Shared

/// Push plumbing that only a UIApplicationDelegate can receive (050). Attached by
/// `@UIApplicationDelegateAdaptor` in iOSApp. Firebase's automatic hooks are OFF
/// (`FirebaseAppDelegateProxyEnabled = NO` in Info.plist), so everything Firebase needs is handed over here,
/// where it can be read.
///
/// - Apple's device (APNs) token → Firebase, which then produces the FCM token `SwiftPushBridge` reports.
/// - A notification that arrives while the app is open → shown as a banner (iOS shows nothing by default),
///   as the Android app's EffyFirebaseMessagingService does - a driver looking at a stop must still be told.
/// - A tapped notification → `IosPushOpen`, and from there DriverShell opens Today, or the round it was about.
///
/// The permission is NOT asked here: the driver app asks on its permission screen, with the reason
/// (`PermissionRequester.ios.kt`, backlog D5).
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set before launch finishes, or the tap that launched the app is never delivered.
        UNUserNotificationCenter.current().delegate = self
        // Needs no permission. Without the push entitlement it fails (below) - expected until the paid
        // Apple Developer account exists.
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Push: no APNs token (\(error.localizedDescription)). Expected until the app carries the push entitlement.")
    }

    // A notification while the app is in the foreground: show it.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    // A tap. `type`, `notificationId` and `destination` are the push's data keys (109 contracts/push-payload.md).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        if let type = info["type"] as? String {
            IosPushOpen.shared.opened(
                type: type,
                notificationId: info["notificationId"] as? String,
                destination: info["destination"] as? String
            )
        }
        completionHandler()
    }
}
