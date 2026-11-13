# Research: App Updates Inside the App (121)

## R1. How many levels

- **Decision**: three levels, as in the spec: mandatory (below `minimum`), optional (below `recommended`, at every launch), notice (below `latest`, once per latest build).
- **Rationale**: Siren (the long-standing iOS update library) offers force / option / skip, which is the same three. Google Play's in-app update docs give each release a priority from 0 to 5 and their own example maps high → immediate, medium → flexible, low → no prompt. Most guidance says a dismissible prompt should be at most once per release; the notice gives routine releases exactly that and keeps the every-launch prompt for releases that matter.
- **Alternatives**: two levels (Firebase's minimum + latest pattern). It is the common minimum, but then every release has to choose between nagging at every launch and a single mention.

## R2. Where the settings live and how the apps read them

- **Decision**: one static JSON file per app per environment, `https://media.<zone>/app-updates/<app>.json`, served by the existing media CloudFront distribution (086) from the media bucket under a new `app-updates/` prefix. A new cache behaviour for `/app-updates/*` gives it a 60-second edge TTL and `Cache-Control: public, max-age=60`, separate from the pictures' one-year immutable behaviour. Publishing invalidates `/app-updates/*`. The apps send `If-None-Match` with the saved ETag, so an unchanged file comes back as an empty `304`.
- **Rationale**:
  - **Cost**: no Lambda, no gateway route, no database. CloudFront's always-free tier is 10 million requests a month. Beyond that, roughly US$0.01 per 10,000 HTTPS requests, about US$1 per million launches (SC-006). S3 is read only on an edge miss, about once a minute per edge location.
  - **Speed**: answered from the nearest edge (Sydney or Melbourne for Australian phones), usually in tens of milliseconds; a `304` carries no body.
  - **No gateway capacity**: the staff gateway is at 253 of 300 routes, and this uses none.
  - **Principle III**: a CDN file is not compute and incurs nothing while idle.
- **Alternatives**:
  - **Firebase Remote Config**: free, but its SDK has to be bridged into both KMP apps on both platforms, it throttles fetches (12 hours by default), it adds a second place where settings live, and its history is in Firebase rather than git.
  - **A Lambda route** on the shared gateway: a cold start on the launch path, a cost per launch, and a gateway route.
  - **SSM read by the apps**: needs AWS credentials in the app. Impossible.
  - **A file on the customer website (Amplify)**: every change would need a site deploy, and the driver app would depend on the storefront.
  - **Terraform writing the object** (`make apply`): a whole-infrastructure apply for a version bump, and no CloudFront invalidation.

## R3. How settings are changed, checked and recorded (no back-office)

- **Decision**: committed files `config/app-updates/<env>/<app>.json` (with `<env>` = `dev` or `prod` and `<app>` = `customer` or `driver`), published by the operator with `make app-updates ENV=<env>` (an `@effy/edge-ops` script run with `tsx`, like `create-first-admin`).
  - The script refuses to publish when the shared validator rejects the file (FR-017), and when the file has **uncommitted changes**.
  - It uploads with `Content-Type: application/json` and `Cache-Control: public, max-age=60`, records the commit SHA as object metadata, then invalidates the path.
  - `make app-updates-check` (the same validator, no AWS) runs with the guards.
- **Rationale**: git history *is* the audit log (FR-019): who, when, the previous values, and a review if wanted. Refusing uncommitted files guarantees that whatever is live is in history. It matches the operator-runs-it mode of work, and the CDN, the bucket and the distribution id already exist.
- **Alternatives**: a back-office page (excluded by the user); hand-editing S3 objects (no validation, no history).

## R4. Shared logic and contract

- **Decision**: three pieces, held together by one fixture file.
  - **The file shape and the validator** are TypeScript in `@effy/shared-types` (`app-updates.ts`), used by the publish script and the check.
  - **The decision** (settings + build + notice already shown + "Play has an update" → outcome) is written once in Kotlin in `packages/mobile-kit/common/update/`, which both apps already compile through `srcDir`.
  - **The fixtures** `packages/shared-types/src/app-updates.fixtures.json` pin both sides: a TypeScript `decide` exists only to pin the fixtures and is used by tests, and the Kotlin tests embed a copy, which a TypeScript test checks is byte-identical (the repo's pattern for 109 and 116 fixtures).
- **Rationale**: Principle II: one shape and one rule. mobile-kit is already the shared-by-both-apps package (live channel, shell, nav).
- **Alternatives**: copying the decision into each app (prohibited); generating Kotlin from TypeScript (the codegen exists only for customer DTOs and is not needed for one small type).

## R5. Updating on Android

- **Decision**: Google Play In-App Updates (`com.google.android.play:app-update-ktx`).
  - **Mandatory**: an `IMMEDIATE` flow. If the person cancels it, the mandatory screen stays; on resume, an `UPDATE_IN_PROGRESS` flow is resumed.
  - **Optional and notice**: a `FLEXIBLE` flow. An `InstallStateUpdatedListener` shows the "Update downloaded · Restart" bar, which calls `completeUpdate()`.
  - **Play installs only**: used only when the installer is Play (`getInstallSourceInfo(...).installingPackageName == "com.android.vending"`; API < 30: `getInstallerPackageName`) and `appUpdateInfo.updateAvailability() == UPDATE_AVAILABLE` with the type allowed. Otherwise the store page opens (`market://details?id=…`, falling back to the https Play URL).
  - **Staged rollouts (FR-015)**: for optional and notice on a Play install, show the sheet only when Play reports `UPDATE_AVAILABLE`. On a non-Play install (dev or sideloaded), the file alone decides. Mandatory never waits for Play.
- **Rationale**: the person never leaves the app (SC-008), and Play's own availability is the only reliable signal during a staged rollout. The library is free and small.
- **Alternatives**: always opening the Play page (works, but leaves the app and ignores staged rollouts); Play's `inAppUpdatePriority` (set only through the Publishing API, not the console, and Android-only, so it cannot be the one source for both platforms).

## R6. Updating on iPhone

- **Decision**: open the `storeUrl` (`https://apps.apple.com/au/app/id…`) with `UIApplication.shared.open`, which opens the App Store app on Effy's page.
- **Rationale**: Apple has no in-app update API. A phased release only slows automatic updates, and anyone can update by hand, so the prompt works from release day.
- **Alternatives**: `SKStoreProductViewController` (the store page inside the app). For the app itself it can show "Open" instead of "Update", and installing terminates the app that presented it. Rejected.

## R7. The build number

- **Decision** (amended 2026-11-13): each platform has its own version and build number. Android: `versionCode` /
  `versionName` in `version.properties` (BuildKonfig `APP_BUILD` / `APP_VERSION`), raised by `make cm-apk` / `dm-apk`.
  iOS: `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` in `iosApp/Configuration/Version.xcconfig`, raised by
  `make cm-ios-version` / `dm-ios-version`; the app reads them from its installed bundle at run time.
- **Rationale**: the settings already hold numbers per platform, so nothing needs the two to match; and the platforms are
  built and released at different times (Android Studio, Xcode, the stores' separate histories). The first build shared one
  number, which moved iOS's numbers on every Android build.
- **Alternatives**: one shared counter (the first build: simple, but couples the platforms).

## R8. Launch timing and failure

- **Decision**:
  - **The gate**: a shared `AppUpdateGate` state machine sits at each app's root, above the shell. While it is `Checking`, the app draws its launch surface (the same ground and mark as the native splash).
  - **At launch**: start the fetch and wait at most 1.5 s (FR-008), then act on the saved answer, or on none. (The first build also used a saved answer under 3 minutes old at once; the walk showed it swapping one screen for another, so it was removed.) The fetch keeps running up to a 10 s request timeout; a late mandatory answer takes over at once, and a late optional answer or notice is saved for the next launch.
  - **On return to the foreground**: fetch again (one conditional request), and act only on mandatory (FR-006).
  - **Failures**: any parse or validation failure on the phone means "no answer" (fail open) and keeps the saved one (FR-009).
  - **Waiting destinations**: a push tap or link that opened the app waits behind the gate, like the existing pending destination held through sign-in.
- **Propagation (FR-018)**: invalidation makes the edge fresh at once; the 60 s TTL is the fallback; every launch reads the file. So the worst case is about a minute.

## R9. Telemetry

- **Decision**: product events through each app's existing typed `AnalyticsEvent` set:
  - `app_update_prompt_shown {level: mandatory|optional|notice, platform, build}`
  - `app_update_action {level, action: update|later|restart|website|call_dispatch}`
  - `app_update_completed {from_build, to_build}`, logged at the first launch on a new build after a prompt.
  No backend metrics or alarms: there is no backend code. A CloudFront error-rate alarm is not added; a failed read fails open by design.
- **Rationale**: Principle VII: the user-facing flow declares its events; adoption by build is already visible through PostHog's own app-version property.
