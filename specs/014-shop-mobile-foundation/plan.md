# Implementation Plan: Shop Mobile Foundation (Bootstrap)

**Feature dir**: `specs/014-shop-mobile-foundation` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md) · [planning-inputs.md](planning-inputs.md) (the operator's stack/infra directives) ·
[research.md](research.md) (Phase 0) · [ARCHITECTURE.md](../../ARCHITECTURE.md) ·
[constitution](../../.specify/memory/constitution.md) v1.8.0 · and — heavily —
[**013-customer-mobile-foundation**](../013-customer-mobile-foundation/) (the proven mobile foundation).

---

## Summary

Build `apps/shop-mobile` — today a bare KMP template — into the shop audience's **second surface**: a
**login-first** Android + iOS operator app that signs in by **email one-time code only**, reads the operator's
platform record (identity, role, status, assigned shop), adapts the interface to the role, and honours the
**backend-authoritative manager gate**. Every mobile cell of the shop parity register
([docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md)) is ⬜; this slice fills them.

**This is "013 for the shop audience."** The entire tech and architecture spine is reused from
013-customer-mobile-foundation — the constitution's proven mobile foundation — so this plan re-uses 013's
research (its D-notes) wherever identical and **only re-decides what the shop audience changes**:

| | 013 (customer) | 014 (shop) |
|---|---|---|
| Credential routes | password **+** EMAIL_OTP | **EMAIL_OTP only** — no password, no SRP, one route |
| Self-registration | open | **none** — admin-provisioned (009); the app exposes no sign-up/recovery/password |
| Entry model | guest-first | **login-first** — no guest state; opens to sign-in |
| Token to backend | **two-token** (ID token + `X-Effy-Access-Token`) | **single access token** as `Authorization: Bearer` |
| RBAC | none | `shop_manager` / `shop_staff`; role-aware UI + the **manager gate** |
| Account features | name, set/change password, sign-out-everywhere | **none** — identity read + gate (bootstrap, like 007) |
| Backend | `edge-api/customer` (deploy pending) | `edge-api/shop` — **already serves both surfaces, no change** |
| Cognito client | `customer_mobile` (90-day refresh) | **new `shop_mobile`** (30-day refresh, no SRP — D3s) |

The net effect is that **the shop app is simpler than the customer app**: one credential route, one token, no
account-management flows. The added complexity is the **RBAC gate** (role-aware UI + `manager-ping`) and the
partial-by-design sign-off it inherits from 007.

---

## Technical Context

**Language/Version**: Kotlin **2.4.0** (KMP) · Swift (the iOS auth bridge + entry point) · Node/TS (reuse the
013 codegen scripts, re-targeted at the shop contract)

**Primary Dependencies**: Compose Multiplatform **1.11.1** · Navigation via a `StateFlow` back stack +
`BackHandler` (as landed in 013) · `androidx.lifecycle` **2.10.0** · **Ktor 3.5.x** (Android engine, **not**
OkHttp — the 013 okhttp-5-vs-Amplify fix) · kotlinx.serialization · **Amplify Android ≥ 2.25.0** / **Amplify
Swift ≥ 2.45.0** · **BuildKonfig 0.22.0** · Multiplatform Settings (non-sensitive prefs only)

**Storage**: **No app database.** Tokens live in Amplify's secure stores (Keychain / Keystore-backed).

**Testing**: `kotlin.test` in `commonTest` (ViewModels' immutable-state transitions, mappers, config builder,
`toShopRoles` narrowing) · contract tests against recorded dev fixtures with `ignoreUnknownKeys = false` · a
device matrix for what can't be honestly unit-tested (the gate, cross-pool isolation, "identical on both
platforms", **and the tablet-first layout — FR-003a/SC-014a**). The matrix **leads with a large-screen tablet
in landscape** (Android tablet **and** iPad) and includes a phone as the compact case.

**Target Platform**: Android minSdk 24 / compile+target 36 · iOS ≥ 14.0 (`iosArm64` + `iosSimulatorArm64`)

**Form factor (FR-003a — tablet-first)**: The primary device is a **large-screen tablet in landscape** (counter /
back-room), the phone the secondary compact case. Layouts are **window-size-driven, not device-typed**: Compose
Multiplatform's `calculateWindowSizeClass()` (Material 3 `WindowSizeClass`, available in commonMain) selects
between an **expanded** layout (two-pane / master-detail, `ListDetailPaneScaffold`-style, using the width) and a
**compact** single-column reflow — from `BoxWithConstraints` / the size class, never a hardcoded `isTablet`
boolean or a platform check. State stays hoisted in the `ViewModel` so a size/orientation/split-screen change
re-renders the same state into the other layout. This slice's ~5 screens are simple, but the **shell and every
later shop-mobile UI slice inherit this rule** — it is set here so it is not retrofitted.

**Project Type**: Mobile app (KMP + Compose), one `shared` module + two thin app modules

**Performance Goals**: 60 fps; cold start to first paint under 2 s

**Constraints**: No secret in the binary (FR-036) · no credential in any log (SC-013) · tokens only in protected
storage (FR-016) · **authorization decided by the backend, never the hidden control or the role claim**
(FR-023) · a shop credential refused everywhere else (FR-028)

**Scale/Scope**: ~5 screens (sign-in email, sign-in code, the authenticated shell/home with identity + role-aware
nav, a manager-gated destination proving the gate, a signed-out/error state). No workflow yet.

---

## Constitution Check

*GATE — evaluated before Phase 0, re-checked after Phase 1 (bottom of this file).*

**No amendment is required** (constitution v1.8.0). Two deviations are taken knowingly and recorded — both
**inherited from 013**, so the two mobile surfaces stay consistent.

| Principle | Verdict |
|---|---|
| **I — Spec-Driven** | ✅ The operator's stack/infra directives were kept out of `spec.md` and preserved in [planning-inputs.md](planning-inputs.md). |
| **II — Shared Contracts** | ✅ The shop DTOs are **generated** from `packages/shared-types/src/shop.ts` (the same source the web surface types from) into committed, drift-guarded Kotlin — the 013 D15 pipeline re-targeted. `toShopRoles` tolerant narrowing lives in the **domain** layer, not the generated DTO (D4s). |
| **III — Dual-Path** | ✅ No new backend. `edge-api/shop` already serves both surfaces; this app is a second consumer. No commerce traffic. |
| **IV — Auth Isolation** | ✅ Shop pool only; **EMAIL_OTP only**, **no self-signup**, **no password**; the `cognito:groups` claim is the **origin** of role, the platform record the **authority** on access (FR-023/FR-027); a shop credential is structurally refused elsewhere (FR-028). New client preserves isolation (D3s). |
| **V — Design** | ⚠ **DEVIATION 1 — recorded.** iOS renders Material 3, not full HIG parity (inherited from 013). See Complexity Tracking. |
| **VI — Layered Architecture** | ✅ Clean Architecture per feature; **MVVM** — a `ViewModel` exposing an immutable `StateFlow<UiState>` + action functions (constitution **v1.8.0**); no DI framework — one hand-wired container. Conforms to `ARCHITECTURE.md` § *Mobile apps*. |
| **VII — Observability** | ⚠ **DEVIATION 2 — recorded.** Telemetry deferred (mirroring 013). See Complexity Tracking; and the shop parity register is reconciled to say "deferred" (FR-038). |

### Complexity Tracking — the two deviations

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Principle V — iOS does not follow Apple HIG.** Material 3 on both platforms; iOS chrome is Material's, no Liquid Glass. | Inherited from 013's operator decision (2026-07-14). Building the SwiftUI-shell HIG hybrid on this slice too would double the deviation-closing work; doing it once, later, for both mobile apps is cheaper. | Same as 013: `compose-cupertino` is a dead alpha; a full SwiftUI UI doubles effort. **Reversible** — ViewModels/domain/data are in `commonMain`, so a later HIG pass touches presentation only. **Closing slice: `iOS native shell` (unscheduled, shared with 013).** The honest claim (native scroll/back-swipe/text/accessibility; not HIG parity) goes in the parity register. |
| **Principle VII — no crash reporting, no product analytics.** | Operator decision (spec § Clarifications). Deferred to keep the two mobile surfaces consistent (013 deferred the same); shipping one mobile app with telemetry and one without is its own inconsistency. | Deferring is a real cost — the shop parity register (row 9) had scoped it in, so **the register is reconciled to "deferred"** in this change (FR-038) rather than left overstating delivery. Both are `core/platform/` drivers, so telemetry lands later as an addition. **Closing slice: `mobile-telemetry` (shared with 013).** SC-013 (no credential/PII in telemetry) already binds whatever ships later. |

---

## Project Structure

### Documentation (this feature)

```text
specs/014-shop-mobile-foundation/
├── spec.md · planning-inputs.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── edge-api-shop.contract.md      # the shop backend as this app consumes it (single-token)
│   └── auth-driver.contract.md        # the EMAIL_OTP-only AuthDriver boundary
└── checklists/requirements.md · tasks.md (from /speckit-tasks)
```

### Source Code (repository root)

```text
apps/shop-mobile/                          # an INDEPENDENT Gradle build; package root com.effyshopping.shop.mobile
├── secrets.properties (⛔ git-ignored) · secrets.properties.example (✅) · build.gradle.kts (fail-loud config)
├── gradle/libs.versions.toml             # mirror 013's catalog (ktor-android, amplify, buildkonfig, backhandler…)
├── shared/src/
│   ├── commonMain/kotlin/com/effyshopping/shop/mobile/
│   │   ├── app/                          # AppContainer (hand-wired DI), AppNavigator, root App composable
│   │   ├── core/
│   │   │   ├── auth/                      # AuthDriver INTERFACE (EMAIL_OTP only) + Session/AuthStep models
│   │   │   ├── config/                   # BuildKonfig readers + the ONE Amplify config string
│   │   │   ├── http/                      # Ktor factory; SINGLE access-token bearer plugin (D2s)
│   │   │   ├── session/                   # SessionState machine (login-first: Restoring/SignedOut/SignedIn)
│   │   │   ├── nav/                        # AppRoute + StateFlow back stack
│   │   │   └── theme/                      # EffyTheme — consumes the GENERATED tokens
│   │   ├── contract/                      # ⚙ GENERATED ShopDto.kt (from shop.ts) — committed, drift-guarded
│   │   │                                   # (design tokens are NOT regenerated per-app — see below: the shared
│   │   │                                   #  packages/design-system/compose/EffyTokens.kt is srcDir'd in, D4s)
│   │   └── features/
│   │       ├── auth/                       # sign-in (email → code), the ONLY credential flow
│   │       └── shop/{domain,data,presentation}/  # identity read, role-aware shell, the manager gate
│   ├── androidMain/…/                     # AmplifyAuthDriver (Amplify Android) · Ktor Android engine · Amplify bootstrap
│   ├── iosMain/…/                         # Ktor Darwin engine · IosAuthDriver + IosAuthBridge (Swift implements)
│   └── commonTest/…/                      # role narrowing, mappers, config builder, contract fixtures
├── androidApp/                            # EffyApp (Amplify configure) + MainActivity; Auto-Backup exclusion
└── iosApp/                                # SwiftAuthBridge.swift (Amplify Swift) + iOSApp/ContentView wiring

packages/shared-types/                     # + contract/ShopDto.kt + shop schema (committed, CI-diff-guarded)
packages/design-system/compose/            # EffyTokens.kt REUSED as-is (same brand) — srcDir'd into shop-mobile,
                                            #   NOT regenerated per app (one source of truth, Principle II, D4s)
infra/envs/dev/auth-shop.tf                # NEW: shop_mobile app client + its SSM param  (D3s)
infra/envs/dev/edge-gateway.tf             # shop authorizer audience += the mobile client id  (D3s) — the two infra changes
Makefile · scripts/mobile-guard.sh          # shop-mobile targets + the guard reused
docs/audiences/shop-capabilities.md         # the mobile column — filled in; telemetry row → deferred (FR-038)
```

**Structure Decision.** One `shared` module (JetBrains' current KMP default; AGP 9 requires it), identical to
013. Package root `com.effyshopping.shop.mobile` (already set by the scaffold). Package boundaries mirror the
eventual module boundaries so extraction later is mechanical.

---

## The security spine (what this slice must not get wrong)

Three things, in the order they would fail — note this list is **shorter than 013's** (no password write, so no
step-up, no escape-hatch-password concern):

1. **Single access-token bearer** (D2s). `Authorization: Bearer <shop access token>` to `/shop/v1/*`. **Not** the
   two-token protocol — the shop backend never calls Cognito, so there is no `X-Effy-Access-Token`. The shop
   handlers read `subject`/`groups` from the gateway-verified access-token claims, exactly as shop-web sends.
   One header, simpler than 013.

2. **The manager gate is the backend's, never the app's** (FR-023–FR-027, D5s). The app **hides** manager-only
   controls from `shop_staff` (role from the record), but the *authorization* is decided by
   `GET /shop/v1/manager-ping` — the platform joins the operator's **role AND status AND active-shop scope** and
   returns a **uniform 403** that never says which term failed, **fail-closed**. The app must treat the hidden
   control as a courtesy and the `manager-ping` result as the truth. The `cognito:groups` claim is the origin;
   the record is the authority.

3. **No credential in any log** (SC-013). Ktor `LogLevel.BODY` never in release; the `Authorization` header is
   `sanitizeHeader`-redacted even in debug. A build setting, not a good intention.

Plus cross-pool isolation (FR-028): the app authenticates against the shop pool only and presents its credential
to `/shop/v1/*` only; a shop token is structurally rejected by every other audience's authorizer.

---

## Telemetry (Principle VII)

**None ships in this slice** (Deviation 2, closing slice named). What this slice owes and pays: SC-013 (no
credential/PII in logs) is enforced now via the Ktor logging config; the `core/platform/` driver pattern is
established so Crashlytics + PostHog land later as additions; and — critically — the **parity register is
corrected** so it does not claim mobile telemetry it does not have (FR-038).

---

## Phasing

| Phase | What | Gate |
|---|---|---|
| **0** | Research — the shop deltas (D1s–D9s), reusing 013's D-notes for everything identical | ✅ done ([research.md](research.md)) |
| **1** | Design — data model, contracts, quickstart | ✅ done (this commit) |
| **2** | Scaffold + the codegen pipeline re-targeted at `shop.ts` (committed + drift-guarded) | **Principle II here or not at all** |
| **3** | Build config (BuildKonfig, fail-loud, the no-secret-key guard) | A missing key fails the build |
| **4** | Core: Ktor (single-token), `AuthDriver` interface (EMAIL_OTP only), `AppContainer`, `EffyTheme`, nav, `SessionState` | — |
| **5** | The two driver implementations: Amplify Android + Swift `IosAuthBridge` (EMAIL_OTP only — fewer methods than 013) | The auth boundary |
| **6** | Features: sign-in (email → code); the role-aware shell (identity read); the **manager gate** call + uniform denial | The security core |
| **7** | Android Auto-Backup exclusion; the credential-in-logs sweep | FR-016, SC-013 |
| **8** | Tests: role narrowing, mappers, contract fixtures | The drift alarm |
| **9** | Operator: the Terraform apply (shop_mobile client + authorizer audience), the device matrix, live SC sign-off (partial by design) | See below |
| **10** | Shop parity register filled + telemetry row reconciled + the two deviations recorded | FR-038 |

---

## Open items requiring the operator

| # | Step | Note |
|---|---|---|
| **O1** | `make apply ENV=dev` — the new **`shop_mobile`** app client (EMAIL_OTP, 30-day refresh) + its SSM param + the shop authorizer **audience** (D3s) | Both additive; the shop pool and web client are **untouched**. **Abort if the plan shows the pool or web client as `-/+`.** Then `make output` → the shop-mobile client id into `secrets.properties`. |
| **O2** | Make `edge-api/shop` reachable — **already deployed for shop-web**, or run locally (`make edge-offline SERVICE=shop`) + ngrok, and confirm `/shop/healthz` | No backend change; the shop service already serves both surfaces. |
| **O3** | Email path — the shop pool's EMAIL_OTP sender must deliver (the built-in Cognito sender is fine for dev; branded SES is 010) | Without email, sign-in cannot be exercised. |
| **O4** | **Provision test operators** in the shop pool (via 009 back-office, or `AdminCreateUser` + group): a `shop_manager`, a `shop_staff`, and a role-less/unassigned operator | The negative half of the gate needs an unassigned manager; the positive half needs a manager at an **active shop** (009 data). |
| **O5** | The **device matrix** — every flow on a **large-screen tablet in landscape** (Android tablet **and** iPad) as the **primary** target, plus a phone as the compact case | "Two SDKs behave identically" is a claim until exercised — and **tablet-first (FR-003a/SC-014a)** is a claim until seen on a real tablet: no stretched phone column, graceful reflow to phone/split-screen. |
| **O6** | Live SC sign-off — **partial by design** (007): the gate's positive half + inactive-shop/disabled-operator denials need 009 shop data; the negative half (staff, role-less, unassigned manager refused) is provable now | Demonstrated, not asserted. |

---

## Post-Design Constitution Re-check

Re-evaluated after Phase 1. **No new violations.** The two deviations are unchanged, recorded, each with a
named (013-shared) closing slice.

The design is **strictly simpler than 013** on the auth axis (one route, one token, no account writes) and adds
exactly one thing 013 did not have — **RBAC done right**: the interface adapts to the role, but the *decision* is
the backend's, from the record, uniform and fail-closed. That is the one property this surface most easily gets
wrong, and it is the reason the security spine centres on it.
</content>
