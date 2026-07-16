# Research: Mobile App Shell & Navigation (015)

Phase 0 decisions. Grounded in (a) a full inventory of the existing 013/014 navigation/shell/auth code and
(b) current (early-2026) research on KMP+iOS adaptive navigation. Sources are listed at the end.

---

## R1 — Navigation mechanism: Jetpack Navigation 3 (with a named fallback)

**Decision**: Use **Jetpack Navigation 3** (`androidx.navigation3`, via JetBrains' CMP republish) as the
primary navigation mechanism. Its model *is* a developer-owned `List<NavKey>` back stack — nearly identical
to the app's existing hand-rolled `AppNavigator` (`MutableStateFlow<List<AppRoute>>`), whose own header
comment already anticipates "migrating to Navigation 3 later." Pair it with the official **Multiple Back
Stacks** recipe (`Map<Tab, NavBackStack>`) and `NavDisplay` + `entryProvider`.

**Rationale**: KMP/iOS support is real as of CMP ≥ 1.10 (repo is on **1.11.1**); the runtime is
multiplatform and JetBrains republishes a CMP-capable `navigation3-ui`. Nav3 is a thin, list-based upgrade
that stays close to the constitution's "explicit, greppable wiring / no framework indirection" (VI) —
unlike Voyager (screen-model coupling; iOS swipe-back needs a UIKit bridge) or Decompose (heavy
component-tree paradigm). The two nav3 aliases are **already declared** (unused) in `libs.versions.toml`.

**Fallback (named, library-agnostic)**: if the iOS spikes (R9) fail, switch the **primary-nav** tasks to
**JetBrains Navigation-Compose** (`org.jetbrains.androidx.navigation`, the most battle-tested CMP nav) —
keeping the **same** `NavigationSuiteScaffold` shell, session gate, and per-tab holder. The shell/gate
design is deliberately independent of the nav library.

**Alternatives**: hand-rolled `Map<Tab, List<Key>>` (rejected as default — re-implements saveable state,
transitions, per-entry lifecycle/ViewModel scoping that Nav3 gives for free; kept only as the escape
hatch); Voyager / Decompose (rejected — see above; Decompose reserved only if Nav3 iOS lifecycle genuinely
fails).

---

## R2 — Shared shell package (`packages/mobile-kit`) vs per-app duplication

**Decision**: Put the **generic, audience-neutral** shell primitives in a new shared **`packages/mobile-kit`**
consumed by **both** apps via **`srcDir`** (the mechanism already used for `packages/design-system/compose*`
and `shared-types/contract*`): `NavKey` base + polymorphic serialization, `TabBackStacks` holder,
`AdaptiveNavShell` (NavigationSuiteScaffold wrapper), `SessionGate` (generic over a session-state enum),
`WindowSize`/`AdaptiveContent` (promoted from shop), `PendingIntentStore`. Each app supplies only its own
`Tab` set, `NavKey` routes, and session mapping — mirroring how `@effy/web-kit`'s `ConsoleShell` is generic
over the web surfaces.

**Rationale**: Principle II forbids copy-pasting cross-cutting logic across surfaces. Today `AppNavigator`
is **byte-identical** across the two apps (a pre-existing duplication), and the customer app is **missing**
the adaptive layer entirely (shop's `WindowSize.kt` was app-local). A shared package fixes both and makes
"robust shell built once" real. `srcDir` is the lowest-friction sharing mechanism already proven in-repo.

**Risk / alternative**: `srcDir`-sharing **hand-written Compose code with external deps** (Nav3, adaptive
suite) is less proven than sharing generated token/DTO source; both apps must declare the same deps. If it
proves brittle (e.g. dep-resolution or Compose-compiler edge cases), **escalate to an included KMP build**
(`packages/mobile-kit` as its own Gradle module both apps `implementation`-depend on). Per-app duplication
is the last resort and would be recorded as a Principle II deviation.

---

## R3 — Adaptive chrome: `NavigationSuiteScaffold`

**Decision**: Use `NavigationSuiteScaffold` (`org.jetbrains.compose.material3.adaptive:adaptive-navigation-suite`,
CMP adaptive train for 1.11.x) for the primary-nav chrome. It auto-selects the container from the window
size class — **bottom bar on compact, navigation rail on medium/expanded, drawer on very wide** — from a
single item declaration, for both Android and iOS from `commonMain`.

**Rationale**: This is the industry-standard, Material-guided way to satisfy the confirmed "bar on phone,
rail on tablet" requirement without an `isTablet` boolean (aligns with 014's `AdaptiveContent`-over-breakpoints
doctrine). It is **pure chrome with no back stack** — `selectedItem` is driven by our current-tab state and
its `content` slot hosts the selected tab's `NavDisplay` (R4).

**Alternatives**: hand-rolling the bar↔rail swap off `WindowWidth` (rejected — reinvents a solved, stable
Material component; keep `AdaptiveContent` only for *content bounding inside* a tab, e.g. the shop's
tablet-first max-width columns and future two-pane layouts).

---

## R4 — Per-tab back stacks with state preservation

**Decision**: One **`Map<Tab, NavBackStack>`** — each tab owns an isolated, saveable `rememberNavBackStack`
— plus a saved "current tab". Switching tabs swaps which stack `NavDisplay` renders; each tab keeps its deep
state; back within a tab pops that tab's stack; **re-tapping the active tab pops it to root** (standard
behavior). Full-screen details that must cover the nav (if any) use a separate **top-level** `NavDisplay`
layered above the tabbed one.

**Rationale**: The official Nav3 **Multiple Back Stacks** recipe; matches Uber Eats / eBay tab behavior
(switch away and back → you're where you left off). State preservation is automatic because each
`NavBackStack` is saveable; `NavDisplay`'s built-in `SaveableStateHolder` + per-entry ViewModel scoping keep
scroll/screen state and avoid re-running loaders on revisit.

**Alternatives**: Navigation-Compose Nav2 multiple-back-stacks via `saveState`/`restoreState`/`popUpTo`
(rejected as default — notoriously fiddly on KMP; used only under the R1 fallback).

---

## R5 — Session gate + deferred sign-in (return-to-intent)

**Decision**: A **single top-level `SessionState`** (observed from the existing `SessionManager`) selects the
whole graph above one top-level `NavDisplay`:
- `Restoring` → splash/skeleton (never flash the wrong graph);
- unauthenticated → **auth graph** (shop: the *only* renderable graph; customer: a guest-renderable tab graph
  where only gated destinations require auth);
- authenticated → **main tab graph**.
On sign-in/out the session flips and the top-level back stack is **replaced** (not pushed) — sign-out clears
the entire tab graph. Because the gate sits **above** `NavDisplay`, **session expiry anywhere** unwinds
cleanly with no per-screen auth checks and no half-authorized screens left on the stack.

**Deferred sign-in / return-to-intent (customer)**: when a guest triggers a gated destination/action, capture
the intended target as a **`@Serializable` `NavKey`** in the `PendingIntentStore` (survives the auth detour
**and process death** — the OTP email context-switch commonly kills the app), present sign-in, and on success
**pop auth and `add(pendingIntent)`** to the right tab's stack, then clear it. On cancel, discard the intent
and stay a guest exactly where they were.

**Rationale**: This is the production shape (how Uber Eats / eBay gate guest vs. signed-in). The **auth
decision lives in the domain/ViewModel** (observe `AuthDriver` → `SessionState`); the **graph selection lives
in the shell** — a screen never calls the auth SDK to decide whether to render. Consistent with Principle VI
(unidirectional MVVM) and Principle IV (client gating is a courtesy; the edge authorizer + 014 manager gate
remain authoritative — worst case is a rejected request that flips the session, never a data leak).

**Reuse**: the customer `AppRoute` already models `SignIn(returnTo: AppRoute?)`; that intent becomes the
serializable `PendingIntentStore` entry. Both apps already render `when(session)` at the top of `App.kt` —
this decision keeps that gate and swaps only the authenticated branch.

---

## R6 — iOS serialization tax (non-optional)

**Decision**: Every route/`NavKey` is `@Serializable`, and a **polymorphic `SerializersModule`** registers
each subclass; the back stack and `PendingIntentStore` are restored via `SavedStateConfiguration` /
`rememberSerializable` with that module. This lives in `packages/mobile-kit` so both apps register their
routes the same way.

**Rationale**: Android saved-state uses reflection; **iOS/Native cannot**. Without registered polymorphic
serialization, back-stack and pending-intent restore **silently break on iOS only** (passes on Android) —
the #1 KMP-nav regression. This is why R9-S1 exists.

---

## R7 — What is replaced vs reused (from the code inventory)

**Replace**: both `core/nav/AppNavigator.kt` (flat single `List<AppRoute>` — cannot express tabs) and
`AppRoute.kt` (grow to `@Serializable` `NavKey`s + a `Tab` enum); both `app/App.kt` `RouteHost` /
`when(stack.last())` blocks + the single `BackHandler` (→ `SessionGate` + `AdaptiveNavShell`); the customer
guest `HomeScreen` and shop `HomeScreen`/`ManagerAreaScreen` become **tab content** (their per-screen
`Scaffold`+`TopAppBar` folds into the shell scaffold); shop `core/ui/WindowSize.kt` moves to `mobile-kit`.

**Reuse untouched**: both `AuthDriver` + `AuthModels` + platform actuals (`AmplifyAuthDriver`,
`IosAuthDriver`/`IosAuthBridge`) — the guard-enforced auth boundary; both `SessionState` + `SessionManager`
(the gate keeps rendering `when(session)`); both `EffyTheme` + generated token packages; all
`features/**/domain` use cases + repositories; the `AppContainer` explicit-wiring pattern (it gains the
shell state holder — tab back stacks + pending-intent store); the existing **auth/account screens** (customer's
full sign-in/sign-up/OTP/recovery/account suite; shop's `SignInFlow`) — they render in the pre-authenticated
branch, outside the tab shell.

**Two asymmetries the shell absorbs**: customer = guest-first + deferred sign-in (`SignIn.returnTo`) +
two-token edge + a large account area; shop = login-first + single-token + role-gated + already tablet-adaptive
with only two destinations.

---

## R8 — DOCTRINE-2 (no cards) reconciliation

**Decision**: The shop `HomeScreen`'s identity block (currently an "identity **card** via `AdaptiveContent`")
is refactored to **sectioned detail rows** (label/value rows + `HorizontalDivider`), and any new home/tab
content uses sections/lists/detail-rows — never `Card`/`ElevatedCard`/`OutlinedCard`, no metric cards at page
tops (constitution v1.9.0).

**Rationale**: This shell is meant to exemplify the doctrine; shipping a card into it would be a fresh
violation. The refactor is small and local.

---

## R9 — Spikes (gate the mechanism before committing the pattern)

Two throwaway spikes run **first** (Phase 0); each has a hard exit criterion:
- **S1 — iOS state-restore**: a `@Serializable` `NavKey` back stack with a registered polymorphic module
  round-trips across **iOS** process death (background the simulator app until reclaimed, reopen → location
  restored). **Pass** required to keep Nav3 saveable state.
- **S2 — iOS adaptive scenes**: `NavigationSuiteScaffold` + `adaptive-navigation3` (**beta**) render bar↔rail
  and a list-detail scene on **iOS** at tablet width without visual/gesture breakage. **Pass** required to use
  the beta scene strategy (else use the suite for chrome only and defer list-detail).

**If either fails** → adopt the R1 **fallback** (JetBrains Navigation-Compose) for primary nav and/or use the
suite for chrome only; the shell/gate/intent design is unchanged. **Validate iOS interactive back-swipe /
predictive-back early** — the newest, thinnest part of Nav3's iOS surface.

---

## R10 — Testing strategy

**Decision**: `commonTest` (`kotlin.test` + `runTest`, hand-written fakes — no mocking lib, no DI framework),
covering the **logic** layers (Composables are validated live per quickstart):
- `SessionGate` transitions (Restoring→Guest/SignedOut→Authenticated→ sign-out; expiry flips graph).
- `TabBackStacks` holder (per-tab isolation; switch preserves; re-tap active → root; back pops the right tab).
- `PendingIntentStore` capture → authenticate → resume; cancel discards.
- `NavKey` polymorphic-serialization **round-trip** (the S1 guarantee, as a unit test).
- `widthClassFor` → nav-form mapping (compact→bar, expanded→rail).

**Rationale**: Mirrors the platform's existing mobile test posture (013/014 test use cases + pure logic with
fakes). Adds the nav/gate/intent logic these apps did not previously test.

---

## R11 — Version catalog & dependencies

**Decision**: In `gradle/libs.versions.toml`: wire the **already-declared** `navigation3` (1.1.1) +
`lifecycle-viewmodel-navigation3` (2.10.0) aliases into both apps' `shared/build.gradle.kts` commonMain; and
**add** `adaptive-navigation-suite` (CMP adaptive train for 1.11.x) and `adaptive-navigation3` (1.3.0-beta02,
isolated). Pin exact coordinates against the kotlinlang Nav3-CMP doc + Maven **at implementation time** — the
alpha/beta artifacts drift week to week.

**Rationale**: The catalog already anticipated Nav3; this slice activates it. Keeping the beta adaptive
artifact isolated (used only for the tablet list-detail scene) limits blast radius if it churns.

---

## Sources (Nav3 / adaptive, early 2026)

- Navigation 3 in Compose Multiplatform — kotlinlang.org (artifacts, versions, **iOS polymorphic-serialization requirement**).
- Compose Multiplatform 1.10.0 release — JetBrains (Nav3 on non-Android targets); repo is on 1.11.1.
- androidx.navigation3 release notes — Android Developers (model; runtime KMP vs UI Android-only → JetBrains republish).
- Multiple Back Stacks Pattern — android/nav3-recipes; `compose-navigation3-multiple-backstacks` sample.
- Using Navigation 3 with Compose Multiplatform — John O'Reilly (iOS practitioner: serialization + adaptive scene).
- Jetpack Compose adaptive layouts now stable (`NavigationSuiteScaffold`) — Android Developers Blog; CMP port issue (compose-multiplatform #4952).
- CMP-7646 (Support Navigation 3 for CMP) — JetBrains YouTrack.

**Caveat**: exact patch numbers for fast-moving alpha/beta artifacts drift; pin at implementation time
against the authoritative kotlinlang doc + Maven, not blog snippets.
