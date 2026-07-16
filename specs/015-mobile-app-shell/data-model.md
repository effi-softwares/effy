# Data Model: Mobile App Shell & Navigation (015)

There is **no database and no backend data** in this slice. The "model" here is the **in-app navigation &
session model** — the presentation-layer state the shell owns. All types live in `commonMain`; the generic
ones in `packages/mobile-kit`, the app-specific ones per app. Everything that must survive process death is
`@Serializable` (R6).

---

## 1. Entities (conceptual → Kotlin types)

### 1.1 `NavKey` (route) — shared base, app-specific subtypes
The unit of navigation. **`@Serializable`**, a sealed hierarchy per app (replaces the old `AppRoute`).
- **Shared base** (`packages/mobile-kit/nav/NavKey.kt`): a marker interface all routes implement, plus the
  polymorphic `SerializersModule` builder each app registers its subtypes with.
- **Customer routes** (examples): `HomeRoot`, `SearchRoot`, `OrdersRoot`, `AccountRoot`, and detail routes
  pushed within a tab (future). Auth routes (`SignIn`, `SignUp`, `VerifyOtp(email,purpose)`, `Recovery`,
  `Account*`) already exist and become `NavKey`s.
- **Shop routes** (examples): `HomeRoot`, `CatalogRoot` (placeholder), `OrdersRoot` (placeholder),
  `AccountRoot` (holds identity + manager area + sign-out). `SignIn` is the auth graph, not a tab.

Validation: every concrete route MUST be registered in the app's polymorphic `SerializersModule` (an
unregistered route fails S1's iOS round-trip — enforced by a unit test, R10).

### 1.2 `Tab` — a primary destination
A top-level navigation target shown in the adaptive bar/rail. Per-app `enum`, each carrying: a stable id,
a label, an icon, an **`AccessLevel`**, and a **start route** (the tab's back-stack root).
- **Customer**: `HOME` (public), `SEARCH` (public), `ORDERS` (authenticated), `ACCOUNT` (authenticated).
- **Shop**: `HOME`, `CATALOG`, `ORDERS`, `ACCOUNT` — all authenticated (the whole shell is gated).

### 1.3 `AccessLevel`
`PUBLIC` | `AUTHENTICATED`. Classifies a tab/route; the shell enforces it (a guest selecting an
`AUTHENTICATED` tab triggers deferred sign-in rather than showing content). Shop tabs are all
`AUTHENTICATED`; only the customer app has `PUBLIC` tabs.

### 1.4 `TabBackStacks` — per-tab history holder (shared)
`packages/mobile-kit/nav/TabBackStacks.kt`. Conceptually a `Map<Tab, NavBackStack>` plus a saved
`currentTab`. Each `NavBackStack` is saveable. Operations: `select(tab)` (swap visible stack; if already
current → pop that stack to its root), `push(route)` (into current tab), `pop()` (current tab; false at
tab root), `resetTabsForSignOut()`.
Invariants: switching tabs never loses another tab's history; back within a tab pops only that tab; each
tab's stack always has ≥ its start route.

### 1.5 `SessionState` — the gate input (reused, per app)
Reused unchanged from each app's `core/session/`:
- **Customer**: `Restoring` | `Guest` | `Authenticated(customer)` | `Barred`.
- **Shop**: `Restoring` | `SignedOut` | `SignedIn(operator)` | `Refused`.
The shell reads this to pick the graph (§2). It is **owned by `SessionManager`** (backed by `AuthDriver`);
the shell never writes it directly — it calls session/auth use cases that do.

### 1.6 `PendingIntent` — deferred sign-in target (shared, customer-used)
`packages/mobile-kit/intent/PendingIntentStore.kt`. A **`@Serializable`** captured target
(`{ tab, route }`) a guest tried to reach before authenticating. Held so it survives the auth detour **and
process death**. Lifecycle: `capture(tab,route)` on a gated tap → present auth → on success `consume()` →
navigate there → clear; on cancel → clear (discard). At most one pending intent at a time.

### 1.7 `WindowWidth` / adaptive form (shared)
`packages/mobile-kit/ui/WindowSize.kt` (promoted from shop): `COMPACT` (<600dp) | `MEDIUM` (600–839dp) |
`EXPANDED` (≥840dp). Maps to the nav form: **COMPACT → bottom bar; MEDIUM/EXPANDED → navigation rail**
(the `NavigationSuiteScaffold` does this from the window size class; the enum is retained for content
bounding inside tabs — e.g. the shop's max-width columns / future two-pane).

---

## 2. State machine — the session gate (top-level, above `NavDisplay`)

```
                    ┌─────────────┐
   app launch ─────►│  Restoring  │  (splash/skeleton — never flash the wrong graph)
                    └──────┬──────┘
             session resolved │
        ┌───────────────────┼───────────────────────────┐
        ▼ (no session)       ▼ (valid session)            ▼ (barred/refused)
  ┌───────────────┐   ┌──────────────────┐        ┌──────────────────┐
  │ Guest/SignedOut│   │  Authenticated   │        │  Barred/Refused  │
  └──────┬────────┘   └────────┬─────────┘        └────────┬─────────┘
         │                     │                            │ sign out
   CUSTOMER: guest tab graph   │  main tab graph            ▼
   (public tabs usable;        │  (AdaptiveNavShell +   (message + sign out → Guest/SignedOut)
    gated tab → deferred       │   TabBackStacks)
    sign-in)                   │
   SHOP: auth graph ONLY       │
   (SignInFlow; no tabs)       │
         │                     │
         │  sign-in success    │   sign-out (replace top stack, not push)
         └────────────────────►│──────────────► back to Guest/SignedOut
                               │
      session expiry mid-use ──┘  (SessionManager flips state → gate replaces the graph;
                                   no stale protected content shown; customer → guest, shop → sign-in)
```

Key rules:
- The gate is **above** the tab `NavDisplay`; a session change **replaces** the top-level stack (never a
  push), so sign-out/expiry clears the entire tab graph atomically.
- **Shop**: the tab graph is unreachable without a session (login-first, FR-014/015).
- **Customer**: the tab graph renders for guests; only `AUTHENTICATED` tabs/actions defer to sign-in (FR-008/010).

## 3. Flow — deferred sign-in with return-to-intent (customer)

```
guest taps AUTHENTICATED tab/action
        │  capture PendingIntent{tab,route}  (serializable)
        ▼
present sign-in / create-account (existing auth screens)
        │
   ┌────┴─────────────┐
   ▼ success           ▼ cancel
consume PendingIntent   discard PendingIntent
navigate to {tab,route} stay guest on previous public state
clear intent            (nothing lost)
```
Survives process death: because `PendingIntent` and routes are `@Serializable`, an OS kill during the OTP
email context-switch still resumes to the intended destination on relaunch (FR-011, SC-002).

## 4. Adaptive form mapping (both apps)

| Window width | Primary nav form | Notes |
|---|---|---|
| COMPACT (<600dp) | **Bottom navigation bar** | phones (customer default) |
| MEDIUM (600–839dp) | **Navigation rail** | small tablets / landscape phones |
| EXPANDED (≥840dp) | **Navigation rail** (+ optional list-detail scene) | tablets (shop default); two-pane via `adaptive-navigation3` if S2 passes |

Same `Tab` set in every form (FR-002). Safe areas / insets respected; touch targets meet platform minimums
(FR-007).

## 5. Persistence & reliability requirements (validation targets)

- **Tab back stacks** and **current tab**: saveable; restored across configuration change and process death
  (FR-023, SC-008; iOS requires R6 serialization).
- **PendingIntent**: serializable; restored across process death (FR-011, SC-002).
- **Session**: restored on launch by the existing `SessionManager.bootstrap()` (FR-020, SC-004); expiry
  handled by the gate (FR-021, SC-010) — never showing stale protected content.
- **Cold start**: the gate shows `Restoring` skeleton and resolves session async — first interactive frame is
  the real UI, not a spinner that jumps (FR-024, SC-009).

## 6. Where each type lives

| Type | Location |
|---|---|
| `NavKey` base + `SerializersModule` builder, `TabBackStacks`, `AdaptiveNavShell`, `SessionGate`, `WindowSize`/`AdaptiveContent`, `PendingIntentStore` | **`packages/mobile-kit`** (shared) |
| App `Tab` enum, concrete `@Serializable` routes + registration, session→gate mapping, tab content wiring | **each app** (`apps/customer-mobile`, `apps/shop-mobile`) |
| `SessionState`, `SessionManager`, `AuthDriver`, auth/account screens, use cases | **each app** (reused, unchanged) |
