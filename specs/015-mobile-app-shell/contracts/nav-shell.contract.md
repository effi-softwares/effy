# Contract: Shared Mobile Navigation Shell (`packages/mobile-kit`)

This is a **UI/architecture contract**, not an HTTP API (the slice adds no endpoints). It defines the
generic shell each app consumes and the behavior each app must uphold. Types are Kotlin `commonMain`.

---

> **As-built note:** the shell ships on **stable Material 3** + a **developer-owned** per-tab back stack
> (research R1 escape-hatch, chosen for reliable Android+iOS verification without the alpha Nav3 iOS spike).
> `NavigationSuiteScaffold`/`NavBackStack` are NOT used; the equivalents below are hand-rolled. The generic
> `SessionGate`/`PendingIntentStore` primitives were dropped in favour of each app's own exhaustive
> `when(session)` gate and a `rememberSaveable` return-to-intent slot (both simpler + more type-safe here).

## 1. What `packages/mobile-kit` provides (generic, audience-neutral)

| Component | Responsibility |
|---|---|
| `NavKey` (base) + `navKeySerializersModule { }` | Route marker + polymorphic `SerializersModule` registration (R6 — iOS restore) |
| `TabBackStacks<T>` + `rememberTabBackStacks(...)` | Developer-owned `Map<T, List<AppNavKey>>` + `currentTab`; `selectTab` (re-tap → root) / `push` / `pop` / `resetForSignOut`; **saveable** across config change + process death via the route serializers |
| `AdaptiveNavShell` + `NavDestination` + `NavGlyph` | Stable-Material-3 chrome: **bottom bar (compact) / navigation rail (expanded)** from one destination set + a placeholder glyph icon |
| `WindowSize` / `AdaptiveContent` | Window-size class + content-bounding wrapper (promoted from shop, now shared) |

## 2. What each app supplies

- A `Tab` enum (`{ label, startRoute }`) + its access policy.
- Concrete `@Serializable` `AppNavKey` routes + their registration in `navKeySerializersModule`.
- A top-level **`when(session)`** gate over its own sealed `SessionState` (Restoring / signed-out / signed-in / blocked).
- The `content` composables per tab (reusing existing feature screens).
- Its own return-to-intent (the customer app captures the intended tab in a `rememberSaveable` slot).

## 3. Behavioral contract (both apps)

- **C1 — Adaptive form**: primary nav renders as a bottom bar on COMPACT and a navigation rail on
  MEDIUM/EXPANDED, with the **same tab set** (FR-002). Safe areas/insets respected; touch targets meet
  platform minimums (FR-007).
- **C2 — Per-tab back stack**: each tab has its own history; switching tabs preserves each tab's state;
  back pops only the current tab; **re-tapping the active tab pops it to root** (FR-003/004/005).
- **C3 — Session gate**: exactly one graph renders per session state; a session change **replaces** the top
  graph (sign-out/expiry clears the whole tab graph; no stale protected content) (FR-019/021/022).
- **C4 — No card layouts** in shell chrome or tab content (DOCTRINE-2) (FR-006).
- **C5 — Saveable**: tab stacks, current tab, and any pending intent survive configuration change and
  process death (iOS requires registered polymorphic serialization) (FR-023/SC-008).

## 4. Customer-app contract (guest-first)

- **C6**: the tab graph renders for **guests**; `PUBLIC` tabs (Home, Search) are fully usable with **no**
  sign-in prompt (FR-008, SC-001).
- **C7**: `AUTHENTICATED` tabs (Orders, Account) are **visible**; selecting one (or a gated action) →
  `PendingIntentStore.capture` → present sign-in/create-account → on success **consume** and navigate to the
  captured target (**return-to-intent**); on cancel, discard and remain a guest where they were
  (FR-010/011/013, SC-002).
- **C8**: sign-out → session flips to `Guest` → gate returns the **guest tab graph** (public content intact)
  (FR-019).

## 5. Shop-app contract (login-first)

- **C9**: the **only** renderable graph without a session is the **auth graph** (`SignInFlow`); the tab graph
  never mounts unauthenticated; any attempt to reach a tab while signed out routes to sign-in (FR-014/015,
  SC-007).
- **C10**: authenticated shell uses the adaptive **rail on tablet** / bar on phone (FR-017); Home/Manager are
  tab content; the identity block is **sectioned rows, not a card** (DOCTRINE-2, R8).
- **C11**: sign-out → session flips to `SignedOut` → gate returns the **sign-in** screen; no operator content
  remains (FR-019).

## 6. Reuse contract (do not modify)

The shell MUST NOT modify or bypass: `AuthDriver` (+ platform actuals), `AuthModels`, `SessionManager` /
`SessionState`, the credential screens' auth logic, `EffyTheme` / generated tokens, or the `AppContainer`
explicit-wiring pattern. Client-side gating is a **courtesy**; the edge authorizer + manager gate remain
authoritative (Principle IV) — a stale token yields a rejected request that flips the session, never a data
leak.

## 7. Test assertions (contract-level, `commonTest`)

- `TabBackStacks`: tab isolation; switch preserves; re-tap active → root; back pops correct tab.
- `SessionGate` mapping: each state → the right slot; sign-out/expiry replaces (not pushes).
- `PendingIntentStore`: capture → consume → navigate; cancel discards; single-slot.
- `NavKey` polymorphic-serialization round-trip (S1 as a unit test) — every registered route survives.
- `widthClassFor` → nav form (compact→bar, expanded→rail).
