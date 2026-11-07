# iOS push - what is built, how to test it now, and the steps after paying Apple (050)

Push on the customer and driver apps goes through **Firebase Cloud Messaging**: the `notifications` worker
sends to FCM (`apis/edge-api/notifications/src/fcm/sender.ts`), and FCM hands iPhone messages to Apple's
push service (**APNs**). Android needs nothing from Apple. iOS needs an **APNs key**, and an APNs key needs
the paid **Apple Developer Program** (US$99 / A$149 a year) - a free Apple ID cannot create one, and cannot
sign an app that carries the push entitlement.

**All of the code is written (2026-11-07).** What waits for the paid account is configuration only.

## What is built

Both apps (`apps/customer-mobile`, `apps/driver-mobile`):

| Piece | Where |
|---|---|
| Firebase Messaging linked into the iOS app | `iosApp.xcodeproj` (the `firebase-ios-sdk` package's `FirebaseMessaging` product) |
| Apple's token → Firebase; banner while the app is open; tap → the app | `iosApp/iosApp/AppDelegate.swift` (`@UIApplicationDelegateAdaptor` in `iOSApp.swift`) |
| FCM token, rotation, delete | `iosApp/iosApp/SwiftPushBridge.swift` → Kotlin `IosPushBridge` / `IosPushTokenProvider` (`shared/src/iosMain/.../core/push/IosPush.kt`) |
| Token registered at sign-in, removed at sign-out | unchanged common code in `AppContainer` - the same path Android uses |
| Background delivery, Firebase auto-hooks off | `Info.plist`: `UIBackgroundModes = remote-notification`, `FirebaseAppDelegateProxyEnabled = NO` |
| The push entitlement - **written, NOT attached** | `iosApp/iosApp/iosApp.entitlements`; the switch is one commented line in `iosApp/Configuration/Config.xcconfig` |
| Simulator sample notifications | `iosApp/push-samples/*.apns` + `send.sh` |

Asking permission:
- **Customer** - at first launch, on both platforms (Android `MainActivity`, iOS `AppDelegate`).
- **Driver** - on its permission screen, with the reason (Android `PermissionRequester.android.kt`, iOS
  `PermissionRequester.ios.kt`). A refusal shows "Notifications are off" with a way to Settings on Today and
  Account, on iOS too now (`NotificationsSetting.ios.kt`).

Where a tap goes:
- **Customer** - `pushDestination` reads the worker's deep link: `effy://order/<id>` → that order,
  `effy://order` → the Orders tab, `effy://points` → Points. A signed-out shopper just lands in the app.
- **Driver** - Today, or the round itself for a `run_*` notification (`DriverShell`, unchanged).

Both apps also show a notification that arrives **while the app is open** (Android:
`EffyFirebaseMessagingService`; iOS: `AppDelegate.willPresent`), and Android posts on the app's own channel
("Order updates" / "Work updates", created at start) with the monochrome bell as its status-bar icon.

## Testing now (no Apple account)

**Android emulator - the whole path.** Use a system image whose name says **Google Play** (a plain image has
no Play services, so no FCM token). Dev already has the FCM service-account secret.
1. Install the customer app, allow notifications, sign in. A row appears in `public.device_token`
   (`audience = 'customer'`, `platform = 'android'`).
2. Place an order → "Order confirmed" arrives. With the app open it shows as a banner; tap → that order.
3. Background the app, mark an order ready in shop-web → "Your order is ready"; tap → that order.
4. Driver app: sign in, allow notifications on the permission screen, assign a run in back-office →
   "Run assigned"; tap → Today / the run.

**iOS Simulator - showing and opening.** Run the app from Xcode, then from a terminal:
```sh
apps/customer-mobile/iosApp/push-samples/send.sh points_credited      # → Account › Points
apps/customer-mobile/iosApp/push-samples/send.sh order_with_courier   # → Orders
apps/customer-mobile/iosApp/push-samples/send.sh order_paid           # edit the .apns first: a real order id
apps/driver-mobile/iosApp/push-samples/send.sh run_assigned           # edit the .apns first: a real run id
```
Send once with the app open (a banner should appear) and once with it in the background (tap the banner).
You can also drag an `.apns` file onto the Simulator window.

Expected on iOS until the account exists: the Xcode console prints `Push: no APNs token (...)`, no
`device_token` row is written for `platform = 'ios'`, and nothing else changes.

## After paying (about 30 minutes)

1. **Create the APNs key.** developer.apple.com → Certificates, Identifiers & Profiles → **Keys** → `+` →
   tick **Apple Push Notifications service (APNs)** → download the `.p8` (once only - keep it safe). Note the
   **Key ID** and your **Team ID**.
2. **Upload it to Firebase.** Firebase console → project `effy-dev-bbd5a` → Project settings → **Cloud
   Messaging** → each iOS app → APNs Authentication Key → upload the `.p8` with the Key ID and Team ID. One
   key covers both apps.
3. **Make the bundle ids match Firebase.** Firebase knows the apps as `com.effyshopping.customer.mobile` and
   `com.effyshopping.driver.mobile` (`GoogleService-Info.plist`), but `Config.xcconfig` builds
   `com.effyshopping.<app>.mobile.<app>-mobile$(TEAM_ID)`. APNs delivers by bundle id, so in each
   `iosApp/Configuration/Config.xcconfig` set `TEAM_ID` to the paid team and
   `PRODUCT_BUNDLE_IDENTIFIER=com.effyshopping.customer.mobile` (driver: `com.effyshopping.driver.mobile`).
   (`push-samples/send.sh` reads the bundle id from the xcconfig, so it follows by itself.)
4. **Attach the entitlement.** In each `Config.xcconfig`, remove the `//` from
   `// CODE_SIGN_ENTITLEMENTS = iosApp/iosApp.entitlements`. In Xcode → target `iosApp` → Signing &
   Capabilities, the **Push Notifications** capability now shows (Xcode registers it on the App ID when it
   next signs with Automatic signing).
5. **Run on a real iPhone** (or a Simulator on Apple silicon, which also receives real pushes), sign in,
   allow notifications. A `device_token` row with `platform = 'ios'` appears. Place an order → "Order
   confirmed" arrives.

> TestFlight / App Store builds rewrite `aps-environment` to `production` by themselves; the APNs key works
> for both environments.

## Crash reporting and analytics on iOS

Unchanged and not account-gated: Firebase Crashlytics and PostHog are linked through Swift Package Manager
and live once `FirebaseApp.configure()` runs (it does, in each `iOSApp.swift`) and `POSTHOG_KEY` is set.
The Crashlytics dSYM upload run-script is the one step still done by hand in Xcode - target → Build Phases →
New Run Script Phase after "Embed Frameworks":
```sh
"${BUILD_DIR%/Build/*}/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/run"
```

| Capability | Android | iOS (no Apple account) | iOS (after the steps above) |
|---|---|---|---|
| Crash reporting | ✅ | ✅ | ✅ |
| Product analytics (PostHog) | ✅ | ✅ (with key) | ✅ |
| Push: permission, banner in app, tap → screen | ✅ | ✅ (Simulator samples) | ✅ |
| Push: token registered + real delivery | ✅ | ⛔ no APNs token | ✅ |
