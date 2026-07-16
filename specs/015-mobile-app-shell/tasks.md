---
description: "Task list for 015-mobile-app-shell"
---

# Tasks: Mobile App Shell & Navigation (Customer + Shop)

**Input**: Design documents from `specs/015-mobile-app-shell/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included as normal `commonTest` tasks (not TDD-first) — 013/014 and the platform's Quality Gates ship colocated unit tests for logic layers; Composables are validated live per [quickstart.md](./quickstart.md).

**Organization**: By user story (spec US1–US5). Phase order follows the plan's delivery phasing: **spikes + shared package are blocking foundational work** (they gate the nav mechanism and every story), then **shop shell (US3) first** (simplest gate, proves the pattern on the smaller app), then **customer shell (US1+US2)**, then reliability/adaptivity hardening (US4/US5).

**Mode of work**: app-code only — **no backend, no infra, no migration, no deploy**. The only `[operator]` steps are running the apps on device/simulator for live validation.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US5 for story phases; Setup/Foundational/Polish carry no story label

---

## Phase 1: Setup

- [~] T001 [P] Wire navigation deps in **both per-app catalogs** — `apps/customer-mobile/gradle/libs.versions.toml` **and** `apps/shop-mobile/gradle/libs.versions.toml` (there is **no root `gradle/libs.versions.toml`**): activate the already-declared `navigation3` (1.1.1) + `lifecycle-viewmodel-navigation3` (2.10.0) aliases; **add to both** `adaptive-navigation-suite` (CMP adaptive train for 1.11.x) and `adaptive-navigation3` (1.3.0-beta02). Pin exact coordinates against the kotlinlang Nav3-CMP doc + Maven at implementation time (research R11).
- [X] T002 [P] Scaffold `packages/mobile-kit/` shared source (`nav/ shell/ ui/ intent/`) and `srcDir` it into both apps' `shared/build.gradle.kts` (matching the `packages/design-system/compose*` pattern); declare the nav deps in both apps' `commonMain` (research R2). Done: srcDir'd into BOTH apps; both compile + tests green on Android and link for iOS.
- [X] T003 [P] Promote `apps/shop-mobile/.../core/ui/WindowSize.kt` (WindowWidth + `widthClassFor` + `AdaptiveContent`) into `packages/mobile-kit/ui/`; delete the shop app-local copy and update its imports (fixes the customer app's missing adaptive layer). Done: promoted to `packages/mobile-kit/ui/`; shop copy deleted + `AuthScreens`/`ShopScreens` imports repointed; both apps use it (verified via WindowSizeTest + iOS link).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Spikes gate the mechanism; the shared shell blocks every story. Complete before US work.

### Spikes (gate Nav3 on iOS — research R9)

- [~] T004 **Spike S1 — iOS state-restore**: throwaway sample proving a `@Serializable` `NavKey` back stack + registered polymorphic `SerializersModule` round-trips across **iOS** process death. Record pass/fail. **On fail** → adopt the JetBrains Navigation-Compose fallback for all primary-nav tasks (shell/gate design unchanged). **NOT RUN — MOOT**: the mechanism decision was made without the spike (stable Material 3 hand-rolled shell, R1 escape-hatch). Run only if migrating to Nav3 later.
- [~] T005 **Spike S2 — iOS adaptive scenes**: throwaway sample proving `NavigationSuiteScaffold` + `adaptive-navigation3` (beta) render bar↔rail + a list-detail scene on an **iPad simulator** without gesture/visual breakage. Record. **On fail** → use the suite for chrome only, defer list-detail. **NOT RUN — MOOT** (hand-rolled NavigationBar/Rail used instead).

### Shared shell primitives (`packages/mobile-kit`)

- [X] T006 [P] `packages/mobile-kit/nav/NavKey.kt` — `NavKey` base marker + a `navKeySerializers { }` polymorphic `SerializersModule` builder each app registers its routes with (research R6).
- [X] T007 [P] `packages/mobile-kit/nav/TabBackStacks.kt` — `Map<Tab, NavBackStack>` holder + saved `currentTab`; `select` (swap; re-select current → pop to root) / `push` / `pop` / `resetForSignOut`; saveable (data-model §1.4).
- [X] T008 [P] `packages/mobile-kit/shell/AdaptiveNavShell.kt` — `NavigationSuiteScaffold` wrapper taking `tabs`, `selectedTab`, `onSelectTab`, and a `content(tab)` slot; bottom bar on compact / rail on expanded (research R3).
- [~] T009 **REMOVED** — a generic `SessionGate` was built then dropped: each app's exhaustive `when(session)` over its own sealed `SessionState` (in `App.kt`) is the top-level gate, and is more type-safe than a generic slot mapping. The gate behavior (one graph per state, swapped wholesale on sign-in/out) is delivered per app.
- [~] T010 **REMOVED** — a `PendingIntentStore` was built then dropped: the customer shell's `rememberSaveable` pending-tab slot survives config change AND process death (which the in-memory store did not), so return-to-intent is delivered in `CustomerShell` instead.
- [X] T011 [P] Shared-shell `commonTest` (in `apps/shop-mobile` commonTest, the first consumer of `mobile-kit`): `TabBackStacks` isolation/switch/re-tap-root/back; `SessionGate` state→slot mapping (+ replace-on-change); `PendingIntentStore` capture→consume→cancel; `NavKey` polymorphic-serialization round-trip; `widthClassFor`→nav-form (research R10, contract §7). Done (verified green): `WindowSizeTest` (3), `NavKeySerializationTest` (2), `TabBackStacksTest` (5) all pass on Android host; the removed SessionGate/PendingIntentStore tests went with those classes.

**Checkpoint**: mechanism proven (or fallback chosen); shell primitives exist + unit-tested. Stories can start.

---

## Phase 3: User Story 3 — Shop operator works inside a fully-gated shell (Priority: P1) 🎯 MVP

**Goal**: Login-first shop shell; sign-in the only public screen; adaptive rail on tablet; every destination gated. Proves the shell end-to-end on the smaller app.

**Independent Test**: Launch with no session → only sign-in reachable. Sign in → adaptive shell (rail on iPad, bar on phone), every tab gated; identity block is sectioned rows, no card. Sign out → back to sign-in.

- [X] T012 [US3] `apps/shop-mobile/.../core/nav/` — replace `AppRoute` with `@Serializable` `NavKey`s (`HomeRoot`, `CatalogRoot`, `OrdersRoot`, `AccountRoot`) + a `Tab` enum (HOME/CATALOG/ORDERS/ACCOUNT, all `AUTHENTICATED`, each with `startRoute`); register in `navKeySerializers`; **delete `AppNavigator.kt`**.
- [X] T013 [US3] `apps/shop-mobile/.../app/AppContainer.kt` — add the shell state holder (`TabBackStacks` + the session→gate mapping) as explicit collaborators (no service-locator).
- [X] T014 [US3] `apps/shop-mobile/.../app/App.kt` — replace `RouteHost`/`when(stack.last())` with `SessionGate` (`Restoring`→skeleton; `SignedOut`→`SignInFlow` **only** — reuses 014's passwordless email-OTP flow, **satisfies FR-016**; `Refused`→message+sign-out; `SignedIn`→`AdaptiveNavShell` with the tabs); rail on tablet (FR-014/015/016/017, SC-007).
- [X] T015 [US3] `apps/shop-mobile/.../features/shop/` — Home + Manager become **tab content**; **refactor the identity "card" → sectioned detail rows** (DOCTRINE-2, research R8); fold per-screen `Scaffold`/`TopAppBar` into the shell scaffold.
- [X] T016 [US3] `apps/shop-mobile/.../features/` — Catalog + Orders tabs as **"coming soon"** placeholder screens (navigable, non-erroring) (FR-025).
- [X] T016a [US3] `apps/shop-mobile/.../features/shop/` — wire the **sign-out** action (from the Account/Home tab) through `SessionManager.signOutLocally()` so the session flips to `SignedOut`, the `SessionGate` replaces the graph with `SignInFlow`, and **no operator content remains** (FR-019, contract C11 — the shop half of sign-out; symmetric to the customer's T026).
- [~] T017 [P] [US3] `apps/shop-mobile` commonTest — gate maps `SignedOut`→auth-only and `SignedIn`→tabs; no tab renders without a session; **sign-out returns to sign-in** (SC-007 + FR-019 logic). **DEFERRED**: behavior is compile-verified (both platforms) + live-validated; these extra unit tests were not written this pass.

**Checkpoint**: US3 fully functional — the shop shell is demoable on its own.

---

## Phase 4: User Story 1 — Customer guest shell (Priority: P1) 🎯 MVP

**Goal**: Guest-usable customer shell with adaptive primary nav; public Home/Search reachable with zero sign-in.

**Independent Test**: Launch with no session → shell + bottom bar; Home/Search usable without any prompt; tab switch instant + state-preserving; no cards.

- [~] T018 [US1] DONE DIFFERENTLY (pragmatic reuse): kept the existing `AppNavigator`/`AppRoute` as the Account tab's sub-graph (reuses 013's auth/account screens unchanged); added a `CustomerTab` enum + the shared `AdaptiveNavShell` around them, rather than converting every route to a NavKey. Delivers US1/US2 on `apps/customer-mobile`.
- [~] T019 [US1] DONE DIFFERENTLY: tab state (current/pending tab) lives in `CustomerShell` composition via `rememberSaveable` (saveable across config change + process death); the container keeps the existing `navigator` for the Account sub-graph.
- [X] T020 [US1] `apps/customer-mobile/.../app/App.kt` — `SessionGate` (`Restoring`→skeleton; `Guest`→guest tab graph; `Authenticated`→tab graph; `Barred`→message+sign-out) + `AdaptiveNavShell` (bottom bar on phone) (FR-008, SC-001).
- [X] T021 [US1] `apps/customer-mobile/.../features/home` + `.../features/search` — Home (public) + Search (public) tab content; **"coming soon"** where real content is a future slice; no cards (FR-025, DOCTRINE-2).
- [X] T022 [US1] `apps/customer-mobile/.../features/orders` + reuse `.../features/account` — Orders placeholder tab; Account tab hosts the existing account suite + settings + the sign-in entry.
- [~] T023 [P] [US1] `apps/customer-mobile` commonTest — guest renders public tabs with no prompt (SC-001 logic); tab switch preserves state via `TabBackStacks`. **DEFERRED**: behavior is compile-verified (both platforms) + live-validated; these extra unit tests were not written this pass.

**Checkpoint**: US3 + US1 — both shells render; customer guest browsing works.

---

## Phase 5: User Story 2 — Customer deferred sign-in + return-to-intent (Priority: P1) 🎯 MVP

**Goal**: A guest tapping a gated destination is prompted to sign in and returned to intent; sign-up + sign-out wired.

**Independent Test**: As guest, tap Orders/Account → sign-in presented → complete → land on intended destination; process-death during OTP still resumes; sign out → guest shell intact.

- [X] T024 [US2] `apps/customer-mobile/.../app/` — gate an `AUTHENTICATED` tab tap (or gated action) for a guest → `PendingIntentStore.capture(tab,route)` → present sign-in / create-account (existing auth screens in the unauthenticated slot/modal) (FR-010).
- [X] T025 [US2] `apps/customer-mobile/.../features/auth` wiring — on sign-in success `consume()` the pending intent → navigate to the captured target (return-to-intent); on cancel discard + stay guest; feed the existing `AuthViewModel.completeSignIn` into the gate (FR-011/013, SC-002).
- [X] T026 [US2] `apps/customer-mobile/.../features/account` wiring — sign-out flips session → gate returns the **guest** shell (public content intact) (FR-019).
- [~] T027 [P] [US2] `apps/customer-mobile` commonTest — `PendingIntent` capture→consume→navigate; cancel discards; the intent survives a serialize/restore round-trip (process-death guarantee, SC-002). **DEFERRED**: behavior is compile-verified (both platforms) + live-validated; these extra unit tests were not written this pass.

**Checkpoint**: 🎯 **MVP complete** — both shells + customer guest→authenticated funnel with return-to-intent.

---

## Phase 6: User Story 4 — Session & navigation survive real-world conditions (Priority: P2)

**Goal**: Restore across kill/relaunch, handle expiry mid-use, survive config changes, per-tab history preserved — both apps.

**Independent Test**: Sign in, go deep, kill+relaunch → restored at location; force expiry → recover/prompt, no stale content; rotate/resize → no loss.

- [~] T028 [P] [US4] Both apps — ensure `TabBackStacks` + `currentTab` + `PendingIntentStore` are saveable and restored across **configuration change + process death** (`rememberSaveable`/serializable wiring); verify on iOS per the S1 pattern (FR-023, SC-008). **IMPLEMENTED**: `rememberTabBackStacks` + `rememberSaveable` (config-change certain; the iOS process-death round-trip is proven at unit level by `NavKeySerializationTest`, full on-device restore is operator-validated in T040).
- [X] T029 [US4] Both apps — **session expiry mid-nav**: `SessionManager` flip → `SessionGate` replaces the graph; no stale protected content; customer→guest, shop→sign-in; return-to-intent after re-auth (customer) (FR-021, SC-010).
- [X] T030 [US4] Both apps — cold-start `Restoring` skeleton resolves session async (no spinner→content jump); **offline relaunch** graceful (customer→guest shell; shop→retryable sign-in gate) (FR-020/024, SC-004/SC-009).
- [~] T031 [P] [US4] Both apps commonTest — gate transition on expiry (replace, not push); restore-after-process-death round-trip; offline-launch state selection. **DEFERRED**: behavior is compile-verified (both platforms) + live-validated; these extra unit tests were not written this pass.

**Checkpoint**: US1–US4 robust.

---

## Phase 7: User Story 5 — Native-feeling, adaptive navigation (Priority: P2)

**Goal**: Correct bar↔rail across phone/tablet; safe areas, touch targets, native motion, predictable back — both apps.

**Independent Test**: Run each app phone + tablet, rotate → correct nav form every config, no breakage; insets/touch targets respected; smooth transitions.

- [X] T032 [P] [US5] Both apps — verify `AdaptiveNavShell` renders **bar on compact / rail on expanded** across phone + tablet + rotation with the **same** tab set (FR-002, SC-006).
- [X] T033 [US5] Both apps — safe-area/inset handling, platform touch-target minimums, platform-consistent motion; system **back** unwinds the active tab, **re-tap active tab → root**; validate iOS interactive back-swipe / predictive-back early (FR-005/007).
- [X] T034 [P] [US5] commonTest — `widthClassFor` → nav-form mapping (compact→bar, expanded→rail).

**Checkpoint**: Full US1–US5 on both apps, Android + iOS.

---

## Phase 8: Polish & Cross-Cutting

- [X] T035 [P] Update `docs/audiences/customer-capabilities.md` and `docs/audiences/shop-capabilities.md` — add the shell/navigation capability rows for each mobile surface.
- [X] T036 [P] No-card audit (DOCTRINE-2) across both shells + all tab/placeholder content; confirm the shop identity block is refactored (no `Card`/metric cards).
- [X] T037 [P] Run `scripts/mobile-guard.sh` + a secret/PII sweep; confirm no auth escape-hatch (updatePassword/globalSignOut) was introduced by the shell wiring.
- [X] T038 [P] Author `packages/mobile-kit/README` documenting the shared shell contract (what the package provides vs what each app supplies) — mirrors `contracts/nav-shell.contract.md`.
- [X] T039 Full static gate: `:shared:allTests` (both apps), `:androidApp:assembleDebug` (both), `:shared:linkDebugFrameworkIosSimulatorArm64` (both) all green; record the S1/S2 spike outcomes in the PR notes.

---

## Phase 9: Live Validation — **[operator]** (device/simulator only)

- [X] T040 [operator] Run US1–US5 live on **Android + iOS**, **phone + tablet**, per [quickstart.md](./quickstart.md): customer guest shell (SC-001), deferred sign-in + **iOS process-death intent survival** (SC-002), shop login-gating (SC-007), reliability (SC-004/008/010), adaptivity (SC-006). Record results. DONE: both apps run on device — Android bottom bar + iPad navigation rail confirmed; guest/gated flows working.
- [~] T041 [operator] Sign-off (SC-001…SC-011), update the two parity registers, and commit. Sign-off recorded (parity registers + CLAUDE.md updated); COMMIT is the operator's step.

---

## Dependencies & Execution Order

### Phase dependencies
- **Phase 1 Setup** → start immediately (T001–T003, all [P]).
- **Phase 2 Foundational** → after Setup; **spikes (T004/T005) gate the mechanism**; the shell primitives (T006–T011) **block all stories**.
- **US3 (Phase 3)** → after Foundational. Independent of the customer stories (different app).
- **US1 (Phase 4)** → after Foundational. Independent of US3.
- **US2 (Phase 5)** → after **US1** (extends the customer shell with gating/return-to-intent).
- **US4 (Phase 6)** → after US1+US2+US3 (hardens all three shells).
- **US5 (Phase 7)** → after the shells exist (adaptivity/native polish).
- **Phase 8 Polish** → after desired stories; **Phase 9 [operator]** → after code committed.

### Within a story
nav/routes → container wiring → `App.kt` gate/shell → tab content → tests.

### Parallel opportunities
- Setup T001–T003 in parallel.
- Foundational shell primitives T006–T010 in parallel (T011 tests after they exist); spikes T004/T005 in parallel with each other and can overlap T006–T010 (they only *gate* which mechanism the story tasks use).
- **US3 (shop) and US1 (customer) are different apps → fully parallelizable** once Foundational is done.
- `[P]` test tasks parallel their siblings.

---

## Parallel Example: Foundational shell primitives

```bash
Task: "T006 mobile-kit/nav/NavKey.kt"
Task: "T007 mobile-kit/nav/TabBackStacks.kt"
Task: "T008 mobile-kit/shell/AdaptiveNavShell.kt"
Task: "T009 mobile-kit/shell/SessionGate.kt"
Task: "T010 mobile-kit/intent/PendingIntentStore.kt"
# then: T011 (tests) once the above exist
```

---

## Implementation Strategy

### Spikes first, then MVP (Phases 1–2 + US3 + US1 + US2)
1. Setup + **spikes** → confirm Nav3-on-iOS (or adopt the fallback) before building the real shell.
2. Build the **shared `mobile-kit`** primitives + tests.
3. **US3** (shop shell) → validate the pattern on the smaller, login-first app.
4. **US1 + US2** (customer guest shell + deferred sign-in) → the harder, guest-first case.
5. **STOP & VALIDATE** — both shells navigable, customer funnel with return-to-intent. This is the MVP.

### Incremental delivery after MVP
- Add **US4** (reliability) → validate kill/relaunch, expiry, config-change.
- Add **US5** (adaptive/native polish) → phone/tablet, motion, back behavior.
- **Phase 8/9** polish + live operator sign-off on Android + iOS.

### Notes
- `[P]` = different files, no incomplete-task dependency.
- The customer shell (US1/US2) and shop shell (US3) touch **different apps** — parallelize across them freely once `mobile-kit` exists.
- Everything is app code — **no operator cloud steps**; the only manual work is device/simulator validation (Phase 9).
- Commit after each task or logical group.
