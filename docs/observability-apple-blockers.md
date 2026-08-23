# iOS observability & push — Apple-account-gated steps (050)

Everything in 050 that needs an **Apple Developer account** is collected here so it is a known,
deferred blocker — not a surprise. The code is written and wired; these are the out-of-code steps to
finish once the account exists. Until then iOS runs fine: fatal crash reporting works after the SPM
step below, iOS analytics works, and **push is a safe no-op** (the `NoOpPushTokenProvider` default).

## What is NOT blocked (do these now, no Apple account needed)

Per iOS app (customer / shop / driver), in Xcode:

1. **Add Firebase via Swift Package Manager** — File → Add Package Dependencies →
   `https://github.com/firebase/firebase-ios-sdk` (Up to Next Major from latest). Select **only**:
   - ✅ `FirebaseCrashlytics`
   - ✅ `FirebaseMessaging`
   - ❌ **NOT** `FirebaseAnalytics` (we use PostHog for analytics — constitution).
   Add to the `iosApp` target.
2. **Add PostHog via SPM** — `https://github.com/PostHog/posthog-ios` (Up to Next Major). Product:
   `PostHog`. Add to the `iosApp` target. (Required by `SwiftAnalyticsBridge.swift`.)
3. **Crashlytics dSYM upload run-script** (KMP-specific, research R3) — target → Build Phases →
   + New Run Script Phase, after "Embed Frameworks":
   ```sh
   "${BUILD_DIR%/Build/*}/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/run"
   ```
   Input Files:
   ```
   ${DWARF_DSYM_FOLDER_PATH}/${TARGET_NAME}.app.dSYM/Contents/Resources/DWARF/${TARGET_NAME}
   $(SRCROOT)/$(BUILT_PRODUCTS_DIR)/$(INFOPLIST_PATH)
   ```
   ⚠ The shared KMP framework's dSYM can sit behind a symlink `upload-symbols` rejects; if traces are
   unreadable, copy `Shared.framework.dSYM` out of `cocoapods/…`/SPM checkout before upload.
4. `FirebaseApp.configure()` — **already added** to each `iOSApp.swift` `init()`. After steps 1–3 build,
   **fatal-crash reporting is live** and **iOS analytics is live** (once `POSTHOG_KEY` is in config).

## What IS blocked on the Apple Developer account (do later)

Push notifications on iOS (FCM delivers via APNs, which requires Apple credentials):

1. **APNs Auth Key (.p8)** — Apple Developer → Certificates, Identifiers & Profiles → Keys → create a
   key with **Apple Push Notifications service (APNs)** enabled. Note the **Key ID** and **Team ID**.
2. **Upload it to Firebase** — Firebase Console → Project Settings → Cloud Messaging → the iOS app →
   **APNs Authentication Key** → upload the .p8 + Key ID + Team ID. (One key covers all three apps.)
3. **Xcode capabilities** on each iOS target: add **Push Notifications** and **Background Modes →
   Remote notifications**. These entitlements need a provisioning profile from the paid account.
4. **The iOS push bridge is NOT written yet** and is the remaining code once the above exists:
   - an `AppDelegate` (via `@UIApplicationDelegateAdaptor`) to receive the APNs token and set
     `Messaging.messaging().apnsToken`, request `UNUserNotificationCenter` permission, and handle
     notification taps → the deep link;
   - a `SwiftPushBridge` + `IosPushTokenBridge`/`IosPushTokenProvider` (the same bridge pattern as
     analytics/crash) so `AppContainer` registers the FCM token via `/customer/v1/devices`.
   Until then iOS uses `NoOpPushTokenProvider` — no token is registered, no push is attempted, and
   nothing breaks (FR-019/FR-027).

> **Android is unaffected** — Android push needs no Apple account and is fully wired.

## Summary

| Capability | Android | iOS (no Apple acct) | iOS (after Apple acct) |
|---|---|---|---|
| Crash reporting (fatal) | ✅ | ✅ (after SPM) | ✅ |
| Crash non-fatal + user id | ✅ | ✅ (after SPM) | ✅ |
| Product analytics (PostHog) | ✅ | ✅ (after SPM + key) | ✅ |
| Push (FCM) | ✅ | ⛔ NoOp | ✅ (APNs key + push bridge) |
