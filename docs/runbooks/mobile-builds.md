# Mobile builds, versions and update prompts (customer + driver apps)

Every command for running and building the two mobile apps on Android, the iOS simulator and a real iPhone, where each
app's version lives, and how to test the in-app update prompts (121). All commands run from the **repo root**.

Related: [android-release-apk.md](android-release-apk.md) (APK details) ·
[config/app-updates/README.md](../../config/app-updates/README.md) (when to raise which update number) ·
[docs/store-submission/publishing-runbook.md](../store-submission/publishing-runbook.md) (store releases).

---

## Before the first build (once per machine)

| What | How |
|---|---|
| Build config | `apps/customer-mobile/secrets.properties` and `apps/driver-mobile/secrets.properties`, copied from each `secrets.properties.example`; values from `make output ENV=dev`. Must include `APP_UPDATES_URL` (the build fails without it). |
| Customer Android signing key (dev) | `make cm-keystore`, then `apps/customer-mobile/keystore.properties` pointing at it |
| Driver Android signing key | `apps/driver-mobile/keystore.properties` (from `keystore.properties.example`) → `release/effy-driver-release.jks` |
| iPhone signing | Xcode › Settings › Accounts: signed in with the Apple ID for team `TEAM_ID` in `iosApp/Configuration/Config.xcconfig` |
| iPhone itself | Settings › Privacy & Security › **Developer Mode** on; accept **Trust This Computer** when plugged in |

---

## Android (emulator or a plugged-in Android phone)

| Command | What it does |
|---|---|
| `make customer-android` | Customer app, debug build, on an emulator or phone you pick (Enter = a running one). Output in the terminal; Ctrl+C stops the app. |
| `make driver-android` | Driver app, the same |
| `ANDROID_DEVICE=Pixel_7_Pro make customer-android` | Skip the question: an emulator by name, or a phone's serial (`adb devices`) |
| `make cm-apk` | Customer **signed release APK** to share or install. ⚠ **Raises the Android build number by 1.** |
| `make dm-apk` | Driver release APK, the same |
| `make cm-apk BUMP=patch` | Also raises the Android version: `patch` 1.0.2 → 1.0.3, `minor` → 1.1.0, `major` → 2.0.0 |
| `adb install -r '<apk path>'` | Install the APK the command printed (keep the quotes: the name contains `+`) |

The APK lands at `apps/<app>-mobile/androidApp/build/outputs/apk/release/<app>-app-<version>+<build>.apk`.

**Android Studio** (Run ▶ on `androidApp`) reads the same version file and **never changes it**.

---

## iOS simulator

| Command | What it does |
|---|---|
| `make customer-ios` | Customer app, debug build, on a simulator you pick (Enter = an open one, else iPhone 17 Pro). Output in the terminal; Ctrl+C stops the app. |
| `make driver-ios` | Driver app, the same |
| `IOS_SIMULATOR="iPhone Air" make customer-ios` | Skip the question: a simulator by name or UDID |

The first build fetches the Swift packages and compiles the Kotlin framework (over ten minutes); later builds are quick.
Full log: `apps/<app>-mobile/build/ios-build.log`.

---

## iPhone (connected by cable, or on the same Wi-Fi)

| Command | What it does |
|---|---|
| `make customer-iphone` | Customer app, **signed** debug build, installed and opened on your iPhone. Output in the terminal; Ctrl+C stops the app. |
| `make driver-iphone` | Driver app, the same |
| `IOS_DEVICE="Janithpm" make customer-iphone` | Pick a device by name or UDID when more than one is connected |

- Keep the iPhone **unlocked** while it installs. If it says no iPhone is connected: plug it in, unlock it, accept "Trust".
- **Free Apple ID**: after the first install, Settings › General › **VPN & Device Management** › your Apple ID › **Trust**,
  then run the command again. Builds stop opening after **7 days** - run it again. Push notifications need the paid account.
- Full log: `apps/<app>-mobile/build/ios-device-build.log`. A signing failure tells you to sign in under Xcode › Settings › Accounts.

**Xcode** (open `apps/<app>-mobile/iosApp/iosApp.xcodeproj`, Run ▶ or Product › Archive) reads the iOS version file and
**never changes it**.

---

## Version numbers - Android and iOS are separate

Each app has **two independent versions**. Building one platform never changes the other.

| | Android | iOS |
|---|---|---|
| **Customer file** | [`apps/customer-mobile/version.properties`](../../apps/customer-mobile/version.properties) | [`apps/customer-mobile/iosApp/Configuration/Version.xcconfig`](../../apps/customer-mobile/iosApp/Configuration/Version.xcconfig) |
| **Driver file** | [`apps/driver-mobile/version.properties`](../../apps/driver-mobile/version.properties) | [`apps/driver-mobile/iosApp/Configuration/Version.xcconfig`](../../apps/driver-mobile/iosApp/Configuration/Version.xcconfig) |
| **Version** (what people see, three numbers) | line `versionName=1.0.2` | line `MARKETING_VERSION = 1.0.2` |
| **Build number** (always goes up) | line `versionCode=9` | line `CURRENT_PROJECT_VERSION = 9` |
| **Raise it with** | `make cm-apk` / `make dm-apk` (also builds the APK) | `make cm-ios-version` / `make dm-ios-version` (numbers only, before an archive) |
| **Raise the version too** | `… BUMP=patch\|minor\|major` | `… BUMP=patch\|minor\|major` |

Rules:

1. **The build number only goes up**, never repeats. The stores refuse a number they have seen; gaps are fine.
2. **Every release build gets a fresh number** on its platform: `make cm-apk` does it for Android; run
   `make cm-ios-version` before every Xcode archive.
3. **Commit the version file after it changes** - it is the record of which numbers were handed out.
4. You may also **edit the two lines by hand** (same rules). The version must be three numbers (`1.0.3`).
5. ⚠ **Never type a Version or Build in Xcode › target › General.** Xcode stores it in the project file, where it silently
   overrides `Version.xcconfig`. `make app-updates-check` fails if that happens.
6. Run commands (`customer-android`, `customer-ios`, `customer-iphone`, Android Studio Run, Xcode Run) **never change**
   the numbers. The number on a phone only changes when you install a new build.

**Which build is on the phone?** The bottom of the app's **Account** screen: "Version 1.0.2 (9)" = version (build).

---

## Update prompts (121)

Each app reads `https://media.<zone>/app-updates/<app>.json` at launch and compares **its own platform's** build number:

| Settings file | `config/app-updates/<env>/<app>.json` (`env` = `dev` \| `prod`, `app` = `customer` \| `driver`) |
|---|---|
| Below `minimum` | "Time to update" full screen - the app cannot be used |
| Below `recommended` | Sheet with Update now · **Remind me later**, at every launch |
| Below `latest` | Sheet with Update now · **Not now**, once |
| `storeUrl` | Where Update now goes. Android: `https://play.google.com/store/apps/details?id=<app id>`. iOS: `https://apps.apple.com/au/app/id<App Store ID>` (null in dev hides Update now; prod requires it once any number is above 0). |

| Command | What it does |
|---|---|
| `make app-updates-check` | Checks every settings file and both apps' version files. No AWS. |
| `make app-updates ENV=dev` | Publishes both apps' settings for dev. Refuses an invalid or **uncommitted** file. |
| `make app-updates ENV=dev APP=customer` | One app only |
| `make app-updates ENV=prod` | Production (when it exists) |

### Testing a prompt

1. Install a build (`make customer-iphone`, `make customer-ios`, `make customer-android` or an APK).
2. Read its build number at the bottom of Account (say **9**).
3. In `config/app-updates/dev/customer.json`, under that platform (`ios` or `android`), set:
   - notice: `"minimum": 0, "recommended": 0, "latest": 10`
   - optional: `"minimum": 0, "recommended": 10, "latest": 10`
   - mandatory: `"minimum": 10, "recommended": 10, "latest": 10`
4. `make app-updates-check` → commit the file → `make app-updates ENV=dev`.
5. Fully close the app (swipe it away) and open it again.
6. Afterwards set all three back to `0`, commit and publish, so other test phones are not prompted.

The prompt appears before sign-in, so no account is needed. The rules for real releases (raise `latest` only after the
build is live; `minimum` only after the Android rollout is at 100%) are in
[config/app-updates/README.md](../../config/app-updates/README.md).

---

## Quick reference

```bash
# run
make customer-android      make driver-android       # Android emulator / phone
make customer-ios          make driver-ios           # iOS simulator
make customer-iphone       make driver-iphone        # real iPhone

# release builds and version numbers
make cm-apk [BUMP=patch]   make dm-apk [BUMP=patch]                   # Android APK, Android build +1
make cm-ios-version [BUMP=patch]   make dm-ios-version [BUMP=patch]   # iOS build +1, before an Xcode archive

# update prompts
make app-updates-check
make app-updates ENV=dev [APP=customer|driver]
```
