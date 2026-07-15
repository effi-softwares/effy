# Data Model — 014 Shop Mobile Foundation

**Feeds**: [plan.md](plan.md) · **Contracts**: [contracts/](contracts/)

**This app owns no database.** No local tables, no server-data cache. Everything below is an in-memory domain
model, a generated wire DTO, or a state machine. DTOs live in `contract/` (generated from `shop.ts`, D4s) and
are mapped **explicitly** to domain models via `toDomain()`; a DTO never escapes the data layer (Principle VI).

---

## 1. Wire DTOs — GENERATED, not written

`shared/.../contract/ShopDto.kt` is generated from `packages/shared-types/src/shop.ts` and committed;
CI regenerates + `git diff --exit-code`s it (D4s). The TypeScript source of truth:

| DTO | Shape |
|---|---|
| `ShopStaffRecordDTO` | `subject`, `email: string\|null`, `roles: string[]`, `status: "active"\|"disabled"`, `shop: ShopSummaryDTO\|null`, `lastSeenAt` |
| `ShopSummaryDTO` | `id`, `code`, `name`, `status: "active"\|"suspended"\|"disabled"` |
| `ShopManagerPingDTO` | `audience: "shop"`, `scope: "shop_manager"`, `subject`, `message` |
| `ProblemJSON` | RFC 9457 — `type`, `title`, `status`, `detail?`, `instance` |

**Notes the mapper must carry** (not expressible in the generated file):
- **`email: null` is an expected state** — a provisioned operator the platform has no email for *yet* (FR-021).
  The app shows a graceful placeholder, never a raw identifier or an invented address.
- **`shop: null` is an expected state** — a provisioned-but-unassigned operator (FR-021). Not an error.
- **`roles: string[]` is narrowed at the boundary** to `List<ShopRole>` via `toShopRoles` (domain logic, D4s):
  a role the backend adds later maps to nothing rather than throwing.

Production `Json { ignoreUnknownKeys = true }`; **tests** `ignoreUnknownKeys = false` against recorded dev
fixtures — the drift alarm.

---

## 2. Domain models (`commonMain`, pure Kotlin)

```
ShopRole            = MANAGER | STAFF                 // narrowed from the claim/record; unknown → dropped
OperatorStatus      = ACTIVE | DISABLED               // platform-owned; DISABLED is refused
ShopLifecycle       = ACTIVE | SUSPENDED | DISABLED    // only ACTIVE serves; both others refuse

AssignedShop        { id; code; name; lifecycle: ShopLifecycle }

Operator            {                                  // the platform's RECORD — the authority on access
    subject: String
    email:   String?                                   // null = not provisioned yet (expected)
    roles:   List<ShopRole>
    status:  OperatorStatus
    shop:    AssignedShop?                              // null = unassigned (expected)
    display: String                                    // email ?? "Operator" — never a raw sub
    isManagerByRole: Boolean                            // roles.contains(MANAGER) — UX ONLY, never the guard
}
```

`isManagerByRole` decides **what the UI offers**. It never decides **what the platform allows** — that is the
manager gate (§4). Keeping the two visibly separate in the model is the point.

---

## 3. Session — the login-first state machine (D7s)

```
SessionState
  ├─ Restoring                    // launch: asking Amplify. NOT SignedOut (avoids the sign-in flicker)
  ├─ SignedOut                    // the ONLY unauthenticated destination — show the email→code flow
  ├─ SignedIn(operator)           // record loaded; render the role-aware shell
  └─ Refused                      // disabled operator / 403 on identity read → local sign-out + a plain message
```

**Transitions:**

| From | Event | To |
|---|---|---|
| `Restoring` | Amplify has a session **and** `GET /me` → `active` | `SignedIn(operator)` |
| `Restoring` | no session / refresh expired (30 days) | `SignedOut` |
| `Restoring` / `SignedIn` | `GET /me` → **403** (disabled operator, FR-030) | `Refused` → destroy local session |
| `SignedOut` | email → code → confirmed | `SignedIn(operator)` |
| `SignedIn` | sign out | `SignedOut` |
| `SignedIn` | Amplify drops the session unexpectedly (Keystore failure, 013 D11) | `SignedOut`, with an explanation |
| `Refused` | acknowledge | `SignedOut` |

There is **no `Guest`, no deferred-sign-in, no `Barred`-vs-`Authenticated` split** — simpler than 013's machine.
`Restoring` renders its own screen so the sign-in form never flickers before a remembered session resolves.

---

## 4. Authorization — the manager gate (D5s; FR-023–FR-027)

Two distinct decisions the app must **not** conflate:

```
WHAT THE UI OFFERS   ← operator.isManagerByRole (from the record's roles)   — a courtesy, hideable
WHAT THE PLATFORM ALLOWS ← GET /shop/v1/manager-ping                         — the authority
```

The gate call result:

```
ManagerAccess = Granted | Denied
```

- **`Granted`** — `manager-ping` → 200 `ShopManagerPingDTO`. The backend confirmed **role = shop_manager AND
  operator status = active AND assigned shop status = active** (a DB conjunction; the `cognito:groups` claim is
  **not** consulted).
- **`Denied`** — `manager-ping` → **403** (uniform; the body does not say which of the three terms failed). The
  app renders one denial message regardless (FR-025). **Fail-closed**: a `503`/error is treated as no-grant, not
  a grant (FR-026).

The app must reach the gate for the *decision* even when `isManagerByRole` is true — the role passing does **not**
imply the gate passes (a manager with no assigned shop, or an inactive shop, is refused). **Partial sign-off**
(007): the `Granted` path + the inactive-shop / disabled-operator denials need 009 shop data; the `Denied`-for-
staff / role-less / unassigned-manager paths are provable now.

---

## 5. Configuration (build-time, immutable)

```
AppConfig
  cognitoUserPoolId   : String   // a NAME, not a key
  cognitoAppClientId  : String   // the SHOP MOBILE client id (/effy/<env>/auth/shop/mobile_app_client_id) — a NAME
  cognitoRegion       : String
  shopApiBaseUrl      : String   // edge-api/shop — the ONLY backend this app calls
```

Supplied by BuildKonfig from a git-ignored `secrets.properties`; a missing key **fails the build** (FR-035).
One Amplify config string is built from these, handed to both SDKs — no `amplifyconfiguration.json`. **None of
these is a secret** (FR-036): a pool id / client id is a *name*, and the client has **no client secret**.

---

## 6. What is deliberately absent

- **No password / sign-up / recovery model** — the audience has none (FR-008/FR-010).
- **No two-token / `X-Effy-Access-Token`** — shop is single access-token (D2s).
- **No account-management model** (name, password, sign-out-everywhere) — those are customer-only (013).
- **No local database, no server-data cache, no product/order/inventory model** — none exist for any shop
  surface yet.
- **No analytics/crash model** — deferred with Principle VII (plan § Complexity Tracking, D9s).
</content>
