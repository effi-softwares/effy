# Research — 014 Shop Mobile Foundation

**Date**: 2026-07-15 · **Feeds**: [plan.md](plan.md) · **Inputs**: [spec.md](spec.md),
[planning-inputs.md](planning-inputs.md), [013 research](../013-customer-mobile-foundation/research.md)

**This slice reuses 013's research wholesale for everything mechanical.** The KMP stack, the Amplify-native /
`expect`-interface-not-`expect class` decision, the Ktor-Android-not-OkHttp fix, BuildKonfig fail-loud, the
generated-committed-drift-guarded contract/theme pipelines, the `viewModel { }` lifecycle, `BackHandler`,
safe-area insets, the escape-hatch/secret build guard, the iOS Swift-bridge pattern — all of it carries over
unchanged. See [013 research D1–D22](../013-customer-mobile-foundation/research.md). This file records **only
the decisions the shop audience changes** (`Dns` = shop delta).

---

### D1s — Reuse the 013 mobile foundation wholesale

**Decision**: `apps/shop-mobile` is built on the identical stack + architecture as `apps/customer-mobile`
(KMP 2.4.0 / CMP 1.11.1 / AGP 9.0.1; Clean Architecture; MVVM per constitution **v1.8.0**; Amplify native behind
a `commonMain` `AuthDriver` interface with a Swift bridge on iOS; Ktor with the **Android** engine; BuildKonfig;
generated contracts/theme; the `mobile-guard` build check). **Rationale**: it is the constitution's proven mobile
foundation and the operator's explicit directive ("same tech same architecture"). The customer app's post-review
fixes (viewModel-factory lifecycle, BackHandler, insets, single-source token handling) are inherited so the shop
app does not repeat those bugs.

### D2s — ⚠ SINGLE access-token bearer, NOT the two-token protocol

The one correction to the request's premise. **Verified in the codebase**:
- shop-web sends the **access token** as bearer (`apps/shop-web/src/lib/api.ts`: *"The ACCESS token (never the
  ID token) is the bearer"*); `getAccessToken()` → `session.tokens.accessToken`.
- `edge-api/shop` reads identity **only** from the gateway-verified JWT claims (`subject`, `groups`); there is
  **no `X-Effy-Access-Token`** anywhere in `apis/edge-api/shop/src`.
- The two-token protocol exists **only** for customer *password-mutation* endpoints, which relay an access token
  to Cognito's access-token-authorized APIs. **The shop backend never calls Cognito**, so it needs one token.

**Decision**: the Ktor auth plugin attaches `Authorization: Bearer <shop access token>` to `/shop/v1/*` and
**nothing else**. Simpler than 013's two-token plugin. `AuthDriver.currentSession()` therefore only needs to
surface the **access token** (plus the sub); the ID token is used only client-side for the display email (as
shop-web does), not sent to the backend.

### D3s — A dedicated `shop_mobile` app client (mirror 013 D3a, minus the password flow)

The shop pool (`infra/envs/dev/auth-shop.tf`) has one module-owned client (web). Add a **standalone**
`aws_cognito_user_pool_client.shop_mobile` on the same pool, mirroring `customer_mobile` with the shop
audience's differences:

| Setting | Value | Note |
|---|---|---|
| `explicit_auth_flows` | `["ALLOW_USER_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]` | **Drop `ALLOW_USER_SRP_AUTH`** — shop is passwordless; there is no password challenge |
| `generate_secret` | `false` | public client, PKCE |
| `prevent_user_existence_errors` | `"ENABLED"` | enumeration-safe |
| `access_token_validity` / `id_token_validity` | 60 min | as web |
| **`refresh_token_validity`** | **30 days** | ⚠ **matches shop-web, NOT customer's 90** — an employee/possibly-shared device is a different threat model than a personal phone (D6s) |
| callbacks | `effy-shop://auth/callback` / `effy-shop://signed-out` | native scheme |

Plus `/effy/<env>/auth/shop/mobile_app_client_id` in SSM (the app reads THIS), and the new client id added to
`extra_client_ids` for `shop` in `edge-gateway.tf` (currently `[]`) **or every mobile call 401s**.

**Why a separate client even though the refresh is the same as web** (unlike 013, where lifetime divergence was
the decisive reason): independent lifecycle (rotate/disable one surface), the native callback scheme, and
per-surface attribution — plus the operator directed it. Identity is per-**pool**, so `sub` is unchanged: one
operator, one record across web + mobile. Both changes additive; the pool + web client untouched.

### D4s — Contracts: generate the shop DTOs from `shop.ts` (the 013 D15 pipeline, re-targeted)

`packages/shared-types/src/shop.ts` is the single source of truth both surfaces type from. Re-point the 013
`ts-json-schema-generator → quicktype` pipeline at a shop barrel (`ShopStaffRecordDTO`, `ShopSummaryDTO`,
`ShopManagerPingDTO`, `ProblemJSON`, and the string unions `ShopRole` / `ShopStaffStatus` /
`ShopLifecycleStatus`). Output → committed `contract/ShopDto.kt`, CI-diff-guarded. **`toShopRoles` tolerant
narrowing is domain logic, reproduced in Kotlin in the `shop/domain` layer — not in the generated DTO** (a role
the backend adds later must map to nothing, not throw). The generated `roles: List<String>` is narrowed to
`List<ShopRole>` at the DTO→domain boundary.

### D5s — RBAC: the interface adapts to the role; the platform decides access

The one thing 013 did not have. Two layers, exactly as 007/009 and the constitution define:
- **Role-aware UI** — the operator's role comes from the **record** (`GET /shop/v1/me` → `roles`). Manager-only
  destinations are hidden from `shop_staff` / role-less. This is a **courtesy**, not the guard.
- **The manager gate** — `GET /shop/v1/manager-ping` returns 200 (`ShopManagerPingDTO`) or a **uniform 403**.
  The backend decides from the record's conjunction **role = shop_manager AND staff.status = active AND
  assigned shop.status = active**, reading the DB record and **never** the `cognito:groups` claim; it
  **fails closed** and the 403 body **does not disclose which term failed**.

**Decision**: the app calls `manager-ping` for the actual authorization and renders the uniform denial; it never
infers permission from the hidden control or the role claim (FR-023). The role claim is the **origin**; the
record is the **authority** (FR-027). **⚠ Partial sign-off (007):** the gate's *positive* half (a manager served
at an active shop), the inactive-shop denial, and the disabled-operator denial need shop data the back-office
creates (009); the *negative* half (staff, role-less, unassigned manager refused) is provable now.

### D6s — Refresh-token lifetime: 30 days (not 90)

**Decision**: `refresh_token_validity = 30` for the shop mobile client, matching shop-web — **not** customer
mobile's 90. **Rationale**: a shop operator's device is an employee/workplace device, possibly shared among
staff on a shift; an operator who leaves should lose access promptly, and a shared device should not hold a
long-lived credential. The customer's 90-day figure was chosen for a *personal* phone. The spec (FR-014/FR-015)
mandates only "survives restart" and "renew while possible," leaving the number to the plan. The operator may
lengthen it, but 30 is the conservative default for this audience.

### D7s — Login-first navigation + a simpler SessionState

The shop app has **no guest state**. The session machine is smaller than 013's:

```
SessionState = Restoring | SignedOut | SignedIn(operator) | Refused
```

- `Restoring` — asking Amplify on launch (not `SignedOut`, to avoid the sign-in flicker).
- `SignedOut` — show the sign-in flow (the only unauthenticated destination).
- `SignedIn(operator)` — the record loaded; render the role-aware shell.
- `Refused` — a disabled operator / a `403` on the identity read: signed out locally, told plainly (FR-030).

No `Guest`, no deferred-sign-in, no `Barred`-vs-`Authenticated` split beyond the above.

### D8s — The AuthDriver interface shrinks to EMAIL_OTP only

The `commonMain` `AuthDriver` (013 D5/D6 pattern — interface, Swift implements on iOS) has **far fewer
methods** than 013: `currentSession(forceRefresh)`, `signInWithEmailOtp(email)`, `confirmOtp(code)`,
`signOut()`, and `sessionChanges`. **No** sign-up (either route), **no** password sign-in, **no**
`startPasswordReset`, **no** `confirmSignUp`. The Swift `IosAuthBridge` and the Amplify Android driver implement
this smaller surface. The Amplify calls: `signIn(USER_AUTH, preferredFirstFactor/preferredChallenge = EMAIL_OTP)`
→ `confirmSignIn(code)` → `fetchAuthSession` → `signOut` (exactly the shop-web set, native).

### D9s — Telemetry deferred; the parity register reconciled (not just deferred silently)

Same Principle VII deviation as 013. **But** the shop parity register (row 9) had *scoped telemetry in* as a
mobile deliverable, so deferring here is not a no-op: FR-038 requires the register to be **corrected** to mark
telemetry deferred, or it would overstate what mobile delivers. Recorded in the plan's Complexity Tracking with
the shared closing slice `mobile-telemetry`.

### D10s — Tablet-first, window-size-driven layout (this surface diverges from 013's phone framing)

**This is the one place shop-mobile is NOT "013, minus."** The customer app is a personal handset; the shop app
is a **counter / back-room tablet in landscape** — a shared workplace device. So the form factor is a *product*
fact, not a styling preference, and it is written into the spec (FR-003a, SC-014a), not left to whoever builds
the first screen.

**Decision**: design **tablet-first**, and drive layout from the **window size, never the device type**.
- Use Compose Multiplatform's Material 3 **`WindowSizeClass`** (`calculateWindowSizeClass()`, available in
  `commonMain` via `material3-window-size-class` / the adaptive artifacts) — or `BoxWithConstraints` where a
  single measurement suffices — to branch **Expanded** (two-pane / master-detail using the width) vs **Compact**
  (single-column reflow). **No `isTablet` boolean, no `expect/actual` platform check** for layout — a tablet in
  split-screen is "compact", a large foldable is "expanded"; only the measured window is truth.
- **State stays hoisted in the `ViewModel`** (MVVM, Principle VI) so a rotation / resize / split-screen change
  re-renders the *same* immutable state into the other layout with nothing lost — the adaptivity is pure View.
- This slice's ~5 screens are simple (a centered, max-width sign-in reads well on a tablet already), so the
  visible payoff is small here. The point is the **rule and the mechanism** land now, so the shell and every
  later shop-mobile UI slice (orders, fulfillment, roster) inherit "make deliberate use of the tablet" instead
  of retrofitting it onto a phone-column app.

**Rejected**: a fixed phone-width column centered on a tablet (wastes the device the operator was given, and
the spec now forbids it — SC-014a); a hardcoded `isTablet` branch (wrong for split-screen / foldables /
desktop-class iPad windows — window size is the honest signal). **Consequence**: the plan's device matrix leads
with a real tablet in landscape, because tablet-first is a claim until seen on one (S4s).

---

## The spikes / operator-verified items

Fewer than 013 (no password flow, no step-up, no rotation-compat question that matters here):

| # | Question | Why |
|---|---|---|
| **S1s** | On the shop pool, does `USER_AUTH` + preferred `EMAIL_OTP` behave as shop-web observes (single `confirmSignIn` with the code)? | The whole auth flow. Shop-web proves it on web; confirm the native SDKs match. |
| **S2s** | The manager gate's **positive** half + inactive-shop/disabled-operator denials — need 009 shop data | Partial sign-off (007); the negative half is provable now. |
| **S3s** | Amplify Android Auto-Backup exclusion filenames (013 S6) | FR-016 — reuse the 013 finding. |
| **S4s** | On a **real large-screen tablet in landscape** (Android tablet **and** iPad): every screen uses the space, and reflows gracefully to phone / split-screen | FR-003a/SC-014a — tablet-first is a claim until seen on a tablet; the device matrix leads with one (D10s). |

---

## Summary — the rules this slice is bound by

1. **It is 013, minus.** One credential route, one token, no account writes — simpler (D1s, D2s, D8s).
2. **Single access-token bearer** to `/shop/v1/*` — no second header (D2s).
3. **A dedicated `shop_mobile` client**, 30-day refresh, no SRP; authorizer audience extended (D3s, D6s).
4. **Contracts generated from `shop.ts`**; `toShopRoles` narrowing in the domain layer (D4s).
5. **RBAC done right**: role-aware UI is a courtesy; the **backend manager gate** decides, uniform and
   fail-closed; the record is the authority, the claim the origin (D5s).
6. **Login-first**, a smaller SessionState, no guest (D7s).
7. **Telemetry deferred**, and the parity register **reconciled** so it does not overstate (D9s).
8. **Tablet-first** (FR-003a): the primary device is a large-screen tablet in landscape; layout is driven by the
   **window size class**, not the device type, and every later shop-mobile UI slice inherits the rule (D10s).
</content>
