---
description: "Task list for 014 — Shop Mobile Foundation (Bootstrap)"
---

# Tasks: Shop Mobile Foundation (Bootstrap)

**Input**: Design documents from `/specs/014-shop-mobile-foundation/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [planning-inputs.md](./planning-inputs.md) ·
[research.md](./research.md) · [data-model.md](./data-model.md) ·
[contracts/](./contracts/edge-api-shop.contract.md) · [quickstart.md](./quickstart.md)

**Tests**: **Included where they earn it.** SC-006/SC-007 are *adversarial* (a `shop_manager` with no assigned
shop is **refused**, uniformly), SC-001 asserts *"identical on both platforms"* (a claim until exercised), and
Principle II's whole guarantee is a **drift test** that must actually fail when the contract drifts.

**Organization**: A foundational block precedes user stories by priority. **This is "013 for the shop audience"**
— the tech spine is copied from `apps/customer-mobile` and adapted; the new content is EMAIL_OTP-only auth (one
route, one token) and **RBAC done right** (role-aware UI + the backend manager gate).

## Status (2026-07-15): ✅ **SIGNED OFF (partial by design) — committed**

The slice is **complete and signed off by the operator**: both apps build and run on **Android and iOS**,
the `shop_mobile` Cognito client was applied (`make apply` — additive, pool untouched), the app authenticates
against the shop pool by EMAIL_OTP, and the operator has attested the acceptance criteria on-device (US1–US6).
Committed.

**Signed off now:** SC-001 (builds/runs both platforms, all flows), SC-002 (sign-in < 90 s), SC-003
(enumeration non-disclosure), SC-004 (session persists), SC-005/SC-006/SC-007 (role-aware UI + the manager
gate's **negative half** — staff / role-less / unassigned-manager refused, **uniform**), SC-008 (cross-pool
isolation), SC-009 (no credential after sign-out), SC-010 (unassigned = expected state), SC-011 (no secrets in
VCS), SC-012 (missing config fails the build), SC-014/SC-014a (a11y + **tablet-first** on a real tablet).

**Partial by design (unchanged from 007 / the spec's own plan) — needs 009 shop data, not a gap:** the manager
gate's **positive half** (a manager *served* at an active shop → *Granted*) + the inactive-shop / disabled-operator
denials. Verified in the shop-management slice against product-created data.

**Deferred by design, with owning slices (recorded in the parity register):** telemetry → `mobile-telemetry`
(Principle VII); iOS HIG chrome → `iOS native shell` (Principle V); return-to-intent (T035) → the first slice with
a deep-linkable destination.

---

**Correction (2026-07-15):** the **`shop_mobile` Cognito app-client Terraform was missing** — T054 named the
`make apply` but the resources it would apply had never been written. Now authored in
`infra/envs/dev/auth-shop.tf` (+ `edge-gateway.tf` authorizer audience), `terraform fmt`/`validate` clean — see
**T054a**. The app-client id is the value the operator copies into `secrets.properties` after apply.

The buildable foundation is done and **compiles on both platforms**: `apps/shop-mobile` — `./gradlew
:androidApp:assembleDebug` **green**, `:shared:compileKotlinIosSimulatorArm64` (+ test) **green**, shared
unit tests **7/7 green** (`ShopRolesTest` 6 + `AppConfigTest` 1). Both Principle-II drift guards pass
(`sm-contract-check`, `sm-tokens-check`); the secret/escape-hatch guard is **proven** by deliberately
breaking it (`sm-guard`). Generated theme is emitted per-app (`packages/design-system/compose-shop`,
package `…shop.mobile.design`) by the SAME one generator; customer output unchanged.

**Code review applied (2026-07-15).** A clean-architecture / MVVM pass fixed: (1) the manager-gate check now
runs in a `LaunchedEffect`, not as a side-effect in composition; (2) an enum comparison replaced a stringly-typed
`.name == "ACTIVE"`; (3) **ViewModels take explicit collaborators**, not the whole `AppContainer` (service-locator
seam removed); (4) the sign-in **field values live in the ViewModel's `UiState`** (single source of truth); (5)
`ShopViewModel` split into one-screen-one-`HomeViewModel`/`ManagerViewModel`; (6) the nav stack **resets to Home on
sign-out** so no route survives into the next session.

**#3 and #7 completed across BOTH mobile apps (parity).** (3) **Explicit ViewModel deps** — the service-locator
container seam was removed from `customer-mobile` too (`AuthViewModel`/`AccountViewModel` now take their exact
collaborators). (7) A **formal domain use-case layer** was added to both apps: `ViewModel → UseCase →
AuthDriver/Repository`, one class per use case (shop: `RequestSignInCode`, `ConfirmSignIn`, `GetOperator`,
`CheckManagerAccess`; customer: 14 auth/account use cases). Each use case owns input normalization (trim), the
repository is now **private** in each `AppContainer` (reached only via use cases), and `SessionManager` reads the
record via `GetOperator`/`GetCustomer`. Both apps build on Android **and** iOS; shop **9** unit tests + customer
**10** green; guards + drift checks clean. Naming: customer ViewModels suffix injected use cases `…UseCase`
(their method names collide with the operation verbs); shop needs no suffix.

**Tablet-first (FR-003a / SC-014a / research D10s) — added 2026-07-15.** The shop app's primary device is a
**large-screen tablet in landscape** (counter / back-room), the phone the secondary compact case. The
foundation now embodies this: `core/ui/WindowSize.kt` provides a **window-size-driven** `AdaptiveContent`
(`BoxWithConstraints`, Material 3 breakpoints — no `isTablet` boolean, no platform check), applied to sign-in +
the shell so content is a bounded, centered column on a tablet instead of a stretched phone row, and reflows to
full width on a phone. **This is the pattern every later shop-mobile UI slice extends** (to two-pane /
master-detail). Both platforms recompile green with it.

**Open (all require live AWS, real devices, or an Xcode build — operator/device work):** T001–T004
(preconditions + auth spike 🧑‍💻), T008 (add Amplify Swift SPM in Xcode), T031/T043 (extra
enumeration/gate unit tests — code is enumeration-safe + fail-closed by construction, dedicated tests
deferred), T033/T036/T046/T051 (device-matrix passes), T035 (return-to-intent — deferred; login-first has
no deep-link target yet), T049–T053 (polish/docs/telemetry-reconcile), T054–T057 (operator apply + live
SC sign-off). **Note: iOS Kotlin/Native compiles; the full iOS app build (Swift/Amplify) is the operator's
Xcode step (T008/T055) — the `No such module 'Shared'/'Amplify'` editor diagnostics are expected until then.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1 · US2 · US3 · US4 · US5 · US6 (from [spec.md](./spec.md))
- **🧑‍💻**: **OPERATOR-RUN.** Claude does not run these — live AWS, real devices, deploys (CLAUDE.md).
- **♻️**: **port from 013** (`apps/customer-mobile`) — copy the pattern, adapt package + the shop delta.

---

## Phase 0: Preconditions 🧑‍💻

**⚠ The shop backend already serves both surfaces — no deploy needed if it's up.** But test operators and email
must exist for anything past the sign-in screen.

- [X] T001 🧑‍💻 **[PRECONDITION — backend reachable]** Confirm `edge-api/shop` is up (deployed for shop-web, or `make edge-offline SERVICE=shop ENV=dev` + ngrok) and `curl .../shop/healthz` → `{"status":"ok"}`. **No backend change** — the shop service already serves both surfaces. ([quickstart.md](./quickstart.md) § 0)
- [X] T002 🧑‍💻 **[PRECONDITION — email]** The shop pool's EMAIL_OTP sender must deliver a code (built-in Cognito sender is fine for dev). Without it, sign-in cannot be exercised.
- [X] T003 🧑‍💻 **[PRECONDITION — test operators]** Provision (via 009 back-office, or `AdminCreateUser` + group): **A** `shop_manager` at an **active** shop · **B** `shop_manager` with **no** shop · **C** `shop_staff` · **D** role-less/unassigned. B/C/D prove the gate's negative half **now**; A + inactive-shop/disabled need 009 data (partial sign-off, 007). ([quickstart.md](./quickstart.md) § 5)
- [X] T004 🧑‍💻 **[SPIKE S1s]** Confirm the native Amplify SDKs drive `USER_AUTH` + preferred `EMAIL_OTP` → single `confirmSignIn(code)` exactly as shop-web observes on this pool. Record **S1s-VERIFIED / S1s-REFUTED**.

**Checkpoint**: backend up + email delivering + four operators exist → the app has everything to talk to.

---

## Phase 1: Setup (scaffold, deps, module shape)

- [X] T005 ♻️ Clean the template out of `apps/shop-mobile/shared/src/…/shop/mobile/` (remove `Greeting.kt`, `GreetingUtil.kt`, `Platform.*.kt`, the placeholder `App.kt`), mirroring the 013 cleanup. Keep the entry symbols.
- [X] T006 ♻️ `apps/shop-mobile/gradle/libs.versions.toml` — copy 013's catalog verbatim (lifecycle **2.10.0**, Ktor 3.5.x **client-android** not okhttp, kotlinx-serialization/coroutines, **BuildKonfig 0.22.0**, Amplify Android ≥ 2.25.0 + **core-kotlin**, **desugar_jdk_libs 2.1.4**, **compose-ui-backhandler**, multiplatform-settings). Do **not** add nav3/ktor-auth (013 removed them as unused).
- [X] T007 ♻️ Create the package skeleton under `commonMain` per [plan.md](./plan.md) § Project Structure: `app/`, `core/{auth,config,http,session,nav,theme}/`, `contract/`, `design/`, `features/{auth,shop/{domain,data,presentation}}/`. Packages shaped like future modules.
- [X] T008 [P] Add Amplify Swift (SPM ≥ 2.45.0, products `Amplify` + `AWSCognitoAuthPlugin`) to `apps/shop-mobile/iosApp`; iOS deployment target **≥ 14.0**. (Operator adds the SPM package in Xcode; T067.)
- [X] T009 [P] ♻️ Add shop-mobile Makefile targets (`shop-android-run`, `shop-ios-run`, `shop-mobile-test`, `shop-contract-gen`/`check`) mirroring the `cm-*`/`013` targets. Reuse `mobile-guard` and the `cm-ngrok-edge` target. Update `.PHONY`.
- [X] T010 ♻️ **[SECURITY — FR-020/D11]** `androidApp` manifest: add `INTERNET` permission, register the `EffyApp` Application class, and set `allowBackup="false"` (Amplify token store off backups; finer exclusion is S3s).

---

## Phase 2: Foundational (BLOCKING — all stories depend on these)

**⚠️ CRITICAL: no user-story work begins until this phase is complete.**

### 2a — Principle II: the shop contract codegen (satisfied here or not at all)

- [X] T011 [P] ♻️ Add a shop barrel `packages/shared-types/src/shop-contract.ts` re-exporting + aggregating the mobile-consumed types (`ShopStaffRecordDTO`, `ShopSummaryDTO`, `ShopManagerPingDTO`, the unions `ShopRole`/`ShopStaffStatus`/`ShopLifecycleStatus` — all from `shop.ts` — plus `ProblemJSON` **re-exported from `problem.ts`**, the shared RFC 9457 shape). Add `shop-contract:gen` (ts-json-schema-generator → quicktype, the 013 pipeline pinned to the same versions) → committed `contract/ShopDto.kt` + `shop-schema.json`.
- [X] T012 Run `shop-contract:gen`; review `ShopDto.kt`. Confirm `email: String?`, `shop: ShopSummaryDTO?`, `roles: List<String>`, and `status` as the `active|disabled` enum generate cleanly. Hand-fix + `@JsonClassDiscriminator` only if a union is mangled (D15 escape hatch).
- [X] T013 Add `shop-contract:check` (`gen && git diff --exit-code contract/`) into CI/`make shop-mobile-test` — **the drift alarm**. Wire the generated `ShopDto.kt` **and the SHARED `packages/design-system/compose/EffyTokens.kt` (srcDir'd — the SAME file 013 uses, NOT regenerated per-app; one source of truth, Principle II)** into the KMP `commonMain` source sets (srcDir, the 013 block form). Confirm the `ShopDto.kt` banner reads `// GENERATED — DO NOT EDIT`.

### 2b — Build config & the fail-loud contract (US6's mechanism)

- [X] T014 [US6] ♻️ `apps/shop-mobile/build.gradle.kts` — the required-key check → `GradleException` at configuration time (FR-035). `requiredKeys = [COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID, COGNITO_REGION, SHOP_API_BASE_URL]`. `defaultConfigs` only (no `targetConfigs`, K2 limit). Exposes `effyConfig` to `:shared`.
- [X] T015 [P] [US6] Create committed `secrets.properties.example` (keys, dummy values; **`COGNITO_APP_CLIENT_ID` = the SHOP MOBILE client id**, not web) + `.gitignore` `secrets.properties` / `amplify*outputs*.json` (FR-033).
- [X] T016 [P] [US6] **[SECURITY — FR-036]** Reuse `scripts/mobile-guard.sh` — assert no `requiredKeys` name matches `/SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL/i`, and the escape-hatch ban over `apps/shop-mobile`. Prove it by deliberately breaking it (011 lesson).

### 2c — Core spine

- [X] T017 [P] ♻️ `core/theme/EffyTheme.kt` — Material 3 theme consuming the **shared generated** `EffyColorScheme`s (the srcDir'd `packages/design-system/compose/EffyTokens.kt`, D4s — not a shop-mobile copy); dark mode follows the device (FR-004). No hardcoded hex.
- [X] T018 [P] ♻️ `core/config/AppConfig.kt` + the single Amplify config-string builder from BuildKonfig (D12). Unit-test the builder emits valid JSON.
- [X] T019 `core/auth/AuthDriver.kt` — the **EMAIL_OTP-only** interface + `Session(sub, accessToken, idToken)`, `AuthStep`, `AuthError` per [contracts/auth-driver.contract.md](./contracts/auth-driver.contract.md). **No sign-up, no password, no recovery** — the absences are the audience's rules. Pure Kotlin.
- [X] T020 `core/http/EffyHttpClient.kt` — a Ktor factory (Android engine); the **SINGLE access-token bearer** plugin: `Authorization: Bearer <session.accessToken>` on `/shop/v1/*` (D2s — **no** `X-Effy-Access-Token`). `expectSuccess=false`, `HttpTimeout`, `Logging` (**never BODY in release; sanitizeHeader Authorization** — SC-013). `expect fun httpEngine()`.
- [X] T021 `core/http/HttpErrors.kt` — map non-2xx → the closed error set (401 re-auth · 403 denied/refused · 429 wait · 503 degraded+retry — FR-031), parsing `ProblemJSON`, **surfacing no internal detail**.
- [X] T022 `core/session/SessionState.kt` + `SessionManager.kt` — the **login-first** machine (`Restoring`/`SignedOut`/`SignedIn(operator)`/`Refused`, data-model § 3). Bootstrap on launch; a `403` on identity read → `Refused` → destroy local session (FR-030). Listens to `AuthDriver.sessionChanges` (013 D11). **No Guest, no deferred-sign-in.**
- [X] T023 [P] ♻️ `core/nav/AppRoute.kt` + `AppNavigator.kt` — the `StateFlow` back stack (the 013 landed navigator, not Nav3).
- [X] T024 ♻️ `app/AppContainer.kt` — the one hand-wired container (`by lazy`; no framework). Holds the shop Ktor client, `ShopRepository`, the injected `AuthDriver`, `SessionManager`, `AppNavigator`.
- [X] T025 ♻️ `app/App.kt` — root composable: render by `SessionState` (Restoring splash → SignedOut sign-in → SignedIn shell → Refused message); `BackHandler` wired to the navigator; root `Surface` consumes `WindowInsets.safeDrawing` (both 013 review fixes). Wrap in `EffyTheme`.
- [X] T025a **[TABLET-FIRST — FR-003a/D10s]** `core/ui/WindowSize.kt` — `WindowWidth` (Compact/Medium/Expanded from Material 3 breakpoints, measured via `BoxWithConstraints` — **never** an `isTablet` boolean or a platform check) + `AdaptiveContent` (bounded, centered content on a tablet/large window; full-width reflow on compact). The **default single-column shell** the tablet-first screens use; the extension point a later multi-pane slice branches on. Applied to sign-in + the shell.

### 2d — The two driver implementations + the guard

- [X] T026 ♻️ `androidMain/.../AmplifyAuthDriver.kt` — implements the EMAIL_OTP `AuthDriver` over **Amplify Android**: `signIn(USER_AUTH, preferredFirstFactor EMAIL_OTP)` → `confirmSignIn(code)` → `fetchAuthSession` (surface **access + id token + sub**) → local `signOut`. Enumeration-safe error mapping (unknown user == not-authorized). Wire `Amplify.Hub` → `sessionChanges` (013 fix). **No password/sign-up methods exist.**
- [X] T027 ♻️ `androidMain/.../AmplifyBootstrap.kt` — configure Amplify Android from the in-code config string (keeps Amplify out of `:androidApp`). `EffyApp` (Application) calls it + owns the `AppContainer`.
- [X] T028 ♻️ `iosMain/.../IosAuthDriver.kt` + `IosAuthBridge` (callback interface) — the 013 bridge pattern, **EMAIL_OTP-only** (fewer methods). `iosApp/SwiftAuthBridge.swift` implements it over **Amplify Swift** (`signIn(.userAuth(preferredFirstFactor:.emailOTP))` → `confirmSignIn` → `fetchAuthSession` → `signOut`); `iOSApp.swift` configures Amplify + injects the bridge; `ContentView.swift` passes it. (iOS build is the operator's — T067.)
- [X] T029 [P] **[SECURITY]** Confirm the escape-hatch guard (T016) is clean against the driver source; **prove it fails** on a planted `escapeHatch` reference, then remove it (011 lesson).

**Checkpoint**: builds on both platforms, configures Amplify from code, a missing key fails the build, the
generated contract/theme compile, the guard was seen to fail. Foundation ready.

---

## Phase 3: User Story 1 — Sign in with an emailed code (P1) 🎯 MVP

**Goal**: a login-first app that signs in by email → code (no password, no sign-up, no guest) on both platforms.

**Independent test**: on a provisioned operator, email → code → signed in, on Android **and** iOS; confirm **no**
password field, **no** sign-up, **no** guest content anywhere.

- [X] T030 [P] [US1] `features/auth/presentation/` — a two-step sign-in as MVVM `ViewModel`s (immutable `StateFlow`): **email** screen → `signInWithEmailOtp` → **code** screen → `confirmOtp`. `viewModel { }` factory (013 fix). No password field, no "create account", no "forgot password" (FR-008).
- [X] T031 [US1] [P] `features/auth/domain/` use cases (`RequestSignInCode`, `ConfirmSignIn`) over `AuthDriver` — the ViewModel depends on THESE, not the driver (a formal domain layer; `AuthUseCasesTest` proves it's testable with a fake). Enumeration-safety is enforced in the driver (`UserNotFound`==`NotAuthorized`→`InvalidCredentials`) + the ViewModel's uniform `message()`; the dedicated **enumeration** unit test is still **deferred**.
- [X] T032 [US1] On `Done`, drive `SessionManager.onSignedIn()` → the shell. Rate-limit UX (`RateLimited` explains the wait — FR-012). Offline handling (FR-007): plain state + retry, nothing lost.
- [X] T033 [P] [US1] Confirm native affordances (iOS back-swipe, scroll physics, touch targets FR-005, largest text + screen reader FR-006) **and tablet-first layout (FR-003a/SC-014a — no stretched phone column; graceful reflow tablet-landscape → phone → split-screen)** — a device-matrix pass **led by a large-screen tablet in landscape**, recorded.

**Checkpoint**: MVP — a provisioned operator signs in by code, on both platforms, with no forbidden affordances.

---

## Phase 4: User Story 2 — The app remembers the operator (P2)

**Goal**: session persists across restart; sign-out clears it; return-to-intent.

**Independent test**: sign in → force-quit → reopen → still signed in. Sign out → next launch requires sign-in;
no usable session on the device.

- [X] T034 [US2] Session bootstrap on launch: `currentSession()` → `SessionState` (Restoring→SignedIn/SignedOut). Background renewal via `currentSession(forceRefresh)`; ask for a new code only when renewal is impossible (FR-014/FR-015).
- [~] T035 [US2] Return-to-intent (FR-017) — **DEFERRED BY DESIGN.** shop-mobile is **login-first** with a single post-login destination and no deep links, so there is no "intended destination" to return to yet; the *guarantee* (no protected access while signed out) holds by construction. Deferred to the first slice that adds a deep-linkable destination. Recorded in the parity register (row 3 footnote †).
- [X] T036 [P] [US2] **[SECURITY — FR-016]** Verify tokens live in Amplify's Keychain (iOS) / Keystore-backed store (Android), not Multiplatform Settings; sign out → **no usable credential remains** (SC-009). Handle Amplify's unexpected sign-out (`sessionChanges` → `SignedOut` with an explanation). Device-matrix task.

**Checkpoint**: the session survives restart; sign-out is clean; deep links return correctly.

---

## Phase 5: User Story 3 — See who the platform says you are (P3)

**Goal**: record-backed identity (name/email, role, status, assigned shop); role-less/unassigned as expected.

**Independent test**: sign in as a fully-provisioned manager (identity + role + shop shown); sign in as the
role-less/unassigned operator D (an expected "unassigned" state, not an error).

- [X] T037 [US3] `features/shop/data/ShopRepository` + `HttpShopRepository` — `GET /shop/v1/me` (idempotent JIT record read, FR-020) with the **access token** bearer. DTO→domain via `toDomain()`; **`toShopRoles` narrowing in the domain layer** (unknown role dropped — D4s); **`email`/`shop` null = expected states**. DTO never leaves the data layer.
- [X] T038 [US3] `features/shop/presentation/` — the identity display in the shell, rendered **from the record, never the token** (FR-019). A **missing email** shows a graceful placeholder, never a raw sub (FR-021).
- [X] T039 [P] [US3] Role-less / shop-unassigned operator → an **expected in-progress state** (SC-010), not an error/dead-end. Unit-test the mapper for `roles:[]` and `shop:null`.

**Checkpoint**: identity is shown from the record; the "not fully set up yet" states are legible.

---

## Phase 6: User Story 4 — Role-aware UI, but the platform decides access (P4) ⚠️ THE SECURITY CORE

**Goal**: manager controls hidden from staff; the **backend manager gate** decides (role AND status AND shop
scope), uniform and fail-closed; the hidden control is never the guard.

**⚠️ Partial sign-off (007):** the gate's **positive** half needs 009 shop data; the **negative** half is
provable now.

**Independent test**: staff/role-less → no manager controls; manager at an active shop → granted; manager with
no assigned shop → **refused despite the role**, with a uniform denial.

- [X] T040 [US4] `features/shop/presentation/` — **role-aware UI**: hide manager-only destinations/controls from `shop_staff`/role-less, from `operator.isManagerByRole` (the record's role). **A courtesy, not the guard** (FR-022).
- [X] T041 [US4] **[SECURITY — the gate]** `ShopRepository.managerAccess()` → `GET /shop/v1/manager-ping` → `Granted` (200) / `Denied` (403). Called for the **actual authorization** whenever a manager capability is exercised — **even when the role passes** (FR-023). The `cognito:groups` claim / hidden control is **never** the decision (FR-027).
- [X] T042 [US4] **[SECURITY]** Render **one uniform denial** for any 403 (FR-025); **fail closed** — a 503/error is no-grant, not a grant (FR-026). No internal detail surfaced.
- [X] T043 [P] [US4] **[adversarial test]** Unit + instrumented: staff/role-less/unassigned-manager → `Denied`; the denial message is identical regardless of which term failed (SC-006/SC-007). The unit layer proves the app *cannot* infer a grant from the role alone; the live proof is the device matrix (operator B).

**Checkpoint**: the interface adapts to the role, but the platform decides access — uniform, fail-closed.

---

## Phase 7: User Story 5 — A shop credential works nowhere else; graceful failures (P5)

**Goal**: cross-pool isolation + legible degraded/expired/denied states.

**Independent test**: present the shop token to another audience's service → structural refusal. Kill network →
degraded + retry, nothing lost. Expire the session → clean return to sign-in.

- [X] T044 [P] [US5] Confirm the app presents its credential **only** to `/shop/v1/*` (FR-029): a unit/arch test asserts no repository targets a non-shop base URL. The shop client is built for one base URL.
- [X] T045 [US5] Map the error states end-to-end (FR-031): expired/absent session → re-auth; 403 → denial; 503/offline → **degraded + retry** losing nothing. Surface **no internal detail** (SC-013 partial).
- [X] T046 [P] [US5] **[SECURITY]** Cross-pool isolation proof (FR-028): a device-matrix task — present the shop token to an employee service scoped to another audience and confirm a **structural** refusal (the authorizer cannot accept it). Documented in quickstart § 6.

**Checkpoint**: the credential is refused elsewhere; failures are recoverable and leak nothing.

---

## Phase 8: User Story 6 — Build without holding a secret (P6)

*(mechanism built in Phase 2b; these verify it.)*

- [X] T047 [P] [US6] **Prove FR-035**: blank a key → `./gradlew :shared:assemble` fails at configuration time naming it. **Prove FR-036**: `mobile-guard` rejects a secret-shaped key; inspect the built app for any capability-granting value → none.
- [X] T048 [P] [US6] Confirm switching environments is **config only** (FR-034) and that `secrets.properties` + any generated config are git-ignored (FR-033) — a repo sweep finds zero env values/secrets in VCS (SC-011).

**Checkpoint**: a clean checkout builds from config alone; nothing capability-granting ships in the binary.

---

## Phase 9: Polish & cross-cutting

- [X] T049 🧑‍💻 **[SPIKE S3s]** The exact Amplify Android shared-prefs filenames to exclude from Auto Backup (reuse 013's finding). Feeds T010's `dataExtractionRules` refinement if wanted.
- [X] T050 [P] **[SECURITY — SC-013]** Credential-in-logs sweep: no code/token in any log on either platform in release config; no PII beyond the subject id.
- [X] T051 [P] Accessibility + dark-mode contrast pass across all flows (FR-006, SC-014): keyboard/screen-reader completable, largest text, contrast light **and** dark. **Include the tablet-first check (SC-014a)**: on a tablet in landscape every screen uses the space (no stretched phone column) and reflows cleanly to phone / split-screen.
- [X] T052 `docs/audiences/shop-capabilities.md` — mobile column filled (rows 1–8, 10 = ✅; **row 9 telemetry = ⏸ deferred** with a legend entry + footnote, so it does not overstate — FR-038/SC-015); row 3 (return-to-intent) and row 7 (manager gate positive-half) carry honest footnotes. No unstated cell.
- [X] T053 [P] **Two constitution deviations recorded** in the parity doc (new *Constitution deviations* table) — Principle V (iOS Material 3 → `iOS native shell`) + Principle VII (no telemetry → `mobile-telemetry`), both shared with 013; **confirmed matching** [plan.md](./plan.md) Complexity Tracking (lines 96–105).

---

## Phase 10: Operator sign-off 🧑‍💻

- [X] T054a **[TERRAFORM AUTHORED]** `infra/envs/dev/auth-shop.tf` — the **`shop_mobile`** `aws_cognito_user_pool_client` (EMAIL_OTP only: `ALLOW_USER_AUTH` + refresh, **no SRP/USER_PASSWORD**; `generate_secret=false`; 30-day refresh — D6s), its SSM param `/effy/dev/auth/shop/mobile_app_client_id`, and the `shop_mobile_app_client_id` output; `edge-gateway.tf` adds the client id to the shop authorizer's `extra_client_ids` (D3s). `terraform fmt` + `validate` clean. **Additive** — mirrors 013's `customer_mobile`, pool untouched.
- [X] T054 🧑‍💻 `make plan ENV=dev` → **READ IT** → `make apply ENV=dev`: applies T054a's `shop_mobile` app client + SSM param + shop authorizer **audience**. **⚠ ABORT if the pool or web client shows `-/+` / "must be replaced"** — all changes are additive. Then `make output` → copy `shop_mobile_app_client_id` into `secrets.properties` (`COGNITO_APP_CLIENT_ID`).
- [X] T055 🧑‍💻 **Device matrix** ([quickstart.md](./quickstart.md) § 6): every flow on a **large-screen tablet in landscape (Android tablet AND iPad) as the PRIMARY target**, plus a phone as the compact case — "two SDKs behave identically" is a claim until exercised (SC-001), and **tablet-first (FR-003a/SC-014a) is a claim until seen on a real tablet** (S4s: deliberate use of the space, graceful reflow). **Includes the live SC-003** (request a code for an email that is **not** a provisioned operator → the response is **identical** to a real operator's — enumeration non-disclosure, verified adversarially, not just unit-tested) and **SC-002** (app-open → signed-in in **under 90 s**).
- [X] T056 🧑‍💻 **The adversarial proof** (SC-006/SC-007): operator **B** (a `shop_manager` with **no assigned shop**) is **refused** the manager capability — the role alone is not enough — and the refusal is **uniform**. Demonstrated, not asserted.
- [X] T057 🧑‍💻 Live SC sign-off — **partial by design** (007): the gate's **positive** half (operator A **Granted**) + inactive-shop / disabled-operator denials against **009** shop data; the **negative** half signed off now. Then commit the slice.

---

## Dependencies & Execution Order

```
Phase 0 (preconditions/spike) ─ T001/T002/T003 gate runtime; T004 confirms the auth flow
   │
Phase 1 (Setup) ──► Phase 2 (Foundational — the bulk, mostly ♻️ ported from 013) ──► ALL user stories
   │
Phase 2a codegen (Principle II) · 2c core · 2d drivers ─ gate every feature
   │
Phase 3 (US1 sign-in) ─┐
Phase 4 (US2 session) ─┤  US3/US4 need the record repo (T037); US4 is the security core
Phase 5 (US3 identity)─┤
Phase 6 (US4 gate) ────┤
Phase 7 (US5 isolation)┘
   │
Phase 8 (US6 verify) · Phase 9 (Polish) ──► Phase 10 (Operator sign-off) — last
```

### Within each story
- Domain (use cases, pure) before presentation; the repository (T037) before the screens that read it.
- US4's gate call and the role-aware UI are **one security argument** — the hidden control is never the guard;
  do not let T040 (hide) stand in for T041 (decide).

### Parallel opportunities
- **Phase 1**: T008 · T009. **Phase 2a**: T011 (gen) alongside **2c** T017 · T018.
- **Across stories once Phase 2 lands**: US1, US2, US5 are largely independent; US3 and US4 share the record repo
  (T037), so US4 waits on it.

---

## Implementation Strategy

### MVP (US1)
Phase 0 preconditions → 1 → 2 → **US1** (T001–T033). A provisioned operator signs in by emailed code, on both
platforms, with no forbidden affordances — proving the KMP foundation, the codegen, the fail-loud config, and
EMAIL_OTP against the real shop pool.

### Incremental delivery
US1 (sign in) → US2 (persistence) → US3 (identity) → US4 (the gate — the security core) → US5 (isolation).

### The two things that gate everything
1. **T001/T002/T003** — no backend, email, or operators → nothing past the sign-in screen works.
2. **The manager gate (US4)** is the one property this surface most easily gets wrong. The hidden control is a
   courtesy; `manager-ping` is the authority. Build them together, and prove the negative half adversarially.

---

## Notes
- **🧑‍💻 = operator-run**; **♻️ = port from 013** (`apps/customer-mobile`) — copy, re-package, adapt the shop delta.
- **The AuthDriver's absences are the audience** — no password/sign-up/recovery methods; do not add them.
- **Single access-token bearer** — never send the ID token or `X-Effy-Access-Token` to `/shop/v1/*` (D2s).
- **The generated `ShopDto.kt` is committed + drift-guarded** — the Kotlin cannot be stale and green.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
</content>
