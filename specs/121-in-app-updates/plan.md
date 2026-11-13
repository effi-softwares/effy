# Implementation Plan: App Updates Inside the App

**Branch**: `121-in-app-updates` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/121-in-app-updates/spec.md`

## Summary

The customer and driver apps (iOS and Android) check, before Home, a small public settings file for their app and
environment, and decide one of four outcomes from their own build number: **mandatory** (a full screen),
**optional** (a sheet at every launch), **notice** (a sheet once per latest build) or **none**.

- **Where the file lives**: on the existing media CDN (`media.<zone>/app-updates/<app>.json`), with a 60-second cache and
  conditional requests, so a launch costs one tiny edge request and nothing server-side.
- **How it is changed**: the developers edit committed files and publish them with `make app-updates ENV=<env>`. That
  validates the file, refuses uncommitted changes, uploads and invalidates. git is the audit log; there is no back-office.
- **One rule, both apps**: the decision is written once in Kotlin in `packages/mobile-kit` and pinned to fixtures shared
  with a TypeScript twin of the validator.
- **Update now**: Android uses Google Play In-App Updates (immediate for mandatory, flexible for the others, and Play's
  own availability check for staged rollouts); iPhone opens the App Store app.
- **Build numbers**: iOS starts taking its build number from `version.properties`, like Android.

Research and alternatives: [research.md](./research.md).

## Technical Context

**Language/Version**:
- Kotlin 2.4.0 / Compose Multiplatform 1.11.1 (both apps, `packages/mobile-kit`).
- TypeScript (Node 22): `@effy/shared-types` and the `@effy/edge-ops` publish script.
- Terraform: the media CDN.

**Primary Dependencies**:
- **New**: `com.google.android.play:app-update-ktx` (androidMain only, both apps).
- **Existing**:
  - Ktor client (its own absolute-URL client, no auth plugin);
  - kotlinx.serialization;
  - each app's own key-value store, behind a small `AppUpdateStore` port (customer: `DevicePreferences`, since it does
    **not** use multiplatform-settings; driver: multiplatform-settings `Settings`, as `OfflineQueue` does);
  - BuildKonfig;
  - each app's analytics driver;
  - AWS CLI (publish).

**Storage**:
- No database.
- One S3 object per app per environment in the existing media bucket, under the new `app-updates/` prefix.
- On the phone: two keys in the app's key-value store.

**Testing**:
- vitest (`@effy/shared-types`: the validator, `decide` fixtures, Kotlin-copy parity; `@effy/edge-ops`: the publish
  script's refusals).
- Kotlin tests written **once** in a new `packages/mobile-kit/commonTest/`, added to both apps' `commonTest` through
  `srcDir` (mobile-kit has no test sources today): `decide` against the fixtures, and the gate state machine with a fake
  clock, fetcher and store.
- `scripts/mobile-guard.sh`, `scripts/driver-guard.sh`.
- A walk per [quickstart.md](./quickstart.md).

**Target Platform**: Android minSdk 24 / target 36; iOS 18.2+.

**Project Type**: mobile apps, plus a static file on the CDN, plus an operator script. No new service.

**Performance Goals**:
- At most 1.5 s added to a launch (the CDN usually answers in tens of milliseconds).
- A published change reaches phones in under 5 minutes.

**Constraints**:
- Fail open on any failed or unreadable check, except a saved mandatory answer.
- No timers (`check-no-refresh-timers.sh`).
- No sign-in needed to read the file.

**Scale/Scope**:
- Every launch and every return to the foreground of both apps: about 1 request each, mostly `304`.
- 4 apps; 2 files per environment.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: still passing.*

| Principle | Status | How |
|---|---|---|
| **I. Spec-driven** | ✅ | spec → this plan → tasks. The spec has no technology in it. |
| **II. Shared contracts** | ✅ | One file shape and validator (`@effy/shared-types/app-updates.ts`). One decision in `packages/mobile-kit/common/update/`, compiled into both apps. `app-updates.fixtures.json` pins the TypeScript and Kotlin `decide`, and the Kotlin copy is checked byte-for-byte. |
| **III. Single serverless backend** | ✅ | **No service, no route, no gateway.** A static object on the existing CDN is not compute and costs nothing while idle. The two gateways are untouched (staff 253/300). |
| **IV. Auth isolation** | ✅ | The file is public and carries nothing personal or audience-specific beyond which app it is for; no pool is involved. The publish runs on operator AWS credentials (`AWS_PROFILE=ef`). |
| **V. Design** | ✅ | Customer: the full screen and `EffySheet` from the customer kit (no centred dialog, no Material control the kit replaces, light and dark). Driver: its own kit. Words: one set per app, with no Effy address but `hello@` (no address is used). No card layouts. |
| **VI. Layers** | ✅ | `AppUpdateRepository` (fetch, ETag, saved answer: data) → `decideAppUpdate` (pure domain) → `AppUpdateGate` / a ViewModel exposing immutable state (presentation). Platform update actions sit behind an `expect`/`actual` `StoreUpdater`. Wired by hand in each app's `AppContainer`. |
| **VII. Telemetry** | ✅ | Events: `app_update_prompt_shown`, `app_update_action`, `app_update_completed` (research R9). No backend metrics or alarms: there is no backend code. |
| **Real-world identifiers** | ✅ | Store URLs are operator-supplied; the validator refuses placeholders and another app's id. The files ship with `storeUrl: null` and zeros. |
| **Mode of work** | ✅ | Claude writes Terraform, the script and the files; the operator runs `make apply`, `make app-updates` and the walks. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/121-in-app-updates/
├── spec.md
├── plan.md               # this file
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/app-update-settings.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
config/app-updates/                       # NEW - the settings, committed; the audit log is git
├── README.md                             # when to raise each value (FR-016: staged rollouts, old phones)
├── dev/customer.json
├── dev/driver.json
├── prod/customer.json                    # zeros + null until the stores exist
└── prod/driver.json

packages/shared-types/src/
├── app-updates.ts                        # NEW - AppUpdateSettings type, validateAppUpdateSettings, decideAppUpdate (fixture twin)
├── app-updates.fixtures.json             # NEW - decide cases + invalid-file cases
└── app-updates.test.ts                   # NEW - fixtures; Kotlin copy byte-identical

apis/edge-api/ops/src/
├── publish-app-updates.ts                # NEW - check | publish ENV [APP]: validate, refuse dirty, s3 put, invalidate
└── publish-app-updates.test.ts           # NEW

packages/mobile-kit/
├── common/update/                        # NEW - shared by both apps
│   ├── AppUpdateSettings.kt              #   wire shape + the same validation (invalid → null)
│   ├── AppUpdateDecision.kt              #   decideAppUpdate → Outcome
│   ├── AppUpdateRepository.kt            #   GET with If-None-Match; SavedAnswer; NoticeShown (via AppUpdateStore)
│   ├── AppUpdateStore.kt                 #   port: getString / putString - each app adapts its own store
│   ├── AppUpdateGate.kt                  #   state machine: launch wait, late mandatory, foreground re-check
│   └── StoreUpdater.kt                   #   expect: canUpdateInApp / updateAvailable / startImmediate / startFlexible / openStore
├── commonTest/update/                    # NEW - srcDir'd into both apps' commonTest
│   ├── AppUpdateFixture.kt               #   embedded copy of app-updates.fixtures.json (TS test checks it byte-for-byte)
│   ├── AppUpdateDecisionTest.kt
│   └── AppUpdateGateTest.kt
├── android/update/StoreUpdater.android.kt  # NEW - Play In-App Updates; installer check; market:// fallback
└── ios/update/StoreUpdater.ios.kt          # NEW - UIApplication.open(storeUrl)

apps/customer-mobile/
├── build.gradle.kts                      # APP_UPDATES_URL required; APP_BUILD / APP_VERSION from version.properties
├── secrets.properties.example            # APP_UPDATES_URL
├── shared/build.gradle.kts               # app-update-ktx (androidMain)
├── shared/src/commonMain/.../features/appupdate/
│   ├── AppUpdateScreens.kt               # mandatory full screen, the EffySheet, the "downloaded · Restart" bar, wording
│   └── AppUpdateViewModel.kt
├── shared/src/commonMain/.../app/        # root: the gate above the shell; pending destination held behind it
├── shared/src/commonMain/.../features/account/presentation/AccountScreens.kt   # version row + "Update available"
├── shared/src/commonMain/.../core/observability/AnalyticsEvent.kt              # three events
└── iosApp/Configuration/{Config.xcconfig, Version.xcconfig}   # Version.xcconfig: iOS's own numbers, included

apps/driver-mobile/                       # the same set, in the driver's kit; "Call dispatch" from DISPATCH_PHONE
scripts/bump-ios-version.sh               # NEW - iOS's numbers only (bump-version.sh stays Android only)
infra/envs/dev/media.tf                   # app-updates behaviour, cache + headers policies, bucket statement
infra/envs/dev/outputs (+ SSM)            # app_updates_url_<app>, /effy/dev/app_updates/distribution_id (bucket: 086's /effy/dev/media/bucket)
Makefile                                  # app-updates, app-updates-check
docs/store-submission/{distribution-plan.md, publishing-runbook.md}   # point at the new targets
```

**Structure Decision**:
- **Shared logic** lives in `packages/mobile-kit`, the package both KMP apps already compile through `srcDir` (`common` / `android` / `ios`).
- **Each app's own UI** stays in the app, because each has its own kit.
- **The settings files** live in a new top-level `config/app-updates/`. They are per environment like tfvars, but they are not Terraform, so `make apply` never publishes them.
- **The publish script** lives in `@effy/edge-ops`, the existing home of operator scripts run with `tsx`.

## Design notes

1. **The launch gate**
   - It sits at the root of each app, above the shell and the sign-in flow, so guests are covered too.
   - It sits **below** the root effects that must keep running. ⚠ The driver app's `App.kt` flushes the offline queue
     (`syncCoordinator.flush()`) in root `LaunchedEffect`s at launch and when the connection returns. Those stay above
     the gate, so work recorded without signal is still sent while the mandatory screen shows (spec edge case). The
     queue lives in the app's storage, which an update keeps.
   - Its state lives in the process (it is created in `AppContainer`), not in a composable, so turning the phone or
     recreating the Activity never shows the sheet again. A "launch" (FR-005) is the first gate run in a process.
   - The "Update downloaded · Restart" bar is drawn by the gate's own overlay above the shell, so it appears on whatever
     screen the person is on.
   - Mandatory: the platform back action leaves the app (Android `moveTaskToBack(true)` through the existing
     back-handler bridge), never popping to what is behind.
   - While `Checking`, the app draws the launch surface (the splash ground and mark), so going from the native splash to the gate shows no flash.
   - A push tap or link that opened the app waits behind the gate (the same pending-destination holder 109 uses through sign-in) and is delivered once the gate is `Passed`.
2. **Timing** (the wait is `withTimeoutOrNull(1500)`; there is no `delay` loop, so `check-no-refresh-timers.sh` stays green)
   - The gate waits for the real answer, at most 1.5 s, then uses the saved one (amended after the first walk).
   - The request has a 10 s timeout and its result is always saved.
   - On return to the foreground (the existing `LiveLifecycle`-style app lifecycle signal), the gate re-fetches and acts only on mandatory. This is a lifecycle event, not a timer.
3. **The notice** is recorded when shown (`notice_shown_for = latest`), not when dismissed.
4. **Android**
   - `StoreUpdater.android` keeps one `AppUpdateManager` per process.
   - **Mandatory**: if the app was installed from Play and Play has the update, run `IMMEDIATE`. On resume, if `DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS`, resume it. If it is cancelled, the mandatory screen stays.
   - **Optional / notice**: if the app was installed from Play and the update is available and `FLEXIBLE` is allowed, start a flexible download. A listener raises `Downloaded`, which shows the bar; Restart calls `completeUpdate()`.
   - **Otherwise**: `market://details?id=<pkg>` → the https Play URL from the file. With no `storeUrl` (dev only, FR-017),
     Update now is not offered.
   - **The store gate on optional and notice (R5)**: the gate asks `updateAvailable()` only for Play installs, with a 1 s cap within the 1.5 s launch wait. If the answer is unknown in time, the sheet is not shown and is tried again at the next launch.
5. **iPhone**: `UIApplication.sharedApplication.openURL(storeUrl)` (the App Store app opens on Effy's page). A null `storeUrl` (allowed in dev only) hides Update now on every screen; in prod the validator refuses it whenever a
   value is above zero.
6. **The way out on the mandatory screen**
   - Customer: open the website (`https://<WEB_SITE_HOST>`; hidden if unset).
   - Driver: dial `DISPATCH_PHONE` (hidden if unset).
7. **Version numbers** (amended 2026-11-13: the platforms are numbered independently)
   - Android: `version.properties` → BuildKonfig `APP_BUILD` / `APP_VERSION`; raised by `make cm-apk` / `dm-apk`.
   - iOS: `iosApp/Configuration/Version.xcconfig` (included by `Config.xcconfig`), raised only by `make cm-ios-version` /
     `dm-ios-version` (`scripts/bump-ios-version.sh`) before an archive. The app reads its build from the installed bundle
     (`installedVersionOrNull`, mobile-kit), so Xcode's real numbers are compared even if someone set them in Xcode.
   - `scripts/check-app-versions.sh` checks both files are well formed and that the Xcode project carries no numbers of its own.
8. **Publish script** (`publish-app-updates.ts`)
   - It reads the bucket from SSM `/effy/<env>/media/bucket` (086's) and the distribution id from `/effy/<env>/app_updates/distribution_id`.
   - It runs `git status --porcelain -- <file>` and refuses if dirty.
   - It runs `aws s3api put-object` with content type, cache control and `commit` metadata, then `aws cloudfront create-invalidation --paths "/app-updates/*"`.
   - It prints the URL and a `curl` check. ENV must be a known env; `AWS_PROFILE=ef` is honoured.

## Deploy order (operator)

1. `make apply ENV=dev` (media.tf: behaviour, policies, bucket statement, outputs and SSM).
2. `make app-updates ENV=dev` (publishes the all-zero files).
3. Add `APP_UPDATES_URL` to both apps' `secrets.properties`; build and install (`make cm-apk`, `make dm-apk`, Xcode).
4. Walk the quickstart.
5. Prod: the same steps when the prod environment is built (publishing-runbook.md 0.1). The prod files stay at zeros until the store ids exist.

## Complexity Tracking

None.
