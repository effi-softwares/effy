---
description: "Task list for 013 — Customer Mobile Foundation (Bootstrap)"
---

# Tasks: Customer Mobile Foundation (Bootstrap)

**Input**: Design documents from `/specs/013-customer-mobile-foundation/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [planning-inputs.md](./planning-inputs.md) ·
[research.md](./research.md) · [data-model.md](./data-model.md) ·
[contracts/](./contracts/auth-driver.contract.md) · [quickstart.md](./quickstart.md)

**Tests**: **Included, and non-negotiable.** Two success criteria (**SC-006**, **SC-007**) are *adversarial* — they
assert that a person holding a valid, unlocked, signed-in phone **cannot** do something. That cannot be signed off
by reading code; it must be attacked and survive. Two more (**SC-001**) assert *"identical on both platforms"*,
which is a claim until exercised on both. And Principle II's whole guarantee is a **drift test** that must actually
fail when the contract drifts.

**Organization**: A large **foundational** block (the platform's first mobile surface has real scaffolding cost)
precedes user stories grouped by priority. This is a bootstrap slice — much of its value is the foundation every
later mobile slice stands on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1 · US2 · US3 · US4 · US5 · US6 (from [spec.md](./spec.md))
- **🧑‍💻**: **OPERATOR-RUN.** Claude does not run these — live AWS, real devices, deploys (CLAUDE.md).

---

## Phase 0: Spikes & preconditions (BLOCKING) 🧑‍💻

**⚠️ The backend this app calls is not deployed, and two design premises are unproven.** Nothing in the account
stories (US4, US5) can be trusted until S1 returns green, and nothing runs at all until the backend is live.

> **All six spikes, and where they live**: **S1** (T003) · **S2** (T004) · **S5** (T005) are here and blocking.
> **S3** (Nav3 on a real iPhone) is folded into **T065** — it needs a device, so it runs with the matrix. **S4**
> (rotation compatibility) is **T057** and **S6** (Auto-Backup filenames) is **T059** — both feed Phase 8 polish
> rather than blocking the build.

- [ ] T001 🧑‍💻 **[PRECONDITION — the backend]** Deploy 011 + 012: `make db-up ENV=dev`, `make edge-deploy SERVICE=customer ENV=dev`, and confirm `curl https://edge-api.dev.effyshopping.com/customer/healthz` → `{"status":"ok"}`. **This app has no backend of its own; until this passes, no flow beyond the guest home works.** ([quickstart.md](./quickstart.md) § 0)
- [ ] T002 🧑‍💻 **[PRECONDITION — email]** Verify SES actually sends (`make mail-verify ENV=dev`). **Hard dependency on 010, whose SES steps are open. Without email, set-password (FR-024) does not work at all** — the code never arrives — and account recovery is dead too. (012 T062)
- [ ] T003 🧑‍💻 **[SPIKE S1 — blocks US5 password flows]** On the dev pool, prove `ChangePassword` with `PreviousPassword` **omitted** succeeds for an OTP-only customer, and that **both** sign-in routes work afterwards (new password **and** emailed code). Record in research.md as **S1-VERIFIED / S1-REFUTED**. **If refuted: STOP, re-plan FR-024.** (Inherited 012 T001.)
- [ ] T004 🧑‍💻 **[SPIKE S2]** Determine what "Forgot password?" does **today** for a passwordless customer — that path is live now and its behaviour is unknown. Decides whether recovery (FR-015) is buildable as designed. Record **S2-VERIFIED / S2-REFUTED**. (Inherited 012 T002.)
- [ ] T005 🧑‍💻 **[SPIKE S5]** Call Amplify `updatePassword` with an **empty-string** old password on a passwordless user: is it dropped (→ the attack is reachable) or `InvalidParameterException`? Decides how load-bearing the escape-hatch guard (T041) must be. One line to test. Record **S5-VERIFIED / S5-REFUTED**.

**Checkpoint**: T001/T002 green → the app has something to talk to. T003 green → the password design is real.

---

## Phase 1: Setup (scaffold, deps, module shape)

- [ ] T006 Clean the template out of `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`: remove `Greeting.kt`, `GreetingUtil.kt`, `Platform.kt` stubs and the `App.kt` placeholder body (keep the entry symbols). Do the same for the `androidMain`/`iosMain` `Platform.*.kt`.
- [ ] T007 In `apps/customer-mobile/gradle/libs.versions.toml`: **pin `androidx-lifecycle` `2.11.0-beta01` → `2.10.0`** (D19 — no beta lifecycle under a stable Compose runtime). Add versions + libraries for **Ktor 3.5.x** (core, okhttp, darwin, content-negotiation, auth, logging, serialization-json), **kotlinx-serialization-json**, **kotlinx-coroutines** (core + test), **Navigation 3** (`org.jetbrains.androidx.navigation3:navigation3-ui` + `lifecycle-viewmodel-navigation3`), **Multiplatform Settings** (no-arg), **BuildKonfig 0.22.0** (plugin), **Amplify Android ≥ 2.25.0** (auth). Do **not** add Coil or Stripe (research: premature — no images, no checkout).
- [ ] T008 Create the package skeleton under `commonMain` per [plan.md](./plan.md) § Project Structure: `app/`, `core/{auth,config,http,presentation,theme}/`, `contract/`, `design/`, `features/{home,auth,account}/{domain,data,presentation}/`. Add a one-line `package-info`-style KDoc in each `core/*` marking its role. **Packages shaped like future modules** (Structure Decision).
- [ ] T009 [P] Add the Swift + Amplify Swift dependency to `apps/customer-mobile/iosApp` (SPM: `amplify-swift ≥ 2.45.0`), and confirm the iOS deployment target is **≥ 14.0** (CMP 1.11 raised the floor). No code yet — just the dependency and the target.
- [ ] T010 [P] Add mobile targets to the root `Makefile` (`android-run`, `ios-run`, `mobile-test`, `mobile-fixtures`, `mobile-guard`, `contract-gen`/`tokens-gen` passthroughs). Help text mirrors the existing `edge-*` targets. Update `.PHONY`.

---

## Phase 2: Foundational (BLOCKING — all stories depend on these)

**⚠️ CRITICAL: no user-story work begins until this phase is complete.** This is the bulk of a bootstrap slice.

### 2a — Principle II: the two codegen pipelines (satisfied here or not at all)

- [ ] T011 [P] Add `contract:gen` to `packages/shared-types/package.json`: `ts-json-schema-generator -p src/index.ts -t '*'` → `contract/schema.json`, then `quicktype --src-lang schema --lang kotlin --framework kotlinx --package com.effyshopping.customer.mobile.contract` → `contract/Dto.kt`. **Commit both outputs.** (research D15)
- [ ] T012 Run `contract:gen`; review `contract/Dto.kt`. If the `PasswordWriteDTO` discriminated union is mangled, **hand-fix that one type** and add `@JsonClassDiscriminator("mode")` — the schema snapshot keeps guarding it (D15). Verify `CustomerDTO.passwordUpdatedAt` is nullable and `status` is the `active|barred` union.
- [ ] T013 Add `contract:check` (`contract:gen && git diff --exit-code contract/`) and wire it into CI/`make mobile-test`. **This is the drift alarm** — the day a TS field changes and the Kotlin doesn't, CI goes red.
- [ ] T014 [P] Create `packages/design-system/scripts/gen-compose-theme.mjs` (~60 lines): parse `tokens.css` `:root` + `.dark`, apply the fixed shadcn→M3 lookup (`--card`→`surface`, `--border`→`outline`, `--destructive`→`error`), emit `compose/EffyTokens.kt` — a `Color` object + light/dark `ColorScheme` + `EffyRadius`. M3 slots with no CSS source **left at the M3 default in the script, never invented in Kotlin** (D16). Add `tokens:gen` + `tokens:check`. **Commit the output.**
- [ ] T015 [P] Wire the two generated files into the KMP build: `contract/Dto.kt` and `EffyTokens.kt` copied/symlinked into `commonMain` source sets. Confirm they compile. Add a header banner to each: `// GENERATED — DO NOT EDIT`.

### 2b — Build config & the fail-loud contract (US6's mechanism)

- [ ] T016 [US6] In `apps/customer-mobile/build.gradle.kts`: read a git-ignored `secrets.properties` (env vars win over it), define `requiredKeys = [COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID, COGNITO_REGION, EDGE_API_BASE_URL, CORE_API_BASE_URL]`, and **throw `GradleException` at configuration time naming every missing/blank key and where to get it** (FR-041, D14). `defaultConfigs` only — no `targetConfigs` (dodges the K2 `expect const val` limit, D13).
- [ ] T017 [P] [US6] Create committed `apps/customer-mobile/secrets.properties.example` (the key contract, dummy values) and add `secrets.properties` to `.gitignore` (confirm the monorepo ignore already covers it). **No `amplifyconfiguration.json` anywhere** — the Amplify config is built in code (T024).
- [ ] T018 [P] [US6] **[SECURITY]** Add the no-secret-key guard to `mobile-guard`: assert no name in `requiredKeys` matches `/SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL/i` (FR-042). A user-pool id / client id is a **name, not a key** — the guard enforces the distinction so it is not a matter of memory.

### 2c — Core spine

- [ ] T019 [P] `core/presentation/BaseViewModel.kt` — the `BaseViewModel<State, Intent, Effect>` contract from [ARCHITECTURE.md](../../ARCHITECTURE.md): immutable `StateFlow` state, typed `onIntent`, one-off `Effect` over a `SharedFlow`. Unit-tested.
- [ ] T020 [P] `core/theme/EffyTheme.kt` — a Material 3 theme consuming the **generated** `EffyLightColorScheme` / `EffyDarkColorScheme`, following the device appearance (dark mode, FR-005). Define the app's own spacing + type scale here (the one thing with **no** web source — D16). **No hardcoded hex** (FR-004).
- [ ] T021 `core/auth/AuthDriver.kt` — the interface + `Session`, `AuthStep`, `AuthError` per [contracts/auth-driver.contract.md](./contracts/auth-driver.contract.md). **No `updatePassword`, no `globalSignOut`, no `confirmResetPassword`, no escape hatch** — the absences are the security property. Pure Kotlin, no SDK types.
- [ ] T022 [P] `core/config/AppConfig.kt` + the **single Amplify config-string builder** from BuildKonfig constants (D12) — one string, handed to both driver impls. Unit-test the builder produces valid JSON for known inputs.
- [ ] T023 `core/http/HttpClientFactory.kt` — a Ktor factory, **one client per base URL** (edge + core; FR-036/D20): `ContentNegotiation` (`ignoreUnknownKeys = true`), `expectSuccess = true`, `HttpTimeout`, `Logging` (**never `BODY` in release; `sanitizeHeader` the `Authorization` header** — FR-038/D20). `expect fun httpEngine()` (OkHttp/android, Darwin/ios) — the **only** legitimate `expect fun`.
- [ ] T024 `core/http` bearer plugin: `Auth.bearer` whose `loadTokens`/`refreshTokens` **delegate to `AuthDriver.currentSession(forceRefresh)`** — **never** a raw HTTP refresh (D21: two refreshers racing over one token is a bug class). Attach the **two-token protocol** for edge routes: `Authorization: Bearer <idToken>` + `X-Effy-Access-Token: <accessToken>` (D2). Unit-test both headers are present on an edge call and the access-token header is absent on a core call.
- [ ] T025 `app/AppContainer.kt` — the **one hand-wired DI container** (no framework; Principle VI): `by lazy` singletons for the two HTTP clients, repositories, the injected `AuthDriver`, use cases. `PlatformDeps` carries the platform `AuthDriver` + `PlatformContext`. Exposed to Compose via a `CompositionLocal`.
- [ ] T026 `app/nav/` — the **Navigation 3** graph: a `SnapshotStateList<NavKey>` back stack, `@Serializable` `NavKey` routes, and **explicitly registered polymorphic serializers** via `SavedStateConfiguration` (⚠ **D18: reflection routes crash on iOS** — this is the fix). A `SessionState` flow drives auth-graph ↔ protected-graph swap by rewriting the list (FR-002b).

### 2d — The two driver implementations + the guard (the security boundary)

- [ ] T027 `shared/src/androidMain/.../AmplifyAuthDriver.kt` — implements `AuthDriver` over **Amplify Android**: passwordless sign-up, sign-up-with-password, EMAIL_OTP sign-in (`USER_AUTH` + `preferredFirstFactor(EMAIL_OTP)` — **always** state it, D7), SRP password sign-in, `confirmSignUp`/`confirmOtp`, `startPasswordReset`, local `signOut`, `currentSession(forceRefresh)`. Absorbs the `callingActivity` asymmetry via `PlatformContext`. Emits `sessionChanges` on Amplify's own session-dropped events (the Keystore-failure sign-out, D11).
- [ ] T028 `apps/customer-mobile/iosApp/SwiftAuthDriver.swift` — implements the **Kotlin `AuthDriver` interface in Swift** over **Amplify Swift** (D5: Kotlin/Native cannot call Amplify Swift, so Swift implements and is injected). Same behaviour as Android; factor as the enum associated value `.userAuth(preferredFirstFactor: .emailOTP)`.
- [ ] T029 Inject the drivers at each entry point: `androidApp` `MainActivity` builds `AppContainer` with `AmplifyAuthDriver`; `iosApp` `iOSApp.swift` builds it with `SwiftAuthDriver`. Configure Amplify from the T022 config string on both (`AmplifyOutputs.fromString` / `.data`).
- [ ] T030 [P] **[SECURITY — the FR-024 enforcement]** Add the escape-hatch guard to `mobile-guard`: fail the build on any reference to `escapeHatch` / `getEscapeHatch` / a direct `cognitoidentityprovider` import outside the (empty) driver allowlist (D8). **Then prove it by deliberately adding a `getEscapeHatch()` reference and confirming the build fails** — the 011 lesson: break the guard the way it will actually break ([quickstart.md](./quickstart.md) § 3).

**Checkpoint**: the app builds on both platforms, configures Amplify from code, a missing key fails the build, the
generated contract/theme compile, and the escape-hatch guard has been *seen to fail*. Foundation ready.

---

## Phase 3: User Story 1 — Guest opens the app, never asked who they are (P1) 🎯 MVP

**Goal**: a guest-first app that runs on both platforms, in dark mode, native-feeling, with an honest empty home.

**Independent test**: fresh install → open on Android **and** iOS → usable, no sign-in prompt, dark mode follows
the device, no fake products.

- [ ] T031 [P] [US1] `features/home/presentation/HomeScreen.kt` — the **honest empty state** (FR-002a): the store is being stocked, in the product's voice. **No mock products, no placeholder grid** (guard against it in review). Uses `EffyTheme` tokens only.
- [ ] T032 [US1] `app/App.kt` — the root composable: `Restoring` splash (⚠ **not** the guest home — avoid the signed-in flicker, data-model § 4) → guest home. Wire the Nav3 host from T026.
- [ ] T033 [P] [US1] Confirm native affordances on both platforms: iOS edge-swipe back works, scroll physics feel native, touch targets meet the platform minimum (FR-006), and the layout survives the largest accessibility text size + a screen reader pass (FR-007). Record findings; this is a manual pass, noted for the device matrix.
- [ ] T034 [US1] Offline/backend-unreachable handling for the shell (FR-008): a plain "no connection" state with retry, losing nothing. (The home has little to load yet, but the pattern is set here.)

**Checkpoint**: MVP — the app runs on both platforms as a guest-first, on-brand, dark-mode shell.

---

## Phase 4: User Story 2 — Create an account from the phone (P2)

**Goal**: self-registration + sign-in by the **two** native routes, converging on one identity; recovery.

**Independent test**: register a new email by password; sign out; sign back in. Register another by OTP; sign out;
sign back in. Each lands on its own single account; the OTP customer is never asked for a password.

- [ ] T035 [P] [US2] `features/auth/domain/` — the auth use cases (`RegisterWithPassword`, `RegisterPasswordless`, `SignInWithPassword`, `SignInWithEmailOtp`, `ConfirmOtp`, `ConfirmSignUp`, `StartRecovery`) over the `AuthDriver` interface. Pure; unit-tested with a fake driver.
- [ ] T036 [P] [US2] `features/auth/domain/AuthError` mapping → user-facing messages that **never disclose whether an email is registered** (FR-016): `UserNotFound` and `NotAuthorized` map to the **same** message. Unit-test the two are indistinguishable.
- [ ] T037 [US2] `features/auth/presentation/` — sign-up (name + email, then **password OR OTP-only** — FR-011/FR-012), sign-in (password | OTP), and confirm-code screens, on `BaseViewModel`. Password field: paste-allowed, reveal toggle, no confirm-retype, length-only client check (12, no composition rules — the backend owns breach screening). Registration ends **signed in immediately** (FR-013).
- [ ] T038 [US2] `features/auth/presentation/RecoveryScreen.kt` — start recovery via `AuthDriver.startPasswordReset` (client-side Cognito), then **finish via the backend** `POST /customer/v1/password/reset-confirm` (FR-015). **Do NOT call `confirmResetPassword` from the SDK** — it bypasses breach screening and corrupts `has_password` (contract § 6). Blocked-behaviour depends on **S2 (T004)**.
- [ ] T039 [US2] Rate-limit UX (FR-017): a `RateLimited` result explains the wait; never a silent retry loop.
- [ ] T040 [P] [US2] Unit tests: the OTP-only path **never sets a password** (SC-004); the password path signs in immediately; the enumeration-oracle test (T036) passes.

**Checkpoint**: a stranger can become a customer, two ways, and sign back in — on both platforms.

---

## Phase 5: User Story 3 — Asked only when it matters; remembered when you say (P3)

**Goal**: persistent, background-renewed session in protected storage; deferred sign-in from Account only.

**Independent test**: sign in → force-quit → reopen → still signed in, zero interactions. As a guest, tap Account →
sign-in raised **here and nowhere else** → land on Account; repeat and decline → back to browsing, nothing lost.

- [ ] T041 [US3] Session bootstrap: on launch, `AuthDriver.currentSession()` → `SessionState` machine (`Restoring`/`Guest`/`Authenticated`/`Barred`, data-model § 4). Background renewal via `currentSession(forceRefresh)` while possible; ask again only when genuinely not (FR-018/FR-019). **Rotation stays OFF** pending S4 (T057).
- [ ] T042 [US3] The deferred sign-in demand from **Account only** (FR-002b): a guest tapping Account raises it; success → Account (returned to exactly where they were, FR-020); decline → browsing, nothing lost, not asked again this session (FR-021). No other surface raises it.
- [ ] T043 [P] [US3] **[SECURITY]** Verify token storage (FR-020): tokens live in Amplify's Keychain (iOS) / Keystore-backed store (Android), **not** in Multiplatform Settings (which holds non-sensitive prefs only). Sign out → **no usable session credential remains** on the device (SC-012). Manual inspection task for the device matrix.
- [ ] T044 [US3] Handle Amplify's **unexpected sign-out** (Android Keystore failure, D11): `sessionChanges` → `Guest` **with an explanation**, not a swallowed error.

**Checkpoint**: the session survives restart; the app asks for auth exactly once, in exactly one place.

---

## Phase 6: User Story 4 — A real customer; a credential worth nothing elsewhere (P4)

**Goal**: the platform record (idempotent, record-as-authority), barred refusal, credential isolation, routing law.

**Independent test**: sign in as a web-existing customer → one record. Bar them → refused despite a valid
credential. Present the customer token to an employee service → structurally refused.

- [ ] T045 [US4] `features/account/data/CustomerRepository` + `HttpCustomerRepository` — `GET /customer/v1/me` (idempotent JIT creation, FR-031), passing `?route=password` **only** on a just-registered password customer. DTO→domain via `toDomain()`; **the DTO never leaves the data layer** (Principle VI). `passwordUpdatedAt: null` → "never".
- [ ] T046 [US4] Render identity **from the record, never from token claims** (FR-032). Wire the record into the `SessionState` so `Authenticated` carries the `Customer`.
- [ ] T047 [US4] **[SECURITY]** Barred handling: `GET /me` → `403` puts the app in `Barred`, and **any** account call returning `403` mid-session → `Barred` → **destroy the local session** → `Guest`, with a plain message (FR-033/FR-033a). `Barred` is the *answer*, not a swallowed error. Unit-test the transition.
- [ ] T048 [P] [US4] Confirm the **routing law** is structural (FR-036): account calls go to the edge client, and the core client exists (nothing to call yet). A unit/arch test asserts no account repo imports the core base URL and vice-versa. **Also assert FR-034**: no write path (`PATCH /me`, `PUT /password`) accepts or passes a **client-supplied customer id** — identity comes only from the proven credential (the two-token pair, T024), never from the request body.
- [ ] T049 [P] [US4] **[SECURITY]** Credential-isolation proof (FR-035): a task for the device matrix — present the customer token to an employee-scoped service and confirm a **structural** refusal (the authorizer cannot accept it). Documented in quickstart § 5.

**Checkpoint**: a customer is one record across both surfaces; a barred one is refused; the token works nowhere else.

---

## Phase 7: User Story 5 — Manage the account, safely (P5) ⚠️ THE SECURITY CORE

**Goal**: identity display + initials avatar, name change, set/change password behind the right gate, sign out (+everywhere).

**⚠️ BLOCKED ON S1 (T003).** Do not build the password flows until the spike is green.

**Independent test**: on a passwordless account, attempt to set a password — impossible without a freshly emailed
code, **even holding the unlocked signed-in phone**. On a password account, current password required to change.
Sign out reachable from every screen.

- [ ] T050 [P] [US5] **[the initials function]** `features/account/domain/Initials.kt` — grapheme-cluster based, every case in data-model § 3 (two/one/no name, non-Latin, emoji). **Never derives from email.** Exhaustively unit-tested (SC-013) — the single most likely UI correctness bug.
- [ ] T051 [US5] `features/account/presentation/AccountScreen.kt` — identity (name · email · initials avatar), all from the record. Which password journey to offer is derived **only** from `Customer.hasPassword` (data-model § 5).
- [ ] T052 [US5] Name change: `PATCH /customer/v1/me`, then **force a token refresh** so the greeting doesn't go stale (contract § route 2), reflected everywhere without re-login (FR-023).
- [ ] T053 [US5] **[SECURITY — FR-024]** Set-first-password: `POST /password/challenge` (202, masked destination) → `PUT /password {mode:"set", code, newPassword}`. **The app never verifies the code itself and never calls Cognito `ChangePassword`** — the backend verifies the code in the same request that writes the password (contract § 4). On `200`, **discard tokens → return to sign-in** (FR-027).
- [ ] T054 [US5] **[SECURITY — FR-025]** Change-existing-password: `PUT /password {mode:"change", currentPassword, newPassword}`. Same post-write behaviour (sign out everywhere, incl. this device). `409 WrongModeError` → re-read `hasPassword`, offer the **other** journey (never both).
- [ ] T055 [US5] Sign out (this device — a **local** driver purge, not an API call) reachable from every screen in ≤2 interactions (FR-029); and **sign out everywhere** = `DELETE /customer/v1/sessions`, stating the ≤60-min residual window (FR-027a). After any sign-out the app treats the customer as a guest, losing nothing else (FR-030).
- [ ] T056 [P] [US5] **[adversarial tests]** Unit + instrumented tests for SC-006 (no set-password from a bare session — the code is required and there is no stored grant), SC-007 (no change without current password), SC-019 (password write returns to sign-in), and the `409 WrongModeError` reconciliation. The unit layer proves the app *cannot even construct* the forbidden call; the live proof is the device matrix.

**Checkpoint**: the whole 012 capability set, on the phone, with the takeover primitive closed on the second surface.

---

## Phase 8: Polish & cross-cutting

- [ ] T057 🧑‍💻 **[SPIKE S4]** Determine whether Amplify Android/Swift 2.x refresh via `GetTokensFromRefreshToken` (rotation-compatible) or `REFRESH_TOKEN_AUTH`. **Until settled, refresh-token rotation stays OFF** (D10). Record **S4-VERIFIED / S4-REFUTED**.
- [ ] T058 [P] **[SECURITY — FR-020]** Android Auto Backup exclusion: add `android:dataExtractionRules` / `fullBackupContent` excluding Amplify's shared-prefs files (names from **S6/T059**), so encrypted tokens don't leave the device (D11).
- [ ] T059 🧑‍💻 **[SPIKE S6]** Determine the exact Amplify Android shared-prefs filenames to exclude (Amplify docs say "exclude" without naming them). Feeds T058.
- [ ] T060 [P] **[SECURITY — FR-038]** Credential-in-logs sweep: confirm no password/code/token appears in any log, on either platform, in release config. Ktor `Logging` is `NONE`/`HEADERS`-with-sanitize in release. A scripted sweep, not an eyeball.
- [ ] T061 [P] Accessibility + dark-mode contrast pass across **all** flows (FR-007, SC-017): keyboard/screen-reader completable, largest text size, contrast in light **and** dark.
- [ ] T062 Update `docs/audiences/customer-capabilities.md` — fill the **mobile column** for every row this slice delivers; a row it does not deliver **says so** (FR-044, SC-018). **No unstated cell.**
- [ ] T063 [P] Record the **two constitution deviations** in the parity doc + confirm they match [plan.md](./plan.md) Complexity Tracking: Principle V (iOS Material 3 → closing slice `iOS native shell`), Principle VII (no telemetry → closing slice `customer-catalog`).

---

## Phase 9: Operator sign-off 🧑‍💻

- [ ] T064 🧑‍💻 `make plan ENV=dev` → **READ IT** → `make apply ENV=dev`: **`refresh_token_validity` 30 → 90** (FR-019a). **⚠ If the plan shows the pool or app client as `-/+` or "must be replaced", ABORT** — a replaced pool destroys every account on the platform. Validity is an **in-place** update.
- [ ] T065 🧑‍💻 **Device matrix + [SPIKE S3]** ([quickstart.md](./quickstart.md) § 5): run **every** flow on an Android device **and** an iOS device — "two SDKs behave identically" is a claim until exercised (SC-001). **Includes S3**: on a **physical iPhone**, confirm the Nav3 `SavedStateConfiguration` polymorphic route serializers (T026) work and the auth-stack swap + edge-swipe behave — reflection-based routes crash on iOS, so an Android pass proves nothing (D18). Record **S3-VERIFIED / S3-REFUTED**; if refuted, revisit T026 before sign-off.
- [ ] T066 🧑‍💻 **The adversarial proofs live** ([quickstart.md](./quickstart.md) § 6): SC-006 (a second person, without the email, holding the unlocked signed-in phone, **cannot** set a password), SC-007, SC-019 (+ the email arrives with **no link**). **Demonstrated, not asserted.**
- [ ] T067 🧑‍💻 **Session-bound proof** (SC-020): shorten the bound in a scratch config and confirm sign-out at expiry (not a 90-day wait).
- [ ] T068 🧑‍💻 Live SC sign-off (SC-001…SC-021) + confirm every spike (S1–S6) settled with none silently changing the design — or, if one did, the spec/plan were updated **first** (Principle I). Then commit the slice.

---

## Dependencies & Execution Order

```
Phase 0 (Spikes/preconditions) ─ T001/T002 gate ALL runtime; T003 BLOCKS Phase 7 password flows
   │
Phase 1 (Setup) ──► Phase 2 (Foundational — the bulk) ──► ALL user stories
   │
Phase 2a codegen ─ Principle II; gates the DTOs/theme every feature uses
Phase 2c core ──── gates every feature
Phase 2d drivers ─ gate every auth/account flow; T030 guard proven before US5
   │
Phase 3 (US1) ─┐
Phase 4 (US2) ─┤  independent once Phase 2 lands; US4/US5 additionally need the record repo (T045)
Phase 5 (US3) ─┤  US5 (Phase 7) additionally BLOCKED on S1 (T003)
Phase 6 (US4) ─┤
Phase 7 (US5) ─┘
   │
Phase 8 (Polish) ──► Phase 9 (Operator sign-off) — last
```

### Within each story
- Domain (use cases, pure) before presentation; repository before the screens that read it.
- US5's password steps are **one security argument** — the ordering *is* the safety; do not parallelize T053/T054 against each other.

### Parallel opportunities
- **Phase 1**: T009 · T010 (different files).
- **Phase 2a**: T011 · T014 (two independent generators). **Phase 2c**: T019 · T020 · T022 (different files).
- **Phase 3**: T031 · T033. **Phase 4**: T035 · T036 alongside T040.
- **Across stories once Phase 2 lands**: US1, US2, US3 can proceed in parallel; US4 and US5 share the record repo (T045), so US5 waits on it (and on S1).

---

## Implementation Strategy

### MVP (US1)
Phase 0 preconditions → Phase 1 → Phase 2 → Phase 3 (T001–T034). Ships a guest-first, on-brand, dark-mode app that
**runs on both platforms**. That alone proves the KMP foundation, the codegen pipelines, the fail-loud config, and
the design system on a native surface — the whole point of a bootstrap slice.

### Incremental delivery
US1 (runs) → US2 (accounts) → US3 (persistence) → US4 (record + isolation) → US5 (account management, the security
core). Each is an independently testable increment.

### The two things that gate everything
1. **T001/T002** — no backend, no email → nothing beyond the guest home works.
2. **T003 (S1)** — if setting a first password from a bare session behaves differently than the docs say, FR-024's
   mechanism changes and Phase 7 must be re-planned. Cheaper to learn before the account UI is built on it.

---

## Notes
- **🧑‍💻 = operator-run.** Everything touching live AWS or a real device is the operator's; Claude writes the code.
- **The absences in `AuthDriver` are the security property** — do not "helpfully" add `updatePassword`.
- **The escape-hatch guard (T030) must be seen to fail** before it is trusted (011's lesson).
- **The two generated files (T012/T014) are committed and diff-guarded** — the Kotlin cannot be stale and green.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
</content>
