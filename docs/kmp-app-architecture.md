# KMP App Blueprint — Stack, Architecture & Folder Structure

A reusable reference for building a **Kotlin Multiplatform + Compose Multiplatform** app (Android + iOS,
one shared UI) with **Clean Architecture + MVVM**, no DI framework, and native auth/telemetry SDKs
bridged behind interfaces.

Replace `<org>` / `<app>` with your own names (package root: `com.<org>.<app>.mobile`).

---

## 1. Toolchain baseline

| Item | Version | Notes |
|---|---|---|
| Kotlin | 2.4.0 | Also drives the Compose compiler + serialization plugins |
| Compose Multiplatform | 1.11.1 | |
| Compose Material 3 | 1.11.0-alpha07 | **Separate version ref** — see warning below |
| Android Gradle Plugin | 9.x | Uses the new `com.android.kotlin.multiplatform.library` plugin for `:shared` |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36+ | |
| JVM target | 11 | |
| iOS targets | `iosArm64`, `iosSimulatorArm64` | Static framework, `baseName = "Shared"` |

> ⚠ **Kotlin, Compose Multiplatform and Material 3 move together.** Material 3 ships on its own
> cadence, so it can silently fall out of step with the Compose foundation it was compiled against.
> On iOS this doesn't fail the build — Kotlin/Native defers unresolved symbols to **runtime**
> (`kotlin.internal.IrLinkageError`), so the app crashes on the first screen that uses the broken API.
> Bump all three at once, and run the app on an iOS device or simulator, not just the host tests.

---

## 2. Dependencies

### 2.1 Third-party libraries

| Library | Coordinates | Source set | Purpose |
|---|---|---|---|
| **Ktor client** 3.5.x | `io.ktor:ktor-client-core`, `-content-negotiation`, `-auth`, `-logging`, `ktor-serialization-kotlinx-json` | common | HTTP client. One client per base URL; bearer token comes from the auth interface |
| Ktor engine — Android | `io.ktor:ktor-client-android` | android | `HttpURLConnection` engine. **Not OkHttp** (Ktor's OkHttp 4.x conflicts with the AWS SDK's OkHttp 5.x) |
| Ktor engine — iOS | `io.ktor:ktor-client-darwin` | ios | `NSURLSession` engine |
| Ktor CIO + WebSockets | `io.ktor:ktor-client-cio`, `ktor-client-websockets` | android / common | WebSocket for real-time updates (the Android engine can't hold a socket). CIO is also the safe engine for image loading (it cancels cleanly) |
| **kotlinx.serialization** 1.9.x | `org.jetbrains.kotlinx:kotlinx-serialization-json` | common | JSON for DTOs and serialisable nav routes |
| **kotlinx.coroutines** 1.10.x | `kotlinx-coroutines-core`, `-test` | common / test | Async, `Flow`, `StateFlow` |
| **Coil 3** 3.1.x | `io.coil-kt.coil3:coil-compose`, `coil-network-ktor3` | common | Image loading. The Ktor3 fetcher auto-registers, so `AsyncImage(url)` just works |
| **Multiplatform Settings** 1.3.x | `com.russhwolf:multiplatform-settings-no-arg` (+ `-test`) | common / test | Key-value store for **non-sensitive** prefs only (tokens stay in the auth SDK's secure store) |
| **BuildKonfig** 0.22.x | plugin `com.codingfeline.buildkonfig` | build | Compile-time config constants in common code (replaces `BuildConfig` on AGP 9) |
| **AWS Amplify Android** 2.25.x | `com.amplifyframework:aws-auth-cognito`, `core-kotlin` | android | Cognito auth (+ coroutines facade). Requires **core library desugaring** |
| **Firebase** (BoM 34.x) | `com.google.firebase:firebase-bom`, `firebase-messaging`, `firebase-crashlytics` | android | Push (FCM) + crash reporting |
| Firebase Gradle plugins | `com.google.gms.google-services`, `com.google.firebase.crashlytics` | `:androidApp` | Processes `google-services.json`; uploads mapping files |
| **PostHog Android** 3.11.x | `com.posthog:posthog-android` | android | Product analytics |
| **ML Kit Barcode** 17.3.x | `com.google.mlkit:barcode-scanning` | android | QR / barcode reading (bundled model, works offline). *Optional* |
| **Stripe Android** 23.x | `com.stripe:stripe-android` | android | Payments (Payment Element). *Optional — only in apps that take payments* |
| JUnit 4 | `junit:junit` | test | |

### 2.2 iOS native packages (Swift Package Manager, in the Xcode project)

| Package | Purpose |
|---|---|
| `aws-amplify/amplify-swift` | Cognito auth on iOS (Amplify Swift isn't callable from Kotlin/Native, so it's wrapped in a Swift bridge) |
| `firebase/firebase-ios-sdk` | Crashlytics + FCM/APNs |
| `PostHog/posthog-ios` | Analytics |

### 2.3 JetBrains / AndroidX (first-party)

| Library | Coordinates | Purpose |
|---|---|---|
| Compose runtime / foundation / ui / animation | `org.jetbrains.compose.*` | Shared UI |
| Material 3 | `org.jetbrains.compose.material3:material3` | Components |
| Material 3 adaptive navigation suite | `…:material3-adaptive-navigation-suite` | Bottom bar ↔ navigation rail by window size |
| Compose resources | `org.jetbrains.compose.components:components-resources` | Fonts, drawables, strings in `composeResources/` |
| Compose BackHandler | `org.jetbrains.compose.ui:ui-backhandler` | OS back → app navigator |
| Compose UI tooling / preview / ui-test | `org.jetbrains.compose.ui:ui-tooling*`, `ui-test*` | Previews and UI tests |
| Lifecycle ViewModel (KMP) | `org.jetbrains.androidx.lifecycle:lifecycle-viewmodel`, `-viewmodel-compose`, `-runtime-compose` | MVVM in common code |
| **Navigation 3** (KMP) | `org.jetbrains.androidx.navigation3:navigation3-ui`, `lifecycle-viewmodel-navigation3` | App-owned back stacks, ViewModel scoping per entry |
| AndroidX core / activity-compose / appcompat | `androidx.core:core-ktx`, `androidx.activity:activity-compose` | Android host |
| Splash screen | `androidx.core:core-splashscreen` | Android 12+ splash API, backported |
| CameraX | `androidx.camera:camera-core`, `-camera2`, `-lifecycle`, `-view` | In-app camera viewfinder. *Optional* |
| Desugar JDK libs | `com.android.tools:desugar_jdk_libs` | `java.time` etc. on minSdk 24 (Amplify needs it) |
| kotlin-test, androidx test ext, espresso | | Tests |

### 2.4 Gradle plugins

`com.android.application`, `com.android.kotlin.multiplatform.library`, `org.jetbrains.compose`,
`org.jetbrains.kotlin.plugin.compose`, `org.jetbrains.kotlin.multiplatform`,
`org.jetbrains.kotlin.plugin.serialization`, `com.codingfeline.buildkonfig`,
`com.google.gms.google-services`, `com.google.firebase.crashlytics`.

All versions live in **`gradle/libs.versions.toml`** (version catalog). Comment every version that has a
reason to be pinned.

---

## 3. Project layout (Gradle)

Each app is an **independent Gradle build** with three modules:

```
<app>-mobile/
├── settings.gradle.kts          # includes :androidApp, :shared; TYPESAFE_PROJECT_ACCESSORS
├── build.gradle.kts             # plugins `apply false`; reads + validates build config
├── gradle.properties
├── gradle/libs.versions.toml    # the version catalog
├── secrets.properties           # git-ignored — env config (pool ids, API base URL…)
├── secrets.properties.example   # committed template
├── keystore.properties          # git-ignored — release signing
├── keystore.properties.example
├── androidApp/                  # thin Android host (Application + Activity)
├── iosApp/                      # thin Xcode host (SwiftUI App + Swift bridges)
└── shared/                      # ALL app code: domain, data, presentation, UI
```

### Build configuration
- Root `build.gradle.kts` reads required keys from **environment variables first**, then
  `secrets.properties`. A missing key **fails the build at configuration time**, naming the key —
  never bake in an empty default.
- Values are passed to `:shared` and exposed via **BuildKonfig** as `com.<org>.<app>.mobile.config`
  constants. No config JSON files are committed (e.g. the Amplify config is built in code from these).
- Only non-secret values go here (ids, URLs). Secrets never ship in a mobile app.

### Shared code from a monorepo (optional)
`:shared` can pull extra source dirs straight in — no publishing step:
```kotlin
commonMain  { kotlin.srcDir(rootProject.file("../../packages/shared-types/contract-<app>")) } // generated DTOs
commonMain  { kotlin.srcDir(rootProject.file("../../packages/design-system/compose-<app>")) } // generated theme
commonMain  { kotlin.srcDir(rootProject.file("../../packages/mobile-kit/common")) }          // nav shell, UI kit
androidMain { kotlin.srcDir(rootProject.file("../../packages/mobile-kit/android")) }
iosMain     { kotlin.srcDir(rootProject.file("../../packages/mobile-kit/ios")) }
```

---

## 4. Architecture

### 4.1 Principles
1. **Clean Architecture, three layers per feature**: `presentation → domain ← data`.
   Domain depends on nothing; data implements domain interfaces; presentation calls use cases.
2. **MVVM**: one `ViewModel` per screen/flow exposing an immutable `StateFlow<UiState>`; the
   composable reads state and calls ViewModel functions. Unidirectional data flow.
3. **No DI framework.** One hand-wired `AppContainer` builds the whole graph — readable top to bottom
   and greppable. Platform implementations are passed into its constructor.
4. **Wire types never leave the data layer.** DTOs are mapped to domain models explicitly (`toDomain()`).
5. **Platform code behind interfaces ("drivers").** Auth, crash reporting, analytics, push, camera,
   connectivity etc. are `commonMain` interfaces with `androidMain` / `iosMain` implementations
   (and a `NoOp` default so a missing platform bridge degrades instead of crashing).
6. **`expect/actual` only for small platform primitives** (HTTP engine, platform tag, local time,
   image encoding). Anything with behaviour or state is an interface injected via the container.
7. **One closed error type.** Every failure becomes an `AppError`; raw SDK/HTTP text never reaches the UI.
8. **No polling timers.** Screens re-read when told something changed (push/WebSocket signal) or on
   return to foreground.

### 4.2 Layer responsibilities

| Layer | Contains | Depends on |
|---|---|---|
| **domain** | Domain models (`data class`), repository **interfaces**, use cases (`class X(repo) { suspend operator fun invoke(...) }`) | Nothing (Kotlin stdlib + coroutines) |
| **data** | `Http<Feature>Repository` implementing the interface; DTO → domain mappers; local stores | domain, Ktor, serialization, settings |
| **presentation** | `<Feature>ViewModel` + `<Feature>UiState`; `@Composable` screens | domain, core/presentation (UI kit) |

### 4.3 The canonical slice

```kotlin
// domain/<Feature>.kt
data class Thing(val id: String, val name: String)
interface ThingRepository { suspend fun list(): List<Thing> }
class GetThings(private val repo: ThingRepository) { suspend operator fun invoke() = repo.list() }

// data/HttpThingRepository.kt
class HttpThingRepository(private val api: HttpClient) : ThingRepository {
    override suspend fun list() = request {
        api.get("v1/things").ensureSuccess().body<List<ThingDTO>>().map { it.toDomain() }
    }
    // request{} maps IOException → AppError.Network, anything else → AppError.Unexpected,
    // and rethrows CancellationException / AppException untouched.
}

// presentation/ThingsViewModel.kt
data class ThingsUiState(val items: List<Thing> = emptyList(), val isLoading: Boolean = false, val message: String? = null)

class ThingsViewModel(private val getThings: GetThings, liveChanges: Flow<Unit> = emptyFlow()) : ViewModel() {
    private val _state = MutableStateFlow(ThingsUiState())
    val state = _state.asStateFlow()
    init { viewModelScope.launch { liveChanges.collect { reloadQuietly() } } }
    fun load() { /* set loading → call use case → update state or map AppException to a message */ }
}

// presentation/ThingsScreen.kt
@Composable fun ThingsScreen(vm: ThingsViewModel) { val state by vm.state.collectAsStateWithLifecycle() /* … */ }
```

### 4.4 Cross-cutting pieces (`core/`)

| Concern | Shape |
|---|---|
| **Auth** | `AuthDriver` interface (`currentSession()`, sign-in steps, `signOut()`, `sessionChanges: Flow`). Android: Amplify Android. iOS: a Swift bridge class implementing a Kotlin protocol, wrapped by `IosAuthDriver`. |
| **Session** | `SessionManager` owns a `StateFlow<SessionState>` (`Restoring` / `SignedOut` / `SignedIn` / `Refused`). The root composable switches graphs on it. `Restoring` exists so the sign-in screen never flickers. |
| **HTTP** | `createHttpClient(baseUrl, sessionProvider, onRejected)` — JSON content negotiation, timeouts, bearer header from `AuthDriver`, a 401/403 hook back into the session. `expect fun httpEngine()`. `ensureSuccess()` maps problem responses to `AppError`. |
| **Errors** | `sealed interface AppError` (`Validation`, `Unauthenticated`, `Forbidden`, `NotFound`, `Conflict`, `RateLimited`, `Network`, `Unavailable`, `Unexpected`, …) + `AppException(error)`. `AppErrorMessages.kt` maps each to user-facing copy. |
| **Config** | `AppConfig` reads BuildKonfig constants (and builds SDK config, e.g. Amplify JSON). |
| **Navigation** | Navigation 3: every route is a `@Serializable` `NavKey`, so back stacks survive config change and iOS process death. One back stack per tab; adaptive bar/rail shell. |
| **Live updates** | A WebSocket client emits "kind X changed" signals; ViewModels take a `Flow<Unit>` and re-read. |
| **Offline** (if needed) | Last-read cache, outbox/queue of pending writes, a `SyncCoordinator` that flushes on reconnect (`Connectivity` driver). |
| **Observability** | `CrashReporter` and `AnalyticsDriver` interfaces + a typed `AnalyticsEvent` taxonomy. No PII. |
| **Push** | `PushTokenProvider` (FCM on Android) + a `DeviceRepository` that registers the token with the backend; `OpenedNotification` for deep links. |
| **Platform** | Small interfaces/expects: permissions, camera/photo capture, image upload, map launcher, connectivity, notification settings, system UI (status bar) controller. |
| **Theme** | `<App>Theme` (light/dark), `AppearanceMode` (system/light/dark) persisted via Settings. Tokens may be generated from a shared design-tokens file. |
| **Presentation kit** | The app's own components (`buttons`, `inputs`, `rows`, `sheets`, `app bar`, `tab bar`, `states` (loading/empty/error), `snackbar`, `motion`). Screens use only these + the theme — no colour literals, no raw Material controls the kit replaces. |

### 4.5 Composition root

```
Android: Application/MainActivity ──┐
                                    ├─► AppContainer(authDriver, crashReporter, analytics, push, connectivity, …)
iOS: MainViewController (Kotlin) ◄──┘       │  (iOS Swift bridges are passed in from ContentView.swift)
                                            ▼
                                     App(container) @Composable
                                       └─ SessionState → SignedOut graph | Shell (tabs + back stacks)
```

`AppContainer` sections, in order: **data** (HTTP clients, repositories — `private`, `by lazy`) →
**domain** (use cases) → **presentation** (ViewModel factories). Platform implementations default to
`NoOp` so either platform can ship before its bridge exists.

### 4.6 iOS bridging pattern
Some SDKs (Amplify Swift, Firebase iOS, PostHog iOS) aren't usable from Kotlin/Native. For each:
1. Declare a Kotlin interface in `iosMain` (e.g. `IosAuthBridge`).
2. Implement it in Swift (`SwiftAuthBridge.swift`) in `iosApp/`.
3. Wrap it in Kotlin (`IosAuthDriver : AuthDriver`) and pass the Swift instance through
   `MainViewController(...)` into `AppContainer`.

`iOSApp.swift` configures the SDKs (`FirebaseApp.configure()`, `Amplify.configure(...)` from the
Kotlin-built config string) and creates the bridges once for the app's lifetime.

---

## 5. Folder structure

```
shared/src/
├── commonMain/
│   ├── composeResources/
│   │   ├── drawable/
│   │   └── font/
│   └── kotlin/com/<org>/<app>/mobile/
│       ├── app/                         # composition root + root UI
│       │   ├── App.kt                   #   root @Composable: theme, session switch, lifecycle hooks
│       │   ├── AppContainer.kt          #   hand-wired dependency graph
│       │   └── <App>Shell.kt            #   tabs, per-tab back stacks, NavDisplay
│       ├── core/                        # cross-cutting, feature-agnostic
│       │   ├── auth/                    #   AuthDriver interface, auth models
│       │   ├── config/                  #   AppConfig (BuildKonfig-backed)
│       │   ├── error/                   #   AppError, AppException
│       │   ├── http/                    #   client factory, expect engine, error mapping, ws engine
│       │   ├── live/                    #   change signals for ViewModels
│       │   ├── nav/                     #   @Serializable routes (NavKeys)
│       │   ├── observability/           #   CrashReporter, AnalyticsDriver, AnalyticsEvent
│       │   ├── offline/                 #   cache, outbox, sync coordinator (if needed)
│       │   ├── platform/                #   small platform interfaces + expects
│       │   ├── presentation/            #   the app's UI kit + error messages
│       │   ├── push/                    #   token provider, device registration
│       │   ├── session/                 #   SessionManager, SessionState
│       │   └── theme/                   #   theme, appearance mode + store
│       └── features/
│           └── <feature>/
│               ├── domain/              #   models, repository interface, use cases
│               ├── data/                #   Http<Feature>Repository, DTO mappers, local stores
│               └── presentation/        #   <Feature>ViewModel, <Feature>Screen(s)
│
├── androidMain/
│   ├── res/drawable/
│   └── kotlin/com/<org>/<app>/mobile/
│       ├── Platform.android.kt
│       └── core/
│           ├── auth/                    #   AmplifyAuthDriver, AmplifyBootstrap
│           ├── http/                    #   HttpEngine.android.kt (Android engine), LiveEngine (CIO)
│           ├── observability/           #   Crashlytics + PostHog implementations
│           ├── platform/                #   *.android.kt actuals + Android implementations
│           └── push/                    #   FirebaseMessagingService, FCM token provider
│
├── iosMain/
│   └── kotlin/com/<org>/<app>/mobile/
│       ├── MainViewController.kt        #   ComposeUIViewController + AppContainer wiring
│       ├── Platform.ios.kt
│       └── core/
│           ├── auth/                    #   IosAuthBridge (protocol) + IosAuthDriver
│           ├── http/                    #   HttpEngine.ios.kt (Darwin)
│           ├── observability/           #   bridge protocols + wrappers
│           └── platform/                #   *.ios.kt actuals + iOS implementations
│
├── commonTest/kotlin/…                  # mirrors commonMain: core/<x>/, features/<feature>/
├── androidHostTest/kotlin/…/guards/     # source "guard" tests (scan the tree for banned patterns)
└── iosTest/kotlin/…

androidApp/src/main/
├── AndroidManifest.xml
├── kotlin/com/<org>/<app>/mobile/
│   ├── <App>Application.kt              # SDK init (Amplify, Firebase, PostHog)
│   └── MainActivity.kt                  # splash, edge-to-edge, setContent { App(container) }
└── res/                                 # launcher icons, splash theme
    (google-services.json lives in androidApp/)

iosApp/
├── iosApp.xcodeproj                     # SPM: amplify-swift, firebase-ios-sdk, posthog-ios
├── Configuration/                       # xcconfig (team id, bundle id)
└── iosApp/
    ├── iOSApp.swift                     # @main, SDK configure, bridge lifetimes
    ├── ContentView.swift                # hosts MainViewController
    ├── SwiftAuthBridge.swift
    ├── SwiftCrashBridge.swift
    ├── SwiftAnalyticsBridge.swift
    └── GoogleService-Info.plist         # git-ignored or per-env
```

### Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Package root | `com.<org>.<app>.mobile` | |
| Repository interface / impl | `<Feature>Repository` / `Http<Feature>Repository` | `OrderRepository` / `HttpOrderRepository` |
| Use case | verb phrase, `operator fun invoke` | `GetOrders`, `CancelOrder` |
| ViewModel / state | `<Feature>ViewModel` / `<Feature>UiState` | |
| Platform interface / impl | `<Thing>Driver` or `<Thing>Provider` / `Amplify…`, `Ios…`, `Android…`, `NoOp…` | `AuthDriver` → `AmplifyAuthDriver`, `IosAuthDriver` |
| `expect`/`actual` files | `<Name>.kt` / `<Name>.android.kt` / `<Name>.ios.kt` | `HttpEngine.ios.kt` |
| Routes | `<Screen>Root` (tab roots), `<Screen>Route(args)` (pushed) | |
| DTOs | `<Name>DTO` (generated or hand-written), only in `data/` | |

---

## 6. Testing

- **`commonTest`** — ViewModels, use cases, mappers, session logic, with fake repositories/drivers,
  `kotlinx-coroutines-test` and `multiplatform-settings-test`. Mirrors the `commonMain` tree.
- **`androidHostTest`** — JVM tests that need Android resources, plus **guard tests**: tests that read
  the source tree and fail on a banned pattern (a removed library, an un-serialisable route,
  wrong copy for the audience). Cheap way to keep architectural rules from regressing.
- **`iosTest`** — iOS-only actuals.
- Host tests passing is **not** proof the iOS app runs (see the Material 3 warning) — launch it.

---

## 7. Known gotchas

1. **Don't use Ktor's OkHttp engine on Android** alongside Amplify — OkHttp 4 vs 5 clash. Use the
   `Android` engine for data, **CIO** for WebSockets and image loading.
2. **Amplify Android needs core library desugaring** (`isCoreLibraryDesugaringEnabled = true` +
   `desugar_jdk_libs`).
3. **Keep tokens in the auth SDK's secure storage**; Multiplatform Settings is for plain preferences.
4. **Native libraries that crash under Xcode debug** (render threads, GL) take the whole app down on
   iOS — prototype them on a device before committing.
5. **All nav routes must be `@Serializable`** and registered in the serializers module, or state
   restoration fails at runtime.
6. **Fail the build on missing config** rather than defaulting — a wrong endpoint that silently works
   is worse than a build that stops.
