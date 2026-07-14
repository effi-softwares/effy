# Planning inputs — 013-customer-mobile-foundation

**Status**: Binding input to `/plan`. **Not** part of `spec.md`.

## Why this file exists

The feature request for this slice arrived with a detailed technology stack: a library list, an
authentication strategy, a configuration-and-secrets mechanism, and an architecture directive.

Constitution **Principle I** is explicit: *"Specs describe **WHAT and WHY only** — zero technology, no
implementation detail."* Deleting the operator's stack decisions to satisfy that rule would be
malpractice — they are real decisions, made deliberately, and `/plan` is exactly the artifact that is
supposed to hold them.

So they live **here**, unedited, and `/plan` MUST treat this file as input alongside `spec.md`,
`ARCHITECTURE.md`, and the constitution.

**These are the operator's stated preferences, not yet ratified choices.** `/plan` MUST still justify each
against the constitution's Technology Standards and `ARCHITECTURE.md`, and MUST flag any that conflict
(see *Open questions for `/plan`* at the end — several already do).

---

## 1. Verbatim: the requested library baseline

> Core platform and build tools
> Kotlin Multiplatform
> Kotlin Serialization plugin
> Compose Multiplatform
> Compose Compiler
> Android Gradle Plugin
> BuildKonfig
> Android API desugaring
> Compose UI
> Compose Runtime
> Compose Foundation
> Compose UI
> Compose Material 3
> Compose Resources
> Compose UI Tooling
> Compose UI Tooling Preview
> Android support libraries
> AndroidX Core KTX
> AndroidX AppCompat
> AndroidX Activity Compose
> AndroidX Lifecycle ViewModel Compose
> AndroidX Lifecycle Runtime Compose
> Navigation and lifecycle
> Compose Multiplatform Navigation 3
> Navigation 3 UI
> Lifecycle ViewModel
> Lifecycle ViewModel Navigation 3
> Networking
> Ktor Client Core
> Ktor Android Client
> Ktor Darwin Client
> Ktor Content Negotiation
> Ktor Authentication
> Ktor Logging
> Ktor Kotlinx JSON Serialization
> Data serialization
> Kotlinx Serialization JSON
> Asynchronous programming
> Kotlin Coroutines Core
> Kotlin Coroutines Test
> Local storage and settings
> Multiplatform Settings No-Arg
> Multiplatform Settings Serialization
> Image loading
> Coil Compose
> Coil Ktor 3 Network
> Authentication and AWS
> AWS Amplify Android Core
> AWS Amplify Cognito Authentication
> Payments
> Stripe Android SDK
> Testing
> Kotlin Test
> Kotlin Test JUnit
> JUnit 4
> AndroidX Test JUnit Extension
> AndroidX Espresso

## 2. Verbatim: the three directives

> 1. implement authentication with customer cognito pool, that we use for customer web app. since KMP
>    does not have official KMP package we need to impleement authentication and authorization with
>    native way by using kotlin sdk for android of amplify sdk and swift sdk for amplify.
> 2. we need to have all the env variables in sercrets.properties file (git ignroed) and with that we can
>    generate amplifyconfiguration.json file (this file also should be git ignroed.)
> 3. You must use clean architecture in the app. and in the presentation layer you can use mvvm like
>    architecture. you can follow @ARCHITECTURE.md to get an idea.
>
> you should do a deep dive on industry standard development and design pattern for KMP application,
> android applications and swift ios applications. we need to use those best practices here as well.

---

## 3. How these map to spec requirements

The stack is the operator's answer to **HOW**. The spec's requirements are the **WHAT** each must satisfy.
`/plan` owes an answer for each row.

| Requested | Serves | Must satisfy |
|---|---|---|
| Kotlin Multiplatform + Compose Multiplatform | The app itself | FR-001 (both platforms, one logic body). **Already the locked standard** — Constitution *Technology Standards → Mobile*. |
| Amplify **native** SDKs (Kotlin on Android, Swift on iOS) behind an `expect`/`actual` driver | Authentication | FR-009 – FR-021. Matches `ARCHITECTURE.md` § *Mobile apps → Platform drivers* exactly: "the auth SDK itself lives behind a platform driver interface (`expect`/`actual`), implemented separately per native target." |
| BuildKonfig + `secrets.properties` → generated `amplifyconfiguration.json`, both git-ignored | Configuration | FR-039 – FR-042. **FR-041 is the sharp one**: a missing value must **fail the build**, not produce a runnable app pointed at nothing. A generator that silently emits an empty config fails this requirement. |
| Ktor (core, Android, Darwin, content negotiation, auth, logging, JSON) | Networking | FR-036, FR-037. `ARCHITECTURE.md` § *Cross-cutting infrastructure*: one client factory, a custom auth plugin attaching the bearer token. Note the app talks to **two** backends (routing law) → likely **one client per base URL**. |
| Kotlinx Serialization | Wire shapes | FR-043 + Principle II. **The unsolved one** — see open questions. |
| Multiplatform Settings | Local storage | ⚠ **See open questions.** Settings is *preferences*, not a keychain. **FR-020 requires protected credential storage**; plain preferences on Android are world-readable to a rooted device and land in backups. |
| Coil | Image loading | Nothing in this slice needs remote images (there is no catalog). Likely premature. |
| Navigation 3 + Lifecycle ViewModel | Presentation | FR-002, US3. `ARCHITECTURE.md`: type-safe `@Serializable` routes; the nav host swaps auth ↔ protected graphs on session state. |
| Compose Material 3 | UI | FR-004 (tokens only) and FR-003 (native feel on **iOS** too — Material 3 on iOS is a real tension the plan must address). |
| **Stripe Android SDK** | Payments | ⚠ **Out of scope.** There is no cart, no checkout, and no order anywhere in the platform. It is also **Android-only** — an iOS payment path would still be unbuilt. Deferred to the payments slice. |
| Kotlin Test / JUnit / Espresso | Testing | The test baseline. Espresso is Android-only; the plan should state the iOS equivalent, or state that there isn't one and why. |

---

## 4. Open questions for `/plan` — where the requested stack collides with the spec

These are not objections. They are the places where the request, taken literally, would **not** satisfy a
requirement in `spec.md` — and where the plan must therefore make a real decision and record it.

1. **⚠ Credential storage: Multiplatform Settings is not sufficient for FR-020.**
   `FR-020` requires session credentials in the **device's protected credential storage** (Keystore /
   Keychain), unreadable by other apps and absent from plaintext backups. `Multiplatform Settings`
   wraps `SharedPreferences` / `NSUserDefaults` — **neither is protected storage**. In practice this may be
   moot: the **Amplify SDKs manage their own token storage** (and use the platform's secure stores). The plan
   must state, explicitly, **who owns the tokens** — and if the answer is Amplify, then `Multiplatform
   Settings` must be scoped to genuinely non-sensitive preferences, and **FR-020 must be verified against
   what Amplify actually does**, not assumed.

2. **⚠ Principle II: how does a Kotlin app consume the platform's shared TypeScript contracts?**
   `@effy/shared-types` is the single source of truth for the wire shapes; a Kotlin app cannot import it.
   Hand-writing `@Serializable` DTOs is the obvious move and is **exactly the copy-paste Principle II
   prohibits**. `FR-043` refuses to let this slide: the plan must state how one source of truth is preserved
   **and how drift is detected**. Generation from the contract, a contract test against the live endpoint, or
   a schema check in CI — but *something*, not a convention.

3. **⚠ Principle V / FR-003: Material 3 on iOS.**
   Compose Multiplatform renders Material 3 on iOS by default, and Material 3 on iOS **is not native feel** —
   it is Android's design language on Apple's hardware. Meanwhile Principle V and FR-003 require iOS to follow
   HIG. The plan must say how it squares these: platform-conditional theming, Cupertino components, sharing
   logic while splitting presentation, or a stated, justified exception.

4. **⚠ Design tokens: how do the platform's tokens reach a Kotlin app?**
   `@effy/design-system` is a CSS/TS package. Same shape of problem as (2), same prohibition, and it needs its
   own answer.

5. **Two backends, one client.** The routing law (FR-036) sends commerce to one backend and account traffic to
   another. `ARCHITECTURE.md`: "An app talking to more than one backend builds one client per base URL." The
   plan should carry that forward — even though only the account backend has any endpoints today.

6. **Compose Multiplatform Navigation 3 maturity.** Navigation 3 is new. The plan should confirm its stability
   on **both** targets at the pinned Compose Multiplatform version, and state the fallback if it is not ready.

7. **The `expect`/`actual` auth driver surface is the whole security boundary.** It is where FR-024 (the emailed-code
   step-up) and FR-025 (current password required) either hold or quietly evaporate. Its interface deserves to be
   designed in the plan, not discovered in the implementation. **Two Amplify SDKs must land on identical behaviour**,
   and "identical" must be tested, not hoped for.

8. **Telemetry is deferred (Principle VII deviation).** Crashlytics and PostHog are **not** in this slice — a
   knowing deviation the plan MUST record in **Complexity Tracking**, with a justification and the slice that
   closes it. Both are `core/platform/` drivers per `ARCHITECTURE.md`, so the driver pattern this slice establishes
   should leave room for them rather than making them a retrofit.

9. **"Deep dive on industry-standard KMP / Android / iOS patterns"** — the request asks for this explicitly. It is
   `/plan`'s **research** phase. `ARCHITECTURE.md` § *Mobile apps* is already the platform's binding answer for the
   large-scale shape; research should target what it does **not** settle: KMP module granularity, the iOS
   integration boundary (`MainViewController` vs. SwiftUI-native screens), how ViewModels are consumed from Swift,
   the Amplify-per-platform behavioural differences above, and Compose Multiplatform's current iOS maturity.
</content>
