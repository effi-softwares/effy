# Implementation Plan: Customer Mobile Foundation (Bootstrap)

**Feature dir**: `specs/013-customer-mobile-foundation` | **Date**: 2026-07-14 |
**Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md) · [planning-inputs.md](planning-inputs.md) (the operator's stack directives) ·
[research.md](research.md) (Phase 0) · [ARCHITECTURE.md](../../ARCHITECTURE.md) ·
[constitution](../../.specify/memory/constitution.md) v1.7.0

---

## Summary

Build `apps/customer-mobile` — today a bare KMP template that prints a greeting — into the platform's **fifth
client surface and its second public one**: a guest-first Android + iOS shopping app that registers, signs in,
persists a session, reads the platform's own customer record, and delivers the whole 012 account capability set
(identity, name, set/change password behind an emailed step-up, sign out, sign out everywhere) at parity with the
web storefront.

**The backend for this is already written.** `apis/edge-api/customer` implements every account route (011 + 012).
This slice adds **no backend code and no SQL.** Its only infra change is a **dedicated `customer-mobile`
Cognito app client** on the existing customer pool (90-day refresh) plus adding that client's id to the customer
edge authorizer's audience — **the web client and the pool are untouched** (see D3a). A separate client, rather
than reusing the web one, is what lets the phone hold a 90-day session (FR-019a) without dragging the web session
to 90 days; token lifetime is a per-client setting.

The technical spine, decided in [research.md](research.md):

- **Auth**: the **native Amplify SDKs** (Android Kotlin, iOS **Swift**) behind **one `commonMain` interface** —
  *not* `expect class`, because Amplify Swift is unreachable from Kotlin/Native, so **Swift implements the
  interface and is injected into the shared module** (D5). Ktor-direct-to-Cognito was seriously evaluated and
  **rejected**: the pool deliberately omits `ALLOW_USER_PASSWORD_AUTH`, so password sign-in **must** use SRP, and
  going direct would mean hand-rolling a cryptographic protocol in the first mobile slice (D6).
- **The dangerous call is not in the app.** `updatePassword` / `globalSignOut` go to the **backend**, which owns
  the emailed step-up and the breach screening. Amplify's **escape hatch is banned by a build guard** — the KMP
  equivalent of 011's Amplify quarantine, and for the same reason (D8).
- **Config**: `secrets.properties` (git-ignored) → **BuildKonfig** → one config **string**, handed to both SDKs.
  **No `amplifyconfiguration.json` is generated or shipped at all** — better than the directive asked for (D12).
  A missing key **fails the build, naming itself** (D14).
- **Principle II**: the Kotlin DTOs are **generated from `@effy/shared-types`** and the Compose theme is
  **generated from `tokens.css`**; both outputs are **committed**, and **CI fails on drift** (D15, D16).
- **iOS ships Material 3**, and the plan **says so**: a recorded **Principle V deviation** (D17).

---

## Technical Context

**Language/Version**: Kotlin **2.4.0** (KMP) · Swift (the iOS auth driver + entry point) · Node/TS (two codegen
scripts in existing packages)

**Primary Dependencies**: Compose Multiplatform **1.11.1** · **Navigation 3** (`org.jetbrains.androidx.navigation3`)
· `androidx.lifecycle` **2.10.0** (⚠ **down** from the scaffold's `2.11.0-beta01` — D19) · **Ktor 3.5.x** ·
kotlinx.serialization · **Amplify Android ≥ 2.25.0** / **Amplify Swift ≥ 2.45.0** (the passwordless floor) ·
**BuildKonfig 0.22.0** · Multiplatform Settings (**non-sensitive preferences only** — D11)

**Storage**: **No app database.** Tokens live in Amplify's secure stores (Keychain / Keystore-backed
EncryptedSharedPreferences). Non-sensitive preferences only in Multiplatform Settings.

**Testing**: `kotlin.test` in `commonTest` (ViewModels/reducers, mappers, config builder) · **contract tests
against recorded dev fixtures with `ignoreUnknownKeys = false`** (the drift alarm) · manual device matrix
(Android + iOS) for everything that cannot be honestly unit-tested (D22)

**Target Platform**: **Android** minSdk 24 / compile+target 36 · **iOS ≥ 14.0** (CMP 1.11 raised the floor;
`iosArm64` + `iosSimulatorArm64` — `iosX64` was **removed** in 1.11 and the scaffold is already correct)

**Project Type**: Mobile app (KMP + Compose Multiplatform), one `shared` module + two thin app modules

**Performance Goals**: 60 fps scroll/animation on both platforms; cold start to first paint under 2 s on mid-range
hardware

**Constraints**: No secret of any kind in the binary (FR-042) · no credential in any log (FR-038) · tokens only in
protected storage (FR-020) · **the app must not be able to write a password without the backend's step-up** (FR-024)

**Scale/Scope**: ~10 screens (home, sign-in, sign-up, OTP, recovery, account, name, password set/change, sign-out
confirm). Two backends addressed, one of them (`core-api`) with nothing to call yet.

---

## Constitution Check

*GATE — evaluated before Phase 0, re-checked after Phase 1 (bottom of this file).*

**No amendment is required.** The constitution stands at **v1.7.0** and this slice is built inside it — with
**two deviations, both taken knowingly and recorded below.**

| Principle | Verdict |
|---|---|
| **I — Spec-Driven** | ✅ The operator's technology stack was kept **out** of `spec.md` and preserved verbatim in [planning-inputs.md](planning-inputs.md). Two spec defects found during planning were **fixed in the spec**, not papered over (see *Spec corrections* below). |
| **II — Shared Contracts** | ✅ **The principle's hardest test so far, and it is met rather than waived.** A Kotlin app cannot import `@effy/shared-types` (TS) or `tokens.css` (CSS). Rather than hand-copy — *exactly* the copy-paste Principle II prohibits — **both are generated into committed Kotlin artifacts, and CI fails on drift** (D15, D16). |
| **III — Dual-Path** | ✅ No new backend. The app obeys 011's routing law (FR-028): commerce → `core-api`, account → `edge-api`. Two Ktor clients are built so the law is **structural**, though `core-api` has nothing to call yet. |
| **IV — Auth Isolation** | ✅ Customer pool only. **Two** credential routes; **no federation** while account-linking is unbuilt (Google stays parked on both surfaces). The **record**, not the claim, decides access (FR-033). No auth proxy: the app talks to Cognito directly; the backend relays *the customer's own* token authority (D2). |
| **V — Design** | ⚠ **DEVIATION 1 — recorded, not waived.** See Complexity Tracking. |
| **VI — Layered Architecture** | ✅ Clean Architecture per feature (`domain` ← `data`, `domain` ← `presentation`); **MVVM** — a `ViewModel` per screen exposing an immutable `StateFlow<UiState>` + action functions (constitution **v1.8.0**; the earlier State/Intent/Effect MVI mandate was retired 2026-07-15 in favour of method-based MVVM); **no DI framework** — one hand-wired `AppContainer`. Conforms to `ARCHITECTURE.md` § *Mobile apps*. |
| **VII — Observability** | ⚠ **DEVIATION 2 — recorded, not waived.** See Complexity Tracking. |

### Complexity Tracking — the two deviations

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Principle V — iOS does not follow Apple HIG.** The app ships **Material 3 on both platforms**. iOS chrome is Material's, not Apple's, and gets **no Liquid Glass** (which iOS 26 paints only for system-drawn `TabView`/`NavigationStack`/toolbars). | Operator decision, 2026-07-14. The HIG-conformant option is JetBrains' documented **SwiftUI-shell + Compose-content** hybrid, which adds a Swift shell plus the SKIE / KMP-ObservableViewModel bridge to a slice that is already the platform's first mobile build. The deviation buys a **shipped, working app on both platforms** first. | **`compose-cupertino` was evaluated and rejected outright** — last release `0.1.0-alpha04` (**April 2024**), pinned to CMP 1.6.1 / Kotlin 1.9.23 (we are on 1.11.1 / 2.4.0); an alpha dependency two major versions behind is not an acceptable foundation for the **entire visual identity of the public app**. A full SwiftUI iOS UI doubles mobile UI effort permanently. **The debt is real and bounded**: ViewModels/use-cases/repositories/driver all live in `commonMain`, so retrofitting the SwiftUI shell later **touches the presentation layer and nothing else** — which is what Clean Architecture is *for*. **Closing slice: `iOS native shell` (unscheduled).** Until then the honest claim is written into the parity register: *native scroll physics, native back-swipe, native text editing, native accessibility — **not** HIG component parity.* |
| **Principle VII — no crash reporting and no product analytics.** Neither Crashlytics nor PostHog ships. | Operator decision, 2026-07-14 (spec § Clarifications). This is a foundation slice; telemetry lands with the first commerce slice. | Deferring is a **real cost** — the platform's first mobile user flows go out unmeasured, and an auth funnel is exactly what you most want measured on a new surface. It is accepted only because both are `core/platform/` **drivers** in the same shape as the auth driver this slice builds — so the pattern is established here and telemetry is an **addition, not a retrofit**. FR-038 (no credential in any telemetry) **already binds** whatever ships later. **Closing slice: `customer-catalog` (the next customer slice).** |

**A deviation nobody wrote down is a requirement that was dropped.** Both are in the parity register too.

### Spec corrections made during planning

Two requirements in `spec.md` were **wrong**, and planning caught them. Both are fixed **in the spec**, with the
reasoning recorded inline (Principle I: fix the earliest affected artifact).

1. **FR-027 asked for something that cannot be built.** It said a password change signs out *"every **other**
   device"*, preserving the current one — inherited from 012's **pre-amendment** text. Cognito's revocation is
   **all-or-nothing** and cannot enumerate the other sessions to spare this one. 012 already strengthened this to
   *"every session on every device, **including the one that made the change**"*; this spec now carries the amended
   version. **On mobile it has a visible price: after setting a password, the app returns to sign-in.** That is
   designed, not discovered.
2. **FR-019a asked for an inactivity window that does not exist.** Cognito's refresh credential expires a fixed
   period **after sign-in**, *not* after last use — **there is no sliding window**, and rotation does not extend it
   (a rotated credential inherits *"the remaining duration of the original"*). "30 days of inactivity" was
   **unbuildable**, and would have signed out a **daily-active** customer on day 30 — the opposite of the intent.
   Now: **90 days from sign-in** (operator decision), delivering the original intent in terms the platform can
   actually honour.

---

## Project Structure

### Documentation (this feature)

```text
specs/013-customer-mobile-foundation/
├── spec.md                 # WHAT/WHY (zero tech)
├── planning-inputs.md      # the operator's stack directives, verbatim — binding input to this plan
├── plan.md                 # this file
├── research.md             # Phase 0 — D1..D22 + the six spikes
├── data-model.md           # Phase 1 — domain models, DTO mapping, session/password state machines
├── contracts/              # Phase 1 — the backend contract + the AuthDriver contract
│   ├── edge-api-customer.contract.md
│   └── auth-driver.contract.md
├── quickstart.md           # Phase 1 — build it, run it, prove it (incl. the adversarial proofs)
└── tasks.md                # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
apps/customer-mobile/                       # an INDEPENDENT Gradle build (not a pnpm workspace member)
├── secrets.properties                      # ⛔ GIT-IGNORED — never committed
├── secrets.properties.example              # ✅ committed — the key contract, dummy values
├── build.gradle.kts                        # ⚠ the required-key check → GradleException (FR-041)
├── gradle/libs.versions.toml               # + ktor, amplify, nav3, buildkonfig; lifecycle 2.11.0-beta01 → 2.10.0
│
├── shared/src/
│   ├── commonMain/kotlin/com/effyshopping/customer/mobile/
│   │   ├── app/                            # AppContainer (hand-wired DI), nav graph, root VM
│   │   ├── core/
│   │   │   ├── auth/                       # AuthDriver INTERFACE + Session/AuthStep models  ← the security boundary
│   │   │   ├── config/                     # BuildKonfig readers + the ONE Amplify config string (D12)
│   │   │   ├── http/                       # Ktor factory ×2 base URLs; bearer plugin delegates to AuthDriver (D21)
│   │   │   ├── presentation/               # MVVM: a ViewModel exposing StateFlow<UiState> + action fns
│   │   │   └── theme/                      # EffyTheme — consumes the GENERATED tokens
│   │   ├── contract/                       # ⚙ GENERATED Dto.kt (from @effy/shared-types) — committed, do not edit
│   │   ├── design/                         # ⚙ GENERATED EffyTokens.kt (from tokens.css) — committed, do not edit
│   │   └── features/
│   │       ├── home/                       # guest home — the honest empty state (FR-002a)
│   │       ├── auth/                       # sign-up, sign-in (password | OTP), recovery
│   │       └── account/                    # identity, name, password set/change, sign out (+ everywhere)
│   │           └── {domain,data,presentation}/     # the three-layer slice, per feature
│   ├── androidMain/kotlin/…/               # AmplifyAuthDriver (Amplify Android) · Ktor OkHttp engine
│   ├── iosMain/kotlin/…/                   # Ktor Darwin engine · the Swift-driver injection point
│   └── commonTest/kotlin/…/                # reducers, mappers, config builder, CONTRACT tests (fixtures)
│
├── androidApp/                             # entry point; ⚠ Auto Backup EXCLUSIONS for Amplify prefs (D11/FR-020)
└── iosApp/
    ├── SwiftAuthDriver.swift               # ⚠ Amplify SWIFT lives HERE — implements the Kotlin interface (D5)
    └── iOSApp.swift                        # builds the container, injects the driver

packages/shared-types/
├── src/*.ts                                # UNCHANGED — still the single source of truth
└── contract/                               # ⚙ NEW: schema.json + Dto.kt (committed, CI-diff-guarded)  (D15)

packages/design-system/
├── src/tokens.css                          # UNCHANGED — still the single source of truth
├── scripts/gen-compose-theme.mjs           # ⚙ NEW ~60-line parser
└── compose/EffyTokens.kt                   # ⚙ NEW generated theme (committed, CI-diff-guarded)  (D16)

infra/envs/dev/auth-customer.tf                  # NEW: customer-mobile app client (90-day refresh) + its SSM param  (D3a)
infra/envs/dev/edge-gateway.tf                   # customer authorizer audience += the mobile client id  (D3a) — the two infra changes
Makefile                                        # + mobile targets (android/ios/test/contract/tokens/guards)
docs/audiences/customer-capabilities.md         # the mobile column — filled in (FR-044)
```

**Structure Decision.** One `shared` module (**not** `core:*` / `feature:*` Gradle modules). JetBrains' **May 2026**
default KMP structure — a pure-library `shared` + separate per-platform app modules — is **already what the scaffold
is**, and AGP 9 *forces* it (the application plugin can no longer be applied inside a multiplatform module). At one
developer and one vertical slice, multi-module buys incremental-build speed and isolation we do not yet need, and
costs N× Gradle config and N× iOS framework plumbing. **We use package boundaries shaped like the eventual module
boundaries**, so extraction later is mechanical rather than a rewrite.

---

## The security spine (what this slice must not get wrong)

Four things, in the order they would fail.

1. **The two-token protocol** (D2). Account routes need the **ID token** in `Authorization` (the gateway
   authorizer's audience is the app client id — the ID token's shape) **and** the **access token** in
   `X-Effy-Access-Token` (Cognito's `ChangePassword`/`GlobalSignOut` are access-token-authorized and the Lambda holds
   **no IAM** for them — it relays the customer's own authority). The backend **401s if the two `sub`s differ**. Send
   one token and every account route fails; send the wrong one as bearer and identity reads 401 on a missing `email`
   claim.

2. **`updatePassword` is not in this app** (D8). Cognito's `ChangePassword` **permits omitting the previous password
   when the user has none** — confirmed verbatim in AWS's API reference — and **IAM cannot close it**. That is the
   entire reason 012 exists. So: the driver interface has **no** `updatePassword` and **no** `globalSignOut`; both go
   to the backend. Amplify's `escapeHatch` (which *can* reach the raw call) is **banned by a build guard**, and — per
   011's lesson — **the guard is proved by deliberately breaking it**, not by trusting it.

3. **Tokens at rest** (D11). iOS: Amplify's Keychain use is already correct
   (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, data-protection keychain) and **backup-excluded by
   construction** — zero config. **Android is not**: `EncryptedSharedPreferences` under a Keystore master key, but
   **Auto Backup will copy the encrypted files off the device** unless excluded. That exclusion is a **task**, not a
   footnote. Android also has a known Keystore-failure mode that **silently signs the customer out** — so
   *unexpectedly signed out* is a designed state, not an error to swallow.

4. **No credential in any log** (FR-038). Ktor `LogLevel.BODY` is **never** enabled in release, and the
   `Authorization` header is `sanitizeHeader`-redacted even in debug. This is a **build setting**, not a good
   intention.

---

## Telemetry (Principle VII)

**None ships in this slice.** That is Deviation 2 above, with its closing slice named. What this slice *does* owe
Principle VII, and pays:

- **FR-038 is enforced now** — no password, code, or credential may appear in any log or diagnostic. The sweep is a
  task, and the Ktor logging configuration is the mechanism.
- **The driver pattern is established here**, so Crashlytics and PostHog land later as `core/platform/` drivers in
  the **same shape** as `AuthDriver` — an addition, not a retrofit. That is the only thing that makes the deferral
  honest rather than a hole.

---

## Phasing

| Phase | What | Gate |
|---|---|---|
| **0** | Research — D1…D22, the six spikes | ✅ done ([research.md](research.md)) |
| **1** | Design — data model, contracts, quickstart | ✅ done (this commit) |
| **2** | The codegen pipelines: `shared-types` → `Dto.kt`; `tokens.css` → `EffyTokens.kt`; both committed + CI-diff-guarded | **Principle II is satisfied here or not at all** |
| **3** | Build config: `libs.versions.toml`, BuildKonfig, the required-key `GradleException`, `secrets.properties.example`, the no-secret-key guard | A missing key **fails the build** (FR-041) |
| **4** | Core: Ktor ×2, `AuthDriver` interface, `AppContainer`, `EffyTheme`, navigation (a `StateFlow` back stack + `BackHandler`), the MVVM `ViewModel` pattern | — |
| **5** | The two driver implementations: Amplify Android (Kotlin) + **Amplify Swift** (Swift, injected) + the **escape-hatch build guard** (proved by breaking it) | The security boundary |
| **6** | Features: home (honest empty state) · auth (sign-up ×2, sign-in ×2, recovery) · account (identity, name, password set/change, sign out ×2) | — |
| **7** | Android Auto Backup exclusions; the credential-in-logs sweep | FR-020, FR-038 |
| **8** | Tests: reducers, mappers, **contract fixtures with `ignoreUnknownKeys = false`** | The drift alarm |
| **9** | Operator: the Terraform apply, the six spikes, the device matrix, live SC sign-off | See below |
| **10** | Parity register + the two deviations recorded | FR-044 |

---

## Open items requiring the operator

Claude writes all the code; the operator runs everything that touches live AWS or real devices.

| # | Step | Note |
|---|---|---|
| **O1** | `make apply ENV=dev` — **the new `customer-mobile` app client (90-day refresh) + the authorizer audience** (D3a) | Both are **additive** (a new client; an extended audience list). The web client and the pool are **not** touched. **Abort if the plan shows the pool or the *web* client as `-/+` / "must be replaced".** Then `make output` → the mobile client id goes in `secrets.properties`. |
| **O2** | **Deploy the backend this app depends on.** 011 and 012 are **code-complete but NOT deployed**: `make db-up ENV=dev`, `make edge-deploy SERVICE=customer ENV=dev`, and **SES must actually send** (012 T062) | **Without these, this app has no backend at all**, and set-password does not work even in principle. |
| **O3** | **Spikes S1 + S2** (inherited from 012 T001/T002) | Both **can change the design**. S1 is FR-024's premise. |
| **O4** | **Spike S3** — Nav3 polymorphic routes on a **real iPhone** | Green on Android **proves nothing** here (D18). |
| **O5** | **Spikes S4, S5, S6** | Rotation compatibility; the empty-string `PreviousPassword` probe; the Auto-Backup filenames. |
| **O6** | The **device matrix**: every flow, on an Android device **and** an iOS device | Two SDKs behaving identically is a **claim**, and it is only true if exercised (D22). |
| **O7** | Live SC sign-off — including the **adversarial** SC-006 / SC-007 (a valid session, without the email, **cannot** set a password) | Demonstrated, not asserted. |

---

## Post-Design Constitution Re-check

Re-evaluated after Phase 1. **No new violations.** The two deviations are unchanged, recorded, and each has a named
closing slice.

The design **strengthened** two principles rather than merely satisfying them:

- **Principle II** was the risk going in — a Kotlin surface could not consume the platform's TS/CSS contracts, and
  the obvious move (hand-copy) is precisely what the principle forbids. Generating **committed, readable,
  hand-editable** Kotlin from both sources, with **CI failing on drift**, means the mobile app **cannot** be stale
  and green. The generators are **not in the build graph** — if they vanished tomorrow we would lose a script, not a
  codebase.
- **Principle IV** was hardened by *removing* capability from the app: the driver **cannot** write a password or
  revoke sessions, and the escape hatch that could is a **build failure**. The second surface is where a security
  property usually dies quietly; here it is enforced by the compiler rather than by the reviewer's memory.
</content>
