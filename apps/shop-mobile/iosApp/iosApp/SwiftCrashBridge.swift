import Foundation
import Shared
import FirebaseCrashlytics

/// iOS crash bridge (050). Swift implements the Kotlin `IosCrashBridge` protocol using Firebase
/// Crashlytics (which Kotlin/Native cannot call); `IosCrashReporter` on the Kotlin side wraps it into
/// the common `CrashReporter` contract.
///
/// ⚠ NO PII beyond the subject id (Principle VII). Fatal crashes are captured AUTOMATICALLY once
/// `FirebaseApp.configure()` runs (iOSApp.swift) — this bridge adds user association + non-fatals.
final class SwiftCrashBridge: NSObject, IosCrashBridge {
    func setEnabled(enabled: Bool) {
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(enabled)
    }

    func setUserId(userId: String) {
        Crashlytics.crashlytics().setUserID(userId)
    }

    func recordNonFatal(message: String, keysJson: String) {
        if let data = keysJson.data(using: .utf8),
           let keys = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] {
            for (k, v) in keys { Crashlytics.crashlytics().setCustomValue(v, forKey: k) }
        }
        let err = NSError(domain: "AppNonFatal", code: 0,
                          userInfo: [NSLocalizedDescriptionKey: message])
        Crashlytics.crashlytics().record(error: err)
    }
}
