# Implementation Plan: Mobile App Shell & Navigation (Customer + Shop)

**Branch**: `015-mobile-app-shell` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-mobile-app-shell/spec.md`

## Summary

Replace the interim single-destination navigators in **both** KMP mobile apps with a **production-grade,
adaptive navigation shell**: a primary navigation that renders as a **bottom bar on compact widths** and
a **navigation rail on expanded (tablet) widths** (`NavigationSuiteScaffold`), **per-tab back stacks**
with state preservation, config-change + process-death survival, and a **top-level session gate** that
selects the auth graph vs. the main tab graph. The **customer** app is **guest-first** (public Home/Search;
authenticated Orders/Account; **deferred sign-in with return-to-intent**); the **shop** app is
**login-first** (sign-in the only public screen, everything gated). Navigation is modelled on Uber Eats /
eBay (DOCTRINE-1); screens are sectioned/tabbed with **no card layouts** (DOCTRINE-2).

**Navigation mechanism**: **Jetpack Navigation 3** (`androidx.navigation3`, via JetBrains' CMP republish
— KMP/iOS-capable on CMP ≥ 1.10; the repo is on **1.11.1**). Its model *is* a developer-owned
`List<NavKey>` back stack — a natural, low-friction upgrade from the app's existing hand-rolled
sealed-route `AppNavigator` — paired with `NavigationSuiteScaffold` (adaptive chrome) and the official
**Multiple Back Stacks** (`Map<Tab, NavBackStack>`) pattern. Two iOS-specific risks are de-risked by
**spikes before the pattern is committed** (§ Delivery Phasing): (1) `@Serializable` `NavKey` +
polymorphic serialization round-tripping state across **iOS process death**, and (2) the **beta**
`adaptive-navigation3` scene strategy on iOS at tablet width. If either fails, the **named fallback** is
JetBrains **Navigation-Compose** for the primary nav — the shell and session-gate design are
library-agnostic by construction, so the fallback costs the mechanism, not the architecture.

**No backend / no infra / no DB**: this is a **mobile-app-code-only** slice. It **reuses** each app's
existing auth boundary (`AuthDriver` + platform Amplify/Swift actuals) and `SessionManager`/`SessionState`
unchanged; it adds no endpoints, no migration, no Terraform. There are therefore **no operator cloud
steps** — the operator's only role is running the apps on device/simulator for the live validation in
[quickstart.md](./quickstart.md).

**Shared, not copy-pasted (Principle II)**: the generic, audience-neutral shell primitives (adaptive
`NavigationSuiteScaffold` wrapper, `WindowSize`/`AdaptiveContent`, the per-tab back-stack holder, the
`NavKey` base + serialization scaffolding, the session-gate scaffold, the deferred-intent store) live in
**one shared mobile package** consumed by both apps — each app supplies only its own tabs, routes, and
session mapping (the same way `@effy/web-kit`'s `ConsoleShell` is generic over the web surfaces). This
also **fixes an existing asymmetry**: the customer app currently has **no** adaptive layer (shop's
`WindowSize.kt` was app-local); the shared package gives both.

## Technical Context

**Language/Version**: Kotlin **2.4.0**, Compose Multiplatform **1.11.1**, Material3 **1.11.0-alpha07**,
AGP 9.0.1, minSdk 24 / target+compileSdk 36, iOS `iosArm64` + `iosSimulatorArm64`.

**Primary Dependencies (new for this slice)**:
- `org.jetbrains.androidx.navigation3:navigation3-ui` (**1.1.1**, CMP/iOS) + transitive `navigation3-runtime`.
- `org.jetbrains.androidx.lifecycle:lifecycle-viewmodel-navigation3` (**2.10.0**) — per-entry ViewModel scoping (fits MVVM).
- `org.jetbrains.androidx.navigation3:adaptive-navigation3` (**1.3.0-beta02**, *beta — isolate*) — list-detail scene strategy for tablet.
- `org.jetbrains.compose.material3.adaptive:adaptive-navigation-suite` (CMP adaptive train for 1.11.x) — `NavigationSuiteScaffold` bottom-bar↔rail.
- `org.jetbrains.kotlinx:kotlinx-serialization` (already present) — `@Serializable` `NavKey` routes.
- *Note*: `navigation3` + `lifecycle-viewmodel-navigation3` are **already declared** (unused) in **both per-app catalogs** (`apps/customer-mobile/gradle/libs.versions.toml` and `apps/shop-mobile/gradle/libs.versions.toml` — there is **no root catalog**); the adaptive-suite + adaptive-navigation3 artifacts are **not yet** present and must be added to **both**.

**Reused (unchanged)**: each app's `AuthDriver` + `AmplifyAuthDriver`/`IosAuthDriver`, `SessionManager` +
`SessionState`, `EffyTheme` + generated `compose`/`compose-shop` tokens, Ktor `edgeClient`/`shopClient`,
and all `features/**/domain` use cases + the `AppContainer` explicit-wiring DI pattern.

**Storage**: none new. Navigation back stacks are **saveable** (`rememberNavBackStack`/`rememberSaveable`);
the deferred-sign-in **pending intent** is a small **serializable** in-memory store (must survive process
death). Tokens/session remain owned by the existing `AuthDriver`.

**Testing**: `kotlin.test` + `kotlinx.coroutines.test` in `commonTest`, hand-written fakes (no mocking lib,
no DI framework) — session-gate transitions, per-tab back-stack holder, deferred-intent capture/resume,
`NavKey` polymorphic-serialization round-trip, and the adaptive width→nav-form mapping.

**Target Platform**: Android + iOS; phone (compact) and tablet (expanded), portrait + landscape + split.

**Project Type**: mobile — 2 KMP apps + 1 shared mobile package.

**Performance Goals**: cold-start to interactive shell **≤ ~2s** (mid-range); **instant** tab switch (state
swap, not rebuild); **zero** navigation/lifecycle crashes; state restore across process death (esp. iOS).

**Constraints**: DOCTRINE-2 (no cards — incl. refactoring the existing shop "identity card"); DOCTRINE-1
(Uber Eats / eBay nav patterns); Principle V native feel (HIG/Material, safe areas, touch targets);
Principle VI (MVVM, unidirectional, no DI framework, explicit wiring); client gating is a **courtesy** —
the backend remains authoritative (Principle IV).

**Scale/Scope**: 2 apps × (auth graph + tabbed main graph); customer 4 tabs (Home/Search/Orders/Account),
shop ~4 destinations (Home/Catalog/Orders/Account, **Catalog/Orders** "coming soon"); most tab *content* is
placeholder pending future slices.

## Constitution Check

*Evaluated against constitution v1.9.0. Re-checked post-Phase-1 — passes with two recorded items.*

| Principle | Gate | Status |
|---|---|---|
| **I — Spec-Driven** | spec + plan + (next) tasks; clarifications resolved | ✅ 3 forks resolved pre-spec |
| **II — Monorepo & shared contracts** | shell primitives shared once (new `packages/mobile-kit`), not copy-pasted per app; each app supplies only its routes/tabs | ✅ shared package; **fixes** the current per-app duplication (byte-identical `AppNavigator`) and the missing customer adaptive layer |
| **III — Dual-path** | which backend path? | ✅ **N/A — no backend work.** Reuses existing auth/edge; no new endpoints, no path decision needed (stated in Summary) |
| **IV — Auth isolation** | per-pool, backend-authoritative; no cross-pool | ✅ reuses each app's `AuthDriver`/pool untouched; **client gating is a courtesy**, the edge authorizer + manager gate still decide (014's fail-closed principle) |
| **V — Design (+ doctrines)** | one design system; dark mode; native adaptive nav; DOCTRINE-1/2 | ⚠️ conforms — but the existing shop **"identity card"** must be **refactored to sectioned rows** (DOCTRINE-2); recorded in Complexity Tracking |
| **VI — Layered arch & explicit wiring** | MVVM, unidirectional, no DI framework, explicit wiring | ✅ shell is presentation-layer; Nav3 per-entry ViewModel scoping fits MVVM; session/auth reused; `AppContainer` gains the shell state holder; routes/tabs are explicit sealed types |
| **VII — Observability & telemetry** | telemetry declared | ⚠️ **mobile telemetry deferred** (documented Principle VII deviation, consistent with 013/014); recorded |

**No unjustified violations.** Two recorded items: the DOCTRINE-2 refactor of the shop identity card,
and the carried mobile-telemetry deferral. The Nav3 iOS immaturity is a **risk**, mitigated by spikes +
a named library-agnostic fallback (not a principle breach).

## Project Structure

### Documentation (this feature)

```text
specs/015-mobile-app-shell/
├── plan.md              # This file
├── research.md          # Phase 0 — Nav3/adaptive decisions, spikes, fallback, gating design
├── data-model.md        # Phase 1 — navigation & session model (entities + state machines; no DB)
├── quickstart.md        # Phase 1 — device/simulator validation guide
├── contracts/
│   └── nav-shell.contract.md   # the shared shell's API + session-gate + deferred-intent protocol
├── checklists/requirements.md  # spec quality checklist (16/16)
└── tasks.md             # Phase 2 — /speckit-tasks (not here)
```

### Source Code (repository root)

```text
# ── Shared mobile shell package (NEW, Principle II) ─────────────────
packages/mobile-kit/                          # audience-neutral shell primitives (shared source set)
├── nav/        NavKey.kt (base + @Serializable), TabBackStacks.kt (Map<Tab,NavBackStack> holder),
│               SerializersModuleBuilder (polymorphic NavKey registration)
├── shell/      AdaptiveNavShell.kt (NavigationSuiteScaffold wrapper: items, selected tab, content),
│               SessionGate.kt (generic over a session-state enum → auth graph vs main graph)
├── ui/         WindowSize.kt + AdaptiveContent.kt (promoted from shop; now shared)
└── intent/     PendingIntentStore.kt (serializable deferred-sign-in target)
# consumed by both apps (srcDir, matching packages/design-system/compose*; escalate to an included
# KMP build only if srcDir-sharing Compose+Nav3 proves brittle — see research R2)

# ── Customer app (guest-first) ──────────────────────────────────────
apps/customer-mobile/shared/src/commonMain/.../
├── app/App.kt                    # REPLACE RouteHost with SessionGate + AdaptiveNavShell (4 tabs)
├── app/AppContainer.kt           # add the shell state holder (tab back stacks, pending-intent store)
├── core/nav/                     # REPLACE AppNavigator; AppRoute → @Serializable NavKeys + Tab enum
├── features/home|search|orders/  # tab content (Home/Search public; placeholders where content is future)
└── features/auth|account/        # REUSE screens; auth graph rendered by SessionGate / deferred prompt

# ── Shop app (login-first, tablet-first) ────────────────────────────
apps/shop-mobile/shared/src/commonMain/.../
├── app/App.kt                    # REPLACE with SessionGate (login-only public) + AdaptiveNavShell (rail on tablet)
├── app/AppContainer.kt           # add shell state holder
├── core/nav/                     # REPLACE AppNavigator; AppRoute → NavKeys + Tab enum
├── core/ui/WindowSize.kt         # REMOVE (now provided by packages/mobile-kit)
└── features/shop/                # Home/Manager become tab content; **refactor identity card → sections** (DOCTRINE-2)

# ── Version catalog ─────────────────────────────────────────────────
apps/{customer,shop}-mobile/gradle/libs.versions.toml   # PER-APP catalogs (no root): add adaptive-navigation-suite
                                                        # + adaptive-navigation3 to BOTH; wire existing nav3 aliases
```

**Structure Decision**: Keep the **top-level `when(session)` gate** both apps already have (Restoring /
Barred|Refused / Guest|SignedOut / Authenticated), and swap only the **authenticated branch** for the new
`AdaptiveNavShell`; the auth/account screens keep rendering in the pre-authenticated branch. Put the
generic shell in a shared `packages/mobile-kit` (each app supplies its `Tab`/`NavKey`/session mapping),
reusing the `srcDir` sharing mechanism already used for compose tokens.

## Delivery Phasing

- **Phase 0 — Spikes (de-risk Nav3 on iOS) — do first, gate the mechanism.**
  (S1) `@Serializable` `NavKey` + polymorphic `SerializersModule` round-trips a back stack across **iOS**
  process death (background→reclaim→reopen restores location). (S2) `NavigationSuiteScaffold` +
  `adaptive-navigation3` beta renders bar↔rail and list-detail on **iOS** at tablet width. **Exit
  criterion**: both pass → proceed with Nav3; either fails → switch the primary-nav tasks to JetBrains
  **Navigation-Compose** (shell/gate design unchanged).
- **Phase A — Shared shell package + version catalog (Principle II foundation).**
  `packages/mobile-kit`: `NavKey` base + serialization, `TabBackStacks`, `AdaptiveNavShell`, `SessionGate`,
  `WindowSize`/`AdaptiveContent` (promoted from shop), `PendingIntentStore`. Wire deps in `libs.versions.toml`.
- **Phase B — Shop shell (US3, login-first) 🎯** — simplest gate (no guest): `SessionGate` → auth-only vs
  tabbed shell; adaptive rail on tablet; Home/Manager as tab content; **identity-card → sectioned rows**;
  Catalog/Orders "coming soon". Proves the shell end-to-end on the smaller app.
- **Phase C — Customer shell (US1 + US2, guest-first)** — guest-renderable tab graph; public Home/Search;
  authenticated Orders/Account **visible with deferred sign-in**; `PendingIntentStore` return-to-intent;
  wire the existing full auth/account suite; sign-out → guest shell.
- **Phase D — Reliability & adaptivity hardening (US4 + US5, both apps)** — process-death restore, session
  expiry mid-nav, config-change survival, per-tab state preservation, back/re-tap-to-root behavior, safe
  areas/touch targets, motion; parity-register updates for both mobile surfaces.

## Telemetry (Principle VII)

**Deferred** for mobile (documented Principle VII deviation, owned by the `mobile-telemetry` slice,
consistent with 013/014). No PostHog/Crashlytics wiring in this slice. Recorded so the parity registers do
not overstate mobile.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Adopt Nav3 (new lib) with iOS spikes** | Its owned-`List<NavKey>` model is the natural upgrade from the app's hand-rolled back stack and gives per-tab stacks + adaptive scenes; operator asked for "nav3" | Staying hand-rolled re-implements saveable state/transitions/lifecycle/ViewModel-scoping; Nav3 gives these for less code. Risk contained by spikes + a named JetBrains-Nav fallback |
| **New shared `packages/mobile-kit`** | Principle II — the shell is cross-cutting; both apps need the same adaptive nav/gate/intent primitives; also fixes the customer app's missing adaptive layer | Per-app duplication (the current byte-identical `AppNavigator`) is exactly the copy-paste Principle II forbids; building a robust shell twice compounds it |
| **DOCTRINE-2 refactor of shop identity "card"** | v1.9.0 forbids card layouts; the 014 Home identity block is a card | Leaving it would ship a new violation into a shell that is supposed to exemplify the doctrine |
| **Serializable pending-intent + `@Serializable` routes** | iOS restore across process death **requires** polymorphic serialization; deferred sign-in must survive the OTP/app-switch detour | In-memory-only intent + reflection state (Android-only) silently breaks return-to-intent and restore **on iOS** |
| **Mobile telemetry deferred (VII)** | Matches 013/014; owned by the telemetry slice | Wiring it here duplicates that slice and widens this one |

## Operator-run steps

**None cloud-facing.** No `terraform apply`, no migration, no `edge-deploy`. The operator's only manual
role is **running each app on an Android device/emulator and an iOS simulator (phone + tablet)** for the
live validation in [quickstart.md](./quickstart.md) — everything else is app code Claude authors and the
standard `./gradlew` build/test verifies.
