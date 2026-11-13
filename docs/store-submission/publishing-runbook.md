# Publishing the mobile apps: technical runbook

The operator's step-by-step list for the **first** store release of all four apps, and for every
release after it. The *what and why* (where each app goes, costs, how updates reach people) is
[distribution-plan.md](./distribution-plan.md). Legal and privacy items are in
[submission-checklist.md](./submission-checklist.md). Reviewer notes are in
[review-notes.md](./review-notes.md).

Written 2026-11-13 against the code as it is then. Markers:

- `[OP]`: an operator action (a console, a payment, a deploy, an apply).
- `[CODE]`: code that **does not exist yet** and must be built (by Claude) before that step.
- `[DECIDE]`: a decision needed first.

Identifiers used below:

| | Customer | Driver |
|---|---|---|
| Android `applicationId` / iOS bundle id (production) | `com.effyshopping.customer.mobile` | `com.effyshopping.driver.mobile` |
| Display name | `Effy` | `Effy Driver` |
| Project | `apps/customer-mobile` | `apps/driver-mobile` |
| Version file | `apps/customer-mobile/version.properties` | `apps/driver-mobile/version.properties` |
| Distribution | Public App Store + public Play | **Unlisted** App Store + Play (public listing or closed track) |

---

## Phase 0: blockers that are not store work

None of the store steps can finish without these. Several are large.

### 0.1 A production environment `[OP]` `[DECIDE]`

Store builds must talk to **production**, not dev. `infra/envs/prod` is *authored, not applied*
(`prod.tfvars`: "Plans must stay clean with zero live resources until this env is deliberately
promoted").

- [ ] `[DECIDE]` **AWS account for prod.** `prod.tfvars` currently names the dev account
      (`724289623101`). Decide whether production gets its own account (recommended: blast radius,
      billing, IAM) and update `aws_account_id`.
- [ ] `[OP]` **Cognito email through SES.** `prod.tfvars` still has
      `email_sending_account = "COGNITO_DEFAULT"`, which caps at about 50 emails a day. Every customer
      sign-in code is an email, so switch it to `DEVELOPER` with the SES identity before any real user.
      Confirm SES production access in the prod account (`aws sesv2 get-account --profile ef`:
      `ProductionAccessEnabled: true`).
- [ ] `[OP]` `make plan ENV=prod` → `make apply ENV=prod`; migrations; `edge-deploy` of every service for
      `ENV=prod`; both gateways; AppSync Events; the media CDN.
- [ ] `[OP]` **Prod hosts.** The apex `effyshopping.com` is reserved for production. The store listings
      cite `https://effyshopping.com/legal/privacy-policy` and
      `https://effyshopping.com/delete-account`, so **customer-web must be live on the apex before
      submission**. Both stores open these URLs during review.
- [ ] `[OP]` **Stripe live mode.** A live `sk_live_…` in the prod backend and the matching
      `pk_live_…` in the prod app builds (same account, same mode, or PaymentSheet returns 400).
- [ ] `[OP]` **Firebase production project** (dev is `effy-dev-bbd5a`). Register four apps (two Android,
      two iOS) with the production ids from the table. Download the new `google-services.json` ×2 and
      `GoogleService-Info.plist` ×2. Put the FCM service-account secret in prod SSM.
- [ ] `[OP]` **PostHog production project.** Its key goes in `POSTHOG_KEY` for prod builds.
- [ ] `[OP]` **Operating time zone** for prod (`operating_timezone` in `prod.tfvars`, Melbourne or
      Sydney). The customer app's Gradle build reads it from the tfvars.

### 0.2 Build per environment `[CODE]` `[DECIDE]`

Today each app reads **one** `secrets.properties` (dev values) and one `google-services.json` /
`GoogleService-Info.plist`. A store build needs prod values without hand-editing files.

- [ ] `[DECIDE]` **Dev and prod on one phone?** Both builds currently use the same id, so they can't be
      installed side by side, and a dev APK on a tester's phone blocks the store app. Recommended:
      production keeps the plain ids; dev builds get `applicationIdSuffix = ".dev"` (iOS: a `.dev`
      bundle id) and their own Firebase registrations.
- [ ] `[CODE]` Select config by environment: `secrets.<env>.properties` and per-env Firebase files,
      chosen by `EFFY_ENV=dev|prod` (Gradle property and environment variable; an Xcode configuration
      or xcconfig on iOS). A prod build with any dev value (`*.dev.effyshopping.com`, `pk_test_`,
      `effy-dev-`) must **fail**.
- [ ] `[CODE]` Prod values: `EDGE_API_BASE_URL` / `DRIVER_API_BASE_URL` = the prod shared gateway,
      Cognito pool and **mobile** app-client ids from `make output ENV=prod`, `STRIPE_PUBLISHABLE_KEY` =
      `pk_live_…`, `DEBUG_TOOLS=false`, and `WEB_SITE_HOST` = the prod storefront host. Driver:
      `DISPATCH_PHONE`, `HUB_DESK_PHONE` and `HANDBOOK_URL` must be real numbers and a real URL, and the
      operator supplies them.

### 0.3 The in-app update check (built: 121)

It must ship in the **first** store builds; a build without it can never be forced to update. It is built
(`specs/121-in-app-updates/`). For prod:
- [ ] `[OP]` `make apply ENV=prod` creates the CDN path, `make app-updates ENV=prod` publishes the
      all-zero files, and `APP_UPDATES_URL` goes into the prod build config (output `app_updates_url_<app>`).
- [ ] `[OP]` Once each store page exists, put its address in `config/app-updates/prod/<app>.json`
      (`storeUrl`). Prod refuses any number above 0 without one.

### 0.4 Legal and privacy `[OP]`

- [ ] Legal identifiers in `packages/legal-content/src/identifiers.json` (entity, ABN, address,
      governing law), lawyer-reviewed. `legal:check --release` must pass (checklist row 11).
- [ ] Consent wordings that are still drafts (111, 115) approved.
- [ ] 113 (erasure) deployed to prod so "permanently erased" is true (checklist row 10).

### 0.5 How reviewers sign in `[DECIDE]` `[CODE]`

Both stores require working credentials for any app behind a login (Apple 2.1, Play "App access").

- **Customer:** email + password works. Create a prod account for review, with a real order history if
  possible. Give it in App Store Connect › App Review Information and in Play › App content › App
  access. Keep review-notes.md's "register a throwaway account to test deletion" note.
- **Driver:** sign-in is **email one-time code only** and admin-provisioned. A reviewer cannot receive
  the code, so the driver app **will be rejected** as it is. Options:
  1. **Recommended:** a review-only driver account with a fixed code. Exactly one named account, its
     code held in SSM (not in source), every sign-in audited, the account disabled between reviews,
     and assigned only to a demo hub with demo work so it can never see a real customer.
  2. A mailbox the reviewer is given access to. Fragile; Apple reviewers rarely do this.
- [ ] `[CODE]` build the chosen option, plus demo work (a run, parcels, a drop) so the reviewer sees
      more than an empty Today screen. Reviewers are often outside Australia.

### 0.6 Platform rules to check before the first build

- [ ] **Sign in with Apple (Apple 4.8).** Not needed **while Google sign-in stays parked**
      (`AppConfig.googleSignInEnabled = false`). If Google is ever turned on in the iOS app, an
      equivalent private login (Sign in with Apple) becomes mandatory in the same release.
- [ ] **iPad.** Both iOS targets are `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone **and** iPad), which
      makes iPad screenshots mandatory and lets reviewers test on an iPad. `[DECIDE]` iPhone only →
      `[CODE]` set `TARGETED_DEVICE_FAMILY = 1` in both projects.
- [ ] **Minimum iOS** is `IPHONEOS_DEPLOYMENT_TARGET = 18.2`, so iPhones on iOS 17 or earlier can't
      install the app. `[DECIDE]` keep it or lower it.
- [ ] **Driver privacy manifest.** The customer app has `iosApp/iosApp/PrivacyInfo.xcprivacy`; **the
      driver app has none**. `[CODE]` add it (camera, crash data, usage data, push token;
      required-reason APIs).
- [ ] **Export compliance.** `[CODE]` add `ITSAppUsesNonExemptEncryption = false` to both
      `Info.plist`s (HTTPS only is exempt). Otherwise App Store Connect asks on every upload.
- [ ] **Android 16 KB page size.** Play requires it for apps targeting Android 15+. The driver app
      ships native libraries (ML Kit barcode, CameraX), and both ship Firebase, Stripe and Amplify.
      After the first AAB build, check every `.so`:
      `bundletool build-apks --bundle=app.aab --output=app.apks --mode=universal && unzip -o app.apks -d out && zipalign -c -P 16 -v 4 out/universal.apk`.
      An unaligned library means updating that dependency.
- [ ] **Target API.** `targetSdk 36` meets Play's current requirement. Each August Play raises the
      floor: check it every year.
- [ ] **Driver camera.** Android `CAMERA` and iOS `NSCameraUsageDescription` ("…proof of delivery")
      are fine. If labels are also scanned, say so in the description: "photograph proof of delivery
      and scan package labels".

---

## Phase 1: accounts

- [ ] `[OP]` Effy registered as a company (ASIC). Request the **D-U-N-S number** through Apple's
      D-U-N-S lookup (free, 1–2+ weeks). The legal name must match the D-U-N-S record exactly.
- [ ] `[OP]` **Apple Developer Program, Organization**, US$99 a year. You need the D-U-N-S number, a
      website on the company domain, and authority to sign for Effy. Note the **Team ID** (10
      characters).
- [ ] `[OP]` **Google Play Console, Organization**, US$25 once. You need the D-U-N-S number,
      identity verification, a developer email and phone, and website verification through Search
      Console for `effyshopping.com`.
- [ ] `[OP]` Reserve both app names early: in App Store Connect › Apps › `+` (needs the bundle ids,
      Phase 2), and in Play Console › Create app. "Effy" may already be taken; have a second choice
      ready ("Effy: Groceries Delivered").
- [ ] `[OP]` Users and roles: App Store Connect (Admin, plus App Manager for anyone uploading) and
      Play Console (Admin, plus release managers). Use `workspace-admin@effyshopping.com` as the
      account contact; the support contact on listings is `hello@effyshopping.com`.

---

## Phase 2: iOS setup (once per app)

### 2.1 Identifiers and capabilities `[OP]` `[CODE]`

- [ ] `[CODE]` In each `iosApp/Configuration/Config.xcconfig`, set `TEAM_ID` to the paid team, and
      set `PRODUCT_BUNDLE_IDENTIFIER` to the production id (drop the
      `.<app>-mobile$(TEAM_ID)` suffix used on the free account). This is step 3 of
      `docs/observability-apple-blockers.md`, "After paying".
- [ ] `[OP]` developer.apple.com › Identifiers: confirm both App IDs exist (Xcode automatic signing
      registers them) with **Push Notifications** and **Time Sensitive Notifications**. The customer
      app also needs **Associated Domains**.
- [ ] `[OP]` **APNs key** (`.p8`, one per team) → upload it to the **production** Firebase project for
      both iOS apps (and to dev if dev iOS push should work too).
- [ ] `[CODE]` Uncomment `CODE_SIGN_ENTITLEMENTS = iosApp/iosApp.entitlements` in both xcconfigs, and
      add the Time Sensitive and (customer) Associated Domains `applinks:<prod host>` entitlements.
      These are steps 4–7 of "After paying", with `apple_team_id` set in `prod.tfvars`.
- [ ] `[OP]` Signing stays **Automatic** (`CODE_SIGN_STYLE = Automatic`). Xcode creates the Apple
      Distribution certificate and the App Store provisioning profile the first time you archive.
      Back up the distribution certificate's private key: Keychain › export `.p12` → the password
      manager.

### 2.2 Version numbers (built: 121)

iOS has its **own** version and build number, independent of Android: `iosApp/Configuration/Version.xcconfig`
(`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`), included by `Config.xcconfig`. `make cm-ios-version` /
`make dm-ios-version [BUMP=patch|minor|major]` raises it - run it before each archive (App Store Connect refuses a build
number it has seen) and commit the file. Android's builds never touch it, and it never touches Android's
`version.properties`. Building or archiving in Xcode reads it and changes nothing. ⚠ Do not type a Version or Build into
Xcode › target › General: Xcode writes it into the project, where it silently wins; `scripts/check-app-versions.sh` fails it.

### 2.3 Crash symbols `[CODE]`

- [ ] Add the Crashlytics dSYM run script (after "Embed Frameworks", both apps):
      `"${BUILD_DIR%/Build/*}/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/run"`.
      The Kotlin framework is built by the existing `./gradlew :shared:embedAndSignAppleFrameworkForXcode`
      phase. Confirm the Release configuration builds it with `CONFIGURATION=Release`.

### 2.4 Archive and upload `[OP]`

Xcode: select **Any iOS Device (arm64)** › Product › **Archive** › Organizer › **Distribute App** ›
**App Store Connect** › Upload.

Or from the command line (`[CODE]`: an `ExportOptions.plist` per app with
`method = app-store-connect`, `destination = upload`, `teamID`, `signingStyle = automatic`):

```bash
cd apps/customer-mobile/iosApp
xcodebuild -project iosApp.xcodeproj -scheme iosApp -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/customer.xcarchive archive
xcodebuild -exportArchive -archivePath build/customer.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export   # uploads (destination=upload)
```

The build appears in App Store Connect › TestFlight after processing (5–30 minutes).

### 2.5 App Store Connect: the app record `[OP]`

Once per app: Apps › `+` › New App: platform iOS, name, primary language **English (Australia)**,
bundle id, and a SKU (`effy-customer-ios`, `effy-driver-ios`).

App Information and the version page:

| Field | Customer | Driver |
|---|---|---|
| Category | Shopping (secondary: Food & Drink) | Business |
| Age rating questionnaire | Answer it. Alcohol/18+ items affect it: answer to what the catalogue sells (the 18+ label exists, there is no age check yet) | No restricted content |
| Privacy policy URL | `https://effyshopping.com/legal/privacy-policy` | same |
| Support URL | a prod storefront help/contact page | same |
| App Privacy (nutrition label) | [app-privacy-mapping.md](./app-privacy-mapping.md) | `[CODE]` a driver mapping is still to be written |
| Screenshots | 6.9" iPhone, 1320×2868 (3–10); iPad 13" if iPad is kept | same |
| Description, keywords (100 characters), promotional text, "What's New" | write them | write them |
| App Review Information | demo account (0.5), contact, notes from review-notes.md | review account (0.5) and notes on how to reach a delivery |
| Version release | **Manually release this version** for the first release | **Manually release** (required for unlisted, below) |
| Availability | Australia only | Australia only |

### 2.6 TestFlight → review → release `[OP]`

1. TestFlight › Internal Testing: add the team (no review needed, up to 100 people). Test on a real
   iPhone: sign-in, push, a full order (customer), a full round (driver).
2. Version page › choose the build › **Add for Review** › Submit.
3. **Driver only, unlisted:** after you submit and **before** release, complete Apple's **unlisted app
   distribution request** form (developer.apple.com › Contact › unlisted app request). Give the app's
   Apple ID (App Store Connect › App Information) and the reason ("internal app for Effy's employed
   drivers; accounts are provisioned by Effy"). Wait for approval. Only then release. The app gets a
   link-only URL; give it to drivers. It stays unlisted for every later version.
4. Approved → **Release This Version**. For later releases choose **Phased Release for Automatic
   Updates** (7 days, 1→100%).

---

## Phase 3: Android setup (once per app)

### 3.1 Signing `[OP]` `[CODE]` `[DECIDE]`

Play uses **Play App Signing**: Google holds the app signing key, and you sign uploads with an
**upload key**. The customer `keystore/customer-dev.jks` is a dev key and must **never** be uploaded.

- [ ] `[OP]` Create an upload key per app and keep it, with its passwords, in the password manager plus
      an offline backup:
      ```bash
      keytool -genkeypair -v -keystore upload-customer.jks -alias upload \
        -keyalg RSA -keysize 4096 -validity 10000
      keytool -genkeypair -v -keystore upload-driver.jks -alias upload \
        -keyalg RSA -keysize 4096 -validity 10000
      ```
      A lost upload key can be reset through Play support. A lost app signing key can't be recovered,
      which is why Google holds it.
- [ ] `[DECIDE]` **Driver app's existing key** (`release/effy-driver-release.jks`). If drivers already
      have the sideloaded app, you can give Play this key as the app signing key (Play Console ›
      App signing › "Use existing app signing key", with Google's PEPK tool) so the Play build installs
      over it. Otherwise every driver uninstalls the sideloaded app once. Recommended: let Google
      generate a new key and have drivers reinstall once; there are few installs.
- [ ] `[CODE]` A `store` signing config (upload key, read from a git-ignored
      `keystore.store.properties` or environment variables) and make targets `cm-aab` / `dm-aab` that
      run `scripts/bump-version.sh` then `./gradlew :androidApp:bundleRelease` with `EFFY_ENV=prod`.
      Output: `androidApp/build/outputs/bundle/release/androidApp-release.aab`.

### 3.2 Play Console: the app record `[OP]`

Create app: name, default language **English (Australia) – en-AU**, App, Free.

Then **Dashboard › Set up your app**, every item:

| Item | Customer | Driver |
|---|---|---|
| Privacy policy | `https://effyshopping.com/legal/privacy-policy` | same |
| App access | "All or some functionality is restricted" + review credentials (0.5) | same, with the driver review account |
| Ads | No ads | No ads |
| Content rating (IARC) | answer it (as in 2.5) | answer it |
| Target audience | 18+ (simplest with 18+ items in the catalogue; under-13 brings Families policy) | 18+ |
| Data safety | [data-safety-mapping.md](./data-safety-mapping.md); deletion URL `https://effyshopping.com/delete-account` | `[CODE]` driver mapping to be written |
| Government / financial / health apps | No | No |
| Store listing | short description (80), full description (4000), icon 512×512 PNG, feature graphic 1024×500, ≥2 phone screenshots (9:16) | same |
| Countries | Australia | Australia |

### 3.3 First upload and link verification `[OP]`

1. Testing › **Internal testing** › Create release › upload the AAB › release notes › roll out. Add
   testers (an email list). Install from the opt-in link and test as in 2.6.
2. Setup › **App signing**: copy the **app signing key SHA-256** (and the upload key SHA-256).
3. Add both to `android_app_cert_sha256` in `prod.tfvars` → `make apply ENV=prod` → deploy prod
   customer-web. Check `curl -s https://<prod host>/.well-known/assetlinks.json` lists them. Without
   this, links in Effy emails open the browser instead of the store-installed app (116).
4. Optional: add the same SHA-256 / SHA-1 to the Android apps in the prod Firebase project.

### 3.4 Release `[OP]`

- **Customer:** Production › Create release › the AAB already tested on internal (Promote release) ›
  **staged rollout**, for example 10% → 50% → 100% over a few days, watching Crashlytics and Play
  vitals. The first production release goes through review (hours to a few days; longer for a new
  account).
- **Driver:** either Production (public listing; nobody can sign in without an account) or a
  **Closed testing** track kept as its permanent home, with a Google Group or email list of drivers.
  Drivers open the opt-in link once, then Play updates them normally.
- Organisation accounts are **exempt** from the "12 testers for 14 days" rule; personal accounts are
  not.

---

## Phase 4: every later release

1. **Backend first.** Deploy any server change to prod, compatible with every build still above the
   minimum.
2. **Version.** `BUMP=patch|minor|major` as appropriate (the build number rises by itself); commit
   that platform's version file - Android `version.properties`, iOS `iosApp/Configuration/Version.xcconfig`; they are
   numbered independently (121).
3. **Build.** Android: `make cm-aab` / `make dm-aab` `[CODE]`. iOS: `make cm-ios-version` / `make dm-ios-version`
   first (App Store Connect refuses a build number it has seen), then archive and upload (2.4).
4. **Test.** Play internal testing and TestFlight internal, with the same binary that ships.
5. **Release notes** in both stores ("What's New" / "What's new").
6. **Submit and roll out.** Play: staged rollout. Apple: phased release. Halt or pause if
   Crashlytics shows a new crash.
7. **Raise "latest"** for each platform **after** that store shows the build live: edit
   `config/app-updates/prod/<app>.json`, commit, `make app-updates ENV=prod`. Raise "recommended" too
   for an important release. Rules: [config/app-updates/README.md](../../config/app-updates/README.md).
8. **Drivers:** a Messages announcement on every release.
9. **Raise "minimum"** only when old builds must stop, per platform, and only once the Android rollout
   is at 100% and the iPhone build is live; publish the same way. For customers, also send an Important
   message (to everyone: Messages has no "older build" filter).
10. **No rollback.** A bad release is fixed by halting the rollout and shipping a higher build number.
    Apple accepts **expedited review** requests for urgent fixes (App Store Connect › Contact).

---

## Phase 5: automation (later, optional)

Once releases are routine: fastlane (`supply` for Play, `deliver`/`pilot` for App Store Connect),
driven by an App Store Connect API key (`.p8`) and a Play service account JSON, both in a secret store
and never in the repo. Not needed for the first releases.

---

## Code work this runbook depends on (summary)

| # | Work | Phase |
|---|---|---|
| 1 | Per-environment build config, with dev ids suffixed `.dev` | 0.2 |
| 2 | ~~In-app update check~~: built (121) | 0.3 |
| 3 | Driver review sign-in and demo work | 0.5 |
| 4 | iPhone-only targets (if decided), `ITSAppUsesNonExemptEncryption`, driver `PrivacyInfo.xcprivacy` | 0.6 |
| 5 | Production bundle ids, entitlements on, Associated Domains | 2.1 |
| 6 | ~~iOS version numbers~~: built (121, iOS's own `Version.xcconfig`, `make cm-ios-version`) | 2.2 |
| 7 | Crashlytics dSYM phase, `ExportOptions.plist` | 2.3–2.4 |
| 8 | Store signing config and `cm-aab` / `dm-aab` | 3.1 |
| 9 | Driver App Privacy and Data safety mappings | 2.5, 3.2 |
