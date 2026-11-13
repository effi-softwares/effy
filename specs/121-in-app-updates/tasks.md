---
description: "Task list for 121 - App Updates Inside the App"
---

# Tasks: App Updates Inside the App

**Input**: Design documents from `specs/121-in-app-updates/` (spec.md, plan.md, research.md, data-model.md,
contracts/app-update-settings.md, quickstart.md)

**Tests**: included. The plan makes the fixtures, the validator and the gate state machine the proof of FR-001..FR-020
(Principle II: one rule, pinned on both sides).

**Organization**: by user story. US4 (publishing) comes first after Foundational, because every other story is walked by
publishing a file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md

Short paths used below:
- `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`
- `DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`
- `MK` = `packages/mobile-kit`

---

## Phase 1: Setup

- [X] T001 Create the settings files and their guide.
  - Files: `config/app-updates/dev/customer.json`, `config/app-updates/dev/driver.json`, `config/app-updates/prod/customer.json`, `config/app-updates/prod/driver.json`. Each is `{"schema":1,"ios":{"minimum":0,"recommended":0,"latest":0,"storeUrl":null},"android":{…same…}}`, per contracts/app-update-settings.md.
  - Write `config/app-updates/README.md`:
    - the three levels;
    - a routine release raises **latest** only;
    - **recommended** is for important releases;
    - raise **minimum** only after the Android staged rollout reaches 100% and the iPhone build is live;
    - a minimum that drops phones unable to run the new build locks them out;
    - edit, commit, then `make app-updates ENV=<env>`; never edit the S3 object by hand.
- [X] T002 [P] Add the Play In-App Updates library.
  - Add `play-app-update = { module = "com.google.android.play:app-update-ktx", version = "2.1.0" }` (or the current 2.x) to `apps/customer-mobile/gradle/libs.versions.toml` and `apps/driver-mobile/gradle/libs.versions.toml`.
  - Add `implementation(libs.play.app.update)` to `androidMain.dependencies` in `apps/customer-mobile/shared/build.gradle.kts` and `apps/driver-mobile/shared/build.gradle.kts`.
- [X] T003 [P] Give mobile-kit a shared test folder.
  - Create `packages/mobile-kit/commonTest/update/`.
  - Add `kotlin.srcDir(rootProject.file("../../packages/mobile-kit/commonTest"))` to the `commonTest` source set in both apps' `shared/build.gradle.kts`, next to the existing mobile-kit `srcDir` lines. The customer app needs `kotlinx-coroutines-test` in `commonTest`, which it already has.
  - Document the new `commonTest/` folder in `packages/mobile-kit/README.md` (Layout section).
- [X] T004 [P] Add the new build values.
  - Add `APP_UPDATES_URL` to `apps/customer-mobile/secrets.properties.example` and `apps/driver-mobile/secrets.properties.example`, with a comment: from `make output ENV=<env>`, `app_updates_url_customer` / `app_updates_url_driver`.
  - In `apps/customer-mobile/build.gradle.kts` and `apps/driver-mobile/build.gradle.kts`, make `APP_UPDATES_URL` a required key (the build fails when it is missing, naming it).
  - In the same two files, read `version.properties` and add `APP_BUILD` (the versionCode) and `APP_VERSION` (the versionName) to `extra["effyConfig"]`, so BuildKonfig carries them.

---

## Phase 2: Foundational (blocks every story)

- [X] T005 [P] Create `packages/shared-types/src/app-updates.ts` and export it from `packages/shared-types/src/index.ts`.
  - **Types**: `AppUpdateSettings` and `PlatformSettings`, and `AppUpdateOutcome` = `mandatory | optional | notice | none` (`notice` carries `latest`).
  - **`validateAppUpdateSettings(value: unknown, env: "dev"|"prod", app: "customer"|"driver")`** returns `{ok:true, settings} | {ok:false, errors: string[]}` and enforces contract rules 1–6:
    - `schema === 1`; no unknown keys;
    - every number an integer ≥ 0, with `minimum ≤ recommended ≤ latest`;
    - in prod, `storeUrl` non-null when any value is > 0;
    - the iOS URL regex;
    - the Android URL with the app's own id (or the id plus `.dev`);
    - placeholder store ids refused (`id0+`, anything with `<` or `>`).
  - **`decideAppUpdate({settings, platform, build, noticeShownFor, storeAllows})`**, exactly the data-model.md order. It is the fixture twin.
- [X] T006 [P] Create `packages/shared-types/src/app-updates.fixtures.json`.
  - `decide` cases:
    - every row of data-model.md's table;
    - the boundaries `build == minimum`, `== recommended` and `== latest`;
    - a notice already shown for `latest`, and one shown for an older `latest`;
    - optional and notice with `storeAllows: false`;
    - mandatory with `storeAllows: false` (still mandatory);
    - missing settings → none.
  - `invalid` cases (file, env, app → refused), one per rule in contracts/app-update-settings.md, plus the same null `storeUrl` accepted in dev.
- [X] T007 Create `packages/shared-types/src/app-updates.test.ts` (vitest) covering:
  - every `decide` and `invalid` fixture;
  - the four committed `config/app-updates/*/*.json` files are valid;
  - **parity**: `packages/mobile-kit/commonTest/update/AppUpdateFixture.kt` embeds a JSON string that parses to the same value as `app-updates.fixtures.json`.
- [X] T008 [P] Create `MK/common/update/AppUpdateSettings.kt`.
  - `@Serializable` wire shape, with `parseAppUpdateSettings(json: String): AppUpdateSettings?`.
  - It applies the same rules as T005, without the env-specific `storeUrl` rule.
  - Anything invalid, or an unknown `schema`, returns `null`, so the phone fails open (FR-009).
- [X] T009 [P] Create `MK/common/update/AppUpdateDecision.kt`.
  - `enum Platform { Ios, Android }`.
  - `sealed interface AppUpdateOutcome { Mandatory; Optional; data class Notice(val latest: Int); None }`.
  - `fun decideAppUpdate(settings: AppUpdateSettings?, platform: Platform, build: Int, noticeShownFor: Int?, storeAllows: Boolean): AppUpdateOutcome`, per data-model.md.
- [X] T010 [P] Create `MK/common/update/AppUpdateStore.kt`.
  - The port: `interface AppUpdateStore { fun getString(key: String): String?; fun putString(key: String, value: String) }`.
  - `@Serializable SavedAnswer(body: String, etag: String?, fetchedAtEpochMs: Long)`.
  - Key constants: `app_update.saved` and `app_update.notice_shown_for`.
- [X] T011 Create `MK/common/update/AppUpdateRepository.kt`.
  - Constructor: `AppUpdateRepository(client: HttpClient, url: String, store: AppUpdateStore, now: () -> Long)`.
  - `suspend fun fetch(): AppUpdateSettings?`:
    - GET with `If-None-Match` from the saved ETag, with a 10 s request timeout;
    - `200` → parse; if valid, save body, ETag and now; return the settings;
    - `304` → refresh `fetchedAt` and return the saved settings;
    - anything else, or an exception → `null`, leaving the saved answer untouched.
  - `fun saved(): Pair<AppUpdateSettings, Long>?`.
  - `fun noticeShownFor(): Int?` and `fun markNoticeShown(latest: Int)`.
- [X] T012 Create `MK/common/update/StoreUpdater.kt`.
  - `interface StoreUpdater`:
    - `val platform: Platform`;
    - `suspend fun isStoreInstall(): Boolean`;
    - `suspend fun updateAvailable(): Boolean?` (null = unknown);
    - `fun startImmediate(): Boolean`;
    - `fun startFlexible(onDownloaded: () -> Unit): Boolean`;
    - `fun completeFlexible()`;
    - `fun openStore(storeUrl: String?)`.
  - `fun leaveApp()` as a member (built that way: the Android one needs the attached activity, so a no-argument `expect` could not reach it).
  - Both `start…` functions return false when not possible; the caller then calls `openStore`.
- [X] T013 Create `MK/common/update/AppUpdateGate.kt`, the process-scoped state machine from data-model.md.
  - **Constructor**: repository, StoreUpdater, `build: Int`, `now`, and a `CoroutineScope`.
  - **State**: `state: StateFlow<GateState>` with `Checking`, `Mandatory`, `Optional`, `Notice(latest)` and `Passed`.
  - **`onLaunch()`**:
    - runs once per process;
    - start the fetch;
    - with a saved answer under 3 minutes old, decide from it at once;
    - otherwise `withTimeoutOrNull(1500)` the fetch, then decide from the fetched answer, else the saved one, else `Passed`;
    - on Android, when `isStoreInstall()`, `storeAllows` comes from `updateAvailable()` capped at 1 s (unknown → false), and mandatory ignores it;
    - a fetch that finishes later and gives `Mandatory` moves to `Mandatory`; a late optional or notice result is only saved.
  - **`onForeground()`**: fetch again; act only on `Mandatory` (FR-006).
  - **`later()`** and **`dismiss()`** go to `Passed`.
  - **Notice**: `markNoticeShown(latest)` is called on entering `Notice`.
  - No `delay` loops (`scripts/check-no-refresh-timers.sh`).
- [X] T014 [P] Create the fixture tests.
  - `MK/commonTest/update/AppUpdateFixture.kt`: an embedded raw-string copy of `packages/shared-types/src/app-updates.fixtures.json`, with a header comment saying T007 checks it.
  - `MK/commonTest/update/AppUpdateDecisionTest.kt`:
    - every `decide` fixture gives the same outcome;
    - every `invalid` fixture without the env rule makes `parseAppUpdateSettings` return null.
- [X] T015 Create `MK/commonTest/update/AppUpdateGateTest.kt` with a fake clock, a fake HTTP engine (Ktor `MockEngine`) and an in-memory store. It covers:
  - a fresh saved answer → decided without waiting;
  - a slow fetch → `Passed` after 1.5 s with no saved answer, or the saved answer;
  - a late mandatory takes over from `Passed`;
  - foreground acts on mandatory only;
  - the notice is shown once, and again for a higher latest;
  - a 304 refreshes `fetchedAt`;
  - a broken body → fail open, with the saved answer kept;
  - a saved mandatory while offline → `Mandatory`;
  - `onLaunch` twice in one process → one decision.
- [X] T016 [P] Create `MK/android/update/StoreUpdater.android.kt`: `AndroidStoreUpdater(context, activity: () -> ComponentActivity?, packageName, storeUrl)`.
  - **Store install**: `isStoreInstall` uses `getInstallSourceInfo(pkg).installingPackageName == "com.android.vending"` on API ≥ 30, else `getInstallerPackageName`.
  - **Availability**: `updateAvailable` uses `AppUpdateManagerFactory.create(context).appUpdateInfo` (await), returning `UPDATE_AVAILABLE`.
  - **Immediate**: `startImmediate` calls `startUpdateFlowForResult(info, launcher, AppUpdateOptions.newBuilder(IMMEDIATE).build())`. The launcher is a `registerForActivityResult(StartIntentSenderForResult)` registered by the activity (T020/T021). A resume hook re-starts an update in state `DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS`.
  - **Flexible**: `startFlexible` registers an `InstallStateUpdatedListener` and calls `onDownloaded` at `DOWNLOADED`; `completeFlexible` calls `completeUpdate()`.
  - **Store page**: `openStore` uses `market://details?id=` and falls back to the https URL; with no `storeUrl`, it does nothing.
  - **`leaveApp()`**: `activity()?.moveTaskToBack(true)`.
- [X] T017 [P] Create `MK/ios/update/StoreUpdater.ios.kt`: `IosStoreUpdater(storeUrl)`.
  - `isStoreInstall` returns false, so the store never gates.
  - `startImmediate` and `startFlexible` return false.
  - `openStore` calls `UIApplication.sharedApplication.openURL(NSURL(string = storeUrl))`.
  - `leaveApp()` is a no-op (there is no system back on iPhone).
- [X] T018 Give iOS the same version numbers.
  - Extend `scripts/bump-version.sh` so that, after updating `version.properties`, it writes `iosApp/Configuration/Version.xcconfig` (`MARKETING_VERSION = <versionName>`, `CURRENT_PROJECT_VERSION = <versionCode>`) in the same app folder.
  - Create `apps/customer-mobile/iosApp/Configuration/Version.xcconfig` and `apps/driver-mobile/iosApp/Configuration/Version.xcconfig` with the current values (customer 1.0.2 / 3; driver 1.0.2 / 3).
  - In both `Config.xcconfig` files, replace the `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` lines with `#include "Version.xcconfig"`.
- [X] T019 Add `make cm-version` and `make dm-version` (`[BUMP=patch|minor|major]`) to `Makefile`. They run `scripts/bump-version.sh` on the app's `version.properties` only (no Gradle), for use before an Xcode archive, and print "commit version.properties and Version.xcconfig".
- [X] T020 Wire the customer app.
  - `CM/core/storage/AppUpdateStoreAdapter.kt`: `AppUpdateStore` over `DevicePreferences`.
  - In `CM/app/AppContainer.kt`, build one plain Ktor `HttpClient` for the absolute URL (no auth, no base URL), `AppUpdateRepository(…, BuildKonfig.APP_UPDATES_URL, …)`, the platform `StoreUpdater` (through an `expect fun createStoreUpdater(): StoreUpdater` in the app's iosMain and androidMain), and `AppUpdateGate(build = BuildKonfig.APP_BUILD.toInt())`.
  - In the customer Android `MainActivity`, register the `StartIntentSenderForResult` launcher, expose the activity to `AndroidStoreUpdater`, and call its resume hook from `onResume`.
- [X] T021 Wire the driver app, the same as T020.
  - `DM/core/offline/AppUpdateStoreAdapter.kt` (over multiplatform-settings `Settings`).
  - `DM/app/AppContainer.kt`, the driver Android `MainActivity`, and the iosMain/androidMain `createStoreUpdater`.

**Checkpoint**: `pnpm --filter @effy/shared-types test` and `./gradlew :shared:allTests` pass in both apps.

---

## Phase 3: User Story 4 - The developers change the settings without a release (P1)

**Goal**: a validated, recorded publish of each environment's files to the CDN.
**Independent test**: quickstart prerequisites 1–3, then `make app-updates-check` refuses each invalid case.

- [X] T022 [P] [US4] Serve the settings from the CDN in `infra/envs/dev/media.tf`.
  - Add `aws_cloudfront_cache_policy.app_updates` (`min_ttl 0`, `default_ttl 60`, `max_ttl 60`, path-only key, gzip and brotli on).
  - Add `aws_cloudfront_response_headers_policy.app_updates` (`Cache-Control: public, max-age=60`, override; no CORS).
  - Add an `ordered_cache_behavior` for `path_pattern = "/app-updates/*"` on `aws_cloudfront_distribution.media` (GET/HEAD, `redirect-to-https`, `compress = true`).
  - Add a second statement `CdnReadsAppUpdateSettings` to `data.aws_iam_policy_document.product_media` (`s3:GetObject` on `${arn}/app-updates/*`, the same SourceArn condition). Leave `local.public_media_prefixes` unchanged.
  - Add `aws_ssm_parameter` resources `/effy/${var.env}/app_updates/bucket` and `/effy/${var.env}/app_updates/distribution_id`, plus outputs `app_updates_url_customer` / `app_updates_url_driver` (`https://${local.media_host}/app-updates/<app>.json`).
  - Run `terraform fmt` and `terraform validate` only. The operator applies it.
- [X] T023 [US4] Create `apis/edge-api/ops/src/publish-app-updates.ts`, the CLI `check | publish --env <dev|prod> [--app customer|driver]`.
  - **Validate**: read `config/app-updates/<env>/<app>.json` and validate with `validateAppUpdateSettings` (T005).
  - **`check`**: validate every env and app and exit non-zero on any error.
  - **`publish`**:
    - refuse when `git status --porcelain -- <file>` is not empty;
    - read the SSM `/effy/<env>/media/bucket` (086's, reused), `/effy/<env>/app_updates/distribution_id` and `/effy/<env>/media/public_base_url`;
    - put the object at `app-updates/<app>.json` with `ContentType application/json`, `CacheControl public, max-age=60` and `Metadata {commit: <HEAD sha>}`;
    - invalidate `/app-updates/*`;
    - print the URL and a `curl -sI` line.
  - **AWS**: use AWS SDK v3 clients if `apis/edge-api/ops/package.json` already depends on them, otherwise the `aws` CLI through `execFile`. `AWS_PROFILE` is honoured.
  - Keep the logic in testable functions, with git and AWS injected.
- [X] T024 [US4] Create `apis/edge-api/ops/src/publish-app-updates.test.ts` (vitest). It covers:
  - an invalid file → refused, with nothing sent;
  - an uncommitted file → refused;
  - an unknown env → refused;
  - a valid one → put, then invalidate, in that order, with the right headers and metadata;
  - `check` over the committed files passes.
- [X] T025 [US4] Add the `Makefile` targets.
  - `app-updates-check` runs `pnpm --filter @effy/edge-ops exec tsx src/publish-app-updates.ts check`.
  - `app-updates`, given `ENV=` (required) and optional `APP=`, runs `publish` with `AWS_PROFILE=ef`, behind the same `preflight` account check the `apply` target uses.
  - Both get `##` help lines.
- [X] T026 [P] [US4] Update the docs to the built design.
  - `docs/store-submission/distribution-plan.md`, section "The in-app update check": the three levels, the CDN file, `make app-updates`. Remove the back-office, the 426 refusal, the Messages filter and the store-page destination, which are not built. "How users are told about an update" item 3 (Messages) becomes "manual Messages announcements, no build filter".
  - `docs/store-submission/publishing-runbook.md`: Phase 0.3 now points at 121. In Phase 4, steps 7 and 9 become "edit `config/app-updates/<env>/<app>.json`, commit, `make app-updates ENV=prod`", and the iOS build step uses `make cm-version` / `make dm-version`.

**Checkpoint**: after the operator's apply and publish, `curl` returns 200, then a 304 with `If-None-Match`.

---

## Phase 4: User Story 1 - A build that no longer works is stopped (P1) 🎯 MVP

**Goal**: below `minimum`, only the mandatory screen is reachable, on all four apps.
**Independent test**: quickstart walk rows 5–8.

- [X] T027 [P] [US1] Add the customer analytics events in `CM/core/observability/AnalyticsEvent.kt`:
  - `AppUpdatePromptShown(level, platform, build)`;
  - `AppUpdateAction(level, action: update|later|restart|website|call_dispatch)`;
  - `AppUpdateCompleted(fromBuild, toBuild)`.
  Use the file's existing naming and consent pattern.
- [X] T028 [P] [US1] Add the same three events to `DM/core/observability/AnalyticsEvent.kt`.
- [X] T029 [P] [US1] Create `CM/features/appupdate/AppUpdateScreens.kt`.
  - `AppUpdateLaunchSurface`: the splash ground and mark, matching the native launch screen in light and dark.
  - `MandatoryUpdateScreen`: a full screen built from customer-kit parts (`EffyButtons`, `EffyFoundation`), with the words from spec.md "Words".
  - Primary action: **Update now**, shown only when a store page or an in-app update exists.
  - Secondary action: "Shop on effyshopping.com", which opens `https://<WEB_SITE_HOST>` and is hidden when `WEB_SITE_HOST` is blank.
  - No centred dialog and no colour literals (`scripts/mobile-guard.sh`).
- [X] T030 [US1] Create `CM/features/appupdate/AppUpdateViewModel.kt`.
  - Exposes an immutable UI state from `AppUpdateGate.state` plus the analytics level.
  - `updateNow()`: `startImmediate()`, else `openStore()`.
  - `openWebsite()`.
  - Sends `AppUpdatePromptShown` once per state entry and `AppUpdateAction` per choice.
  - `AppUpdateCompleted` is sent at launch when the saved last-prompted build is below `APP_BUILD`; store the last-prompted build with the same `AppUpdateStore`.
- [X] T031 [US1] Put the gate in `CM/app/App.kt`.
  - Render the gate inside the root `Surface` and **below** the existing root effects (session bootstrap, push routing), and **above** intro, sign-in and `CustomerShell`.
  - `Checking` draws `AppUpdateLaunchSurface`; `Mandatory` draws `MandatoryUpdateScreen` with `BackHandler(enabled = true) { leaveApp() }`; `Passed` draws the existing tree.
  - Hold `pendingOpen` (the push/link destination) until `Passed`; under `Mandatory` it is not delivered.
  - Call `gate.onLaunch()` from a root `LaunchedEffect`.
- [X] T032 [US1] Call `container.appUpdateGate.onForeground()` when the customer app returns to the foreground, using the existing app-lifecycle signal the live channel uses (`MK/common/live/LiveLifecycle.kt` or the app's equivalent). Never a timer.
- [X] T033 [P] [US1] Create `DM/features/appupdate/AppUpdateScreens.kt`, the same as T029 in the driver kit (`DriverFoundation`, `DriverButtons`).
  - The secondary action is **Call dispatch**, dialing `DISPATCH_PHONE` the way `DM/features/account/HelpScreen.kt` does, and hidden when it is blank.
  - Must pass `scripts/driver-guard.sh`.
- [X] T034 [US1] Create `DM/features/appupdate/AppUpdateViewModel.kt`, the same as T030 with `callDispatch()`.
- [X] T035 [US1] Put the gate in `DM/app/App.kt`, the same as T031.
  - ⚠ The gate goes **below** the root `LaunchedEffect`s that call `container.syncCoordinator.flush()` (at launch and on connectivity return). Those keep running under the mandatory screen (spec edge case: driver work recorded without signal).
  - Hold `container.pendingOpen` until `Passed`.
- [X] T036 [US1] Add the driver foreground call, the same as T032.

**Checkpoint**: quickstart rows 5–8 on Android and iOS for both apps.

---

## Phase 5: User Story 2 - An important update is asked for at every launch (P1)

**Goal**: below `recommended`, a sheet before Home at every launch; Later carries on.
**Independent test**: quickstart row 4.

- [X] T037 [US2] Extend `MK/common/update/AppUpdateGate.kt`.
  - Add `download: StateFlow<FlexibleDownload>` (`Idle`, `Downloading`, `Downloaded`).
  - `updateNow(outcome)`:
    - Optional or Notice: `startFlexible { download = Downloaded }`, then `Passed`; when it cannot start, `openStore`, then `Passed`;
    - Mandatory: `startImmediate`, else `openStore`, staying `Mandatory`.
  - `restart()` calls `completeFlexible()`.
  - Add cases to `MK/commonTest/update/AppUpdateGateTest.kt`: Later → `Passed`; a second process launch → `Optional` again; flexible not possible → store opened and `Passed`.
- [X] T038 [P] [US2] Add the customer sheet and bar.
  - In `CM/features/appupdate/AppUpdateScreens.kt`, add `UpdateSheet` over `AppUpdateLaunchSurface` using `EffySheet`: title, text, **Update now** (hidden with no store page and no in-app update), **Later**; dismissing counts as Later.
  - Add `UpdateDownloadedBar` ("Update downloaded" · **Restart**, in the `EffySnackbar` style), drawn by the gate overlay in `CM/app/App.kt` above the shell whenever `download == Downloaded`.
  - Wire `later()`, `updateNow()` and `restart()` through `AppUpdateViewModel`, with analytics.
- [X] T039 [P] [US2] Add the same sheet and bar to the driver app: `DriverSheet` and the `DriverSnackbar` style in `DM/features/appupdate/AppUpdateScreens.kt`, the overlay in `DM/app/App.kt`, and the ViewModel actions.

**Checkpoint**: quickstart row 4; on a sideloaded Android build or an iPhone, Update now opens the store.

---

## Phase 6: User Story 3 - A routine update is mentioned once (P2)

**Goal**: below `latest`, the sheet once per latest build.
**Independent test**: quickstart rows 2–3.

- [X] T040 [P] [US3] Customer: render `GateState.Notice` with the same `UpdateSheet` (`level = notice` in analytics) in `CM/features/appupdate/AppUpdateScreens.kt` / `AppUpdateViewModel.kt`. Confirm, with a ViewModel test in `MK/commonTest/update/AppUpdateGateTest.kt`, that the notice is marked shown when it is **shown**, not when it is dismissed.
- [X] T041 [P] [US3] Driver: the same in `DM/features/appupdate/`.

**Checkpoint**: quickstart rows 2–3.

---

## Phase 7: User Story 5 - People can see their version and that an update exists (P3)

**Goal**: Account shows the version, and "Update available" when optional or notice applies.
**Independent test**: quickstart row 10.

- [X] T042 [US5] Add `available: StateFlow<Boolean>` to `MK/common/update/AppUpdateGate.kt`. It is true when the last decision (before Later or dismiss) was Optional or Notice, and stays true after Later. Add a test in `AppUpdateGateTest.kt`.
- [X] T043 [P] [US5] Customer: in `CM/features/account/presentation/AccountScreens.kt`, add a version row "Version <APP_VERSION> (<APP_BUILD>)" at the foot of Account using the kit's row component, and an "Update available" row shown while `available` is true. Its action is the same as Update now, with `AppUpdateAction(action = update)`.
- [X] T044 [P] [US5] Driver: the same in `DM/features/account/AccountScreen.kt`.

---

## Phase 8: Polish & cross-cutting

- [X] T045 [P] Create `scripts/check-app-versions.sh`. It fails when either app's `iosApp/Configuration/Version.xcconfig` differs from its `version.properties`. Call it from the `app-updates-check` make target.
- [X] T046 Run every check and fix what fails:
  - `pnpm --filter @effy/shared-types test`;
  - `pnpm --filter @effy/edge-ops test` (unit only);
  - `make app-updates-check`;
  - `cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug`;
  - the same for `apps/driver-mobile`;
  - `bash scripts/mobile-guard.sh`, `bash scripts/driver-guard.sh`, `bash scripts/check-no-refresh-timers.sh`;
  - `terraform -chdir=infra/envs/dev validate`;
  - an iOS simulator build of both apps (`xcodebuild … -destination 'platform=iOS Simulator,name=<a simulator>' build`).
- [X] T047 [P] Record the feature.
  - `FEATURE-HISTORY.md`: a 121 entry at the top (what changed, files, checks run, operator steps).
  - `CLAUDE.md`: a "121-in-app-updates" line in "Features recorded", and one ⚠ line in "Mobile apps" saying update prompts come from `config/app-updates/<env>/<app>.json` via `make app-updates`, that a routine release raises only `latest`, and that `minimum` is raised only after a full rollout.
  - Mark spec.md Status "Built".
- [X] T048 Hand the operator steps over (in the FEATURE-HISTORY entry and the final message):
  1. `make apply ENV=dev`
  2. `make app-updates ENV=dev`
  3. Add `APP_UPDATES_URL` to both `secrets.properties`
  4. `make cm-apk` / `make dm-apk` and the Xcode builds
  5. The quickstart walk
  6. Commit `version.properties` and `Version.xcconfig`

---

## Dependencies & execution order

- **Setup (T001–T004)** → **Foundational (T005–T021)** → the stories.
- Inside Foundational:
  - T005 → T006 → T007;
  - T008–T010 → T011 → T013 → T015;
  - T012 → T013, T016, T017;
  - T014 needs T006 and T009;
  - T020 and T021 need T011–T017 and T004.
- **US4 (T022–T026)** needs T005. It does not need the app code, but every walk of US1–US3 needs US4 published.
- **US1 (T027–T036)** needs Foundational. The customer (T029–T032) and driver (T033–T036) tracks run in parallel.
- **US2 (T037–T039)** needs US1's screens and placement (T031, T035).
- **US3 (T040–T041)** needs US2's sheet.
- **US5 (T042–T044)** needs Foundational and can run alongside US2/US3.
- **Polish (T045–T048)** comes last.

## Parallel examples

```
Foundational:  T005 ‖ T008 ‖ T009 ‖ T010   then  T016 ‖ T017   then  T020 ‖ T021
US4:           T022 ‖ T026   (T023 → T024 → T025)
US1:           T027 ‖ T028 ‖ T029 ‖ T033   then customer T030→T031→T032 ‖ driver T034→T035→T036
US2:           T038 ‖ T039   (after T037)
US5:           T043 ‖ T044   (after T042)
```

## Implementation strategy

1. **MVP**: Setup + Foundational + US4 + US1. Every build carries the gate, and the developers can stop an old build. This is the part that must be in the first store builds.
2. Add US2 (the every-launch sheet and Android flexible download), then US3 (the once-only notice). Both reuse the same sheet.
3. US5 (the Account rows) and Polish.
4. Things that are not proven until the apps are in the stores, and are recorded as such in FEATURE-HISTORY:
   - the store-only checks in quickstart.md (Play immediate/flexible, staged rollout);
   - the production files and infrastructure.
