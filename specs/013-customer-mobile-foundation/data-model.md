# Data Model — 013 Customer Mobile Foundation

**Feeds**: [plan.md](plan.md) · **Contracts**: [contracts/](contracts/)

**This app owns no database.** It has no local tables, no cache of server data, and no offline store. Everything
below is either an **in-memory domain model**, a **wire DTO** (generated — see D15), or a **state machine**.

> **Principle VI, restated for this file**: DTOs live in `contract/` (generated) and are mapped **explicitly** to
> domain models via `toDomain()`. **A DTO never escapes the data layer**, and the presentation layer never sees a
> nullable wire field it has to reason about.

---

## 1. The wire DTOs — GENERATED, not written

`shared/src/commonMain/.../contract/Dto.kt` is **generated from `packages/shared-types/src/customer.ts`** and
**committed**. **Do not hand-edit it.** CI regenerates and `git diff --exit-code`s it (D15).

The TypeScript source of truth, for reference:

| DTO | Shape |
|---|---|
| `CustomerDTO` | `id`, `email`, `givenName: string\|null`, `familyName: string\|null`, `status: "active"\|"barred"`, `hasPassword: boolean`, `passwordUpdatedAt: string\|null`, `createdAt: string` |
| `UpdateCustomerDTO` | `givenName: string\|null`, `familyName: string\|null` |
| `SetPasswordDTO` | `mode: "set"`, `code: string`, `newPassword: string` |
| `ChangePasswordDTO` | `mode: "change"`, `currentPassword: string`, `newPassword: string` |
| `PasswordWriteDTO` | `SetPasswordDTO \| ChangePasswordDTO` — a **discriminated union on `mode`** |
| `ResetConfirmDTO` | `email`, `code`, `newPassword` |
| `PasswordChallengeResultDTO` | `maskedDestination: string` (e.g. `j•••@example.com`) |
| `PasswordWriteResultDTO` | `customer: CustomerDTO`, `allSessionsRevoked: true` |
| `ProblemJSON` | `type`, `title`, `status`, `detail?`, `instance`, `request_id`, `errors?: {field,message}[]` |

**Two notes the generator cannot express, and the mapper must:**

- **`passwordUpdatedAt: null` means "never"**, not "unknown". It is the only honest source for *when* the password
  last changed.
- **`PasswordWriteDTO` is a discriminated union.** kotlinx.serialization models this as a sealed class with
  `@JsonClassDiscriminator("mode")`. If quicktype's output for this one type is awkward, **hand-fix that type and
  let the schema snapshot keep guarding it** — the escape hatch degrades to hand-written **for one type, not for
  the contract** (D15).

**Serialization**: production `Json { ignoreUnknownKeys = true }` (be liberal in what you accept).
**Tests**: `Json { ignoreUnknownKeys = false }` against recorded dev fixtures — **this is the drift alarm**, and it
is the only thing that catches "the backend returns a field the contract doesn't know about."

---

## 2. Domain models (`commonMain`, pure Kotlin, no serialization annotations)

```
Customer
  id            : String
  email         : String
  name          : CustomerName          // never two loose nullable strings past the data layer
  status        : CustomerStatus        // Active | Barred
  hasPassword   : Boolean
  passwordSetAt : Instant?              // null = never
  createdAt     : Instant

CustomerName
  given  : String?
  family : String?
  display   : String       // "Ada Lovelace" | "Ada" | "" — computed, never stored
  initials  : String       // see § 3 — the ONLY place initials are derived
```

`CustomerStatus` is a **sealed/enum domain type**, not the wire string. `Barred` is not an error code — it is a
**normal, expected state** the UI must render (FR-033).

### 3. Initials — one function, and it is a nest of edge cases (FR-022, SC-013)

The web surface got this wrong-adjacent enough that the spec calls it out. **One pure function in `domain`,
unit-tested against every case**, and it is the **only** place initials are computed.

| Input | Initials | Rule |
|---|---|---|
| `given="Ada", family="Lovelace"` | `AL` | first grapheme of each |
| `given="Ada", family=null` | `A` | one name → one initial |
| `given=null, family=null` | `—` **(a neutral glyph)** | **NEVER derive from the email** (FR-022, explicitly) |
| `given="李", family="明"` | `李明` | **graphemes, not chars** — a `Char` split mangles this |
| `given="👩‍🚀"` | `👩‍🚀` | an emoji is **one grapheme** made of several code points; a `.first()` on `Char` returns half a surrogate pair and renders as `�` |

**The rule: iterate grapheme clusters, not `Char`s.** This is the single most likely correctness bug in the UI
layer, and SC-013 demands **zero** blank circles, mangled glyphs, or email-derived letters.

---

## 4. Session — the state machine

The root state of the app. Everything else hangs off it.

```
SessionState
  ├─ Restoring                       // app just launched; asking Amplify. NOT "signed out".
  ├─ Guest                           // no session. A FIRST-CLASS state, not a failure (FR-002)
  ├─ Authenticated(customer)         // signed in AND the platform record says Active
  └─ Barred(customer)                // signed in, valid credential, record says Barred (FR-033)
```

**Transitions:**

| From | Event | To |
|---|---|---|
| `Restoring` | Amplify has a valid session **and** `GET /me` → `active` | `Authenticated` |
| `Restoring` | Amplify has a valid session **and** `GET /me` → `barred` | `Barred` |
| `Restoring` | no session / refresh credential expired (90 days) | `Guest` |
| `Guest` | sign-in or sign-up completes | `Authenticated` |
| `Authenticated` | **any** call returns `403 Forbidden` (barred mid-session) | `Barred` → **destroy the local session** → `Guest` (FR-033a) |
| `Authenticated` | sign out, or sign out everywhere | `Guest` |
| `Authenticated` | **password set or changed** | `Guest` — **every session dies, including this one** (FR-027) |
| `Authenticated` | ⚠ **Android Keystore failure** — Amplify recreates the key and silently drops the session | `Guest`, **with an explanation** (D11) |

**Three transitions that are easy to get wrong, and are requirements:**

- **`Restoring` is not `Guest`.** Rendering the guest home for a frame before flipping to signed-in is the classic
  mobile flicker. `Restoring` is a real state with its own UI.
- **Password write → `Guest`** (FR-027). Cognito revokes **all-or-nothing**; "all but this device" does not exist.
  So the app returns to sign-in and **says why**, then invites the customer to sign in with the password they just
  chose — which is also what proves it works (SC-019).
- **`Barred` must not be swallowed as a generic error.** A barred customer holds a **perfectly valid token**. The
  403 is the *answer*, not a failure (FR-033).

**Residual window (FR-027a).** Revoking sessions does **not** instantly invalidate already-issued access tokens —
another device keeps working for **up to 60 minutes** (the access-token validity). The app **must not claim an
immediacy the platform does not deliver**.

---

## 5. Password state — which journey is offered (FR-024, FR-025, SC-003)

Derived **only** from `Customer.hasPassword`, which is **platform-owned**. Cognito **cannot be asked** whether a
user has a password — there is no API field, and `UserStatus` does not distinguish. It is seeded at registration
from the route the customer chose (`GET /customer/v1/me?route=password` on first appearance) and thereafter is the
platform's own record.

```
hasPassword == false  →  SET journey     →  requires a FRESHLY EMAILED CODE (FR-024)
hasPassword == true   →  CHANGE journey  →  requires the CURRENT PASSWORD   (FR-025)
```

**`hasPassword` is a UX hint. It is NEVER an authorization input.** The backend decides, and it returns **409
`WrongModeError`** if the app offers the wrong journey. Lying about it in either direction grants **no capability
the inbox-holder did not already have** — which is exactly why it is safe for the client to hold.

### The set-password sequence — and why it is two calls, not one

```
1. POST /customer/v1/password/challenge   → 202 { maskedDestination }   // emails a code, NOW
2. PUT  /customer/v1/password  { mode:"set", code, newPassword }         // code verified IN THE SAME
                                                                          // request that writes the password
```

**There is no stored grant between them.** No ticket, no flag, no "verified" state sitting in a table waiting to be
stolen. The code is verified **server-side, in the same request that writes the password** — so there is nothing to
capture and replay. This is the whole of FR-024, and it is the reason a borrowed, unlocked, signed-in phone still
**cannot** plant a permanent password on a passwordless account.

**The app must never attempt this locally.** Amplify's `updatePassword` takes a non-optional old password, so the
high-level API *happens* to block it — but that is a **type-level accident, not a security guard**, and the
**escape hatch reaches the raw call**. Hence the build guard (D8).

---

## 6. Auth flow state (the sign-in / sign-up machine)

Mirrors the driver contract ([contracts/auth-driver.contract.md](contracts/auth-driver.contract.md)) so the
ViewModel never has to know which SDK is underneath.

```
AuthStep
  ├─ Done(session)                     // signed in
  ├─ NeedsOtp(destination)             // a code was emailed → confirm it
  ├─ NeedsSignUpConfirmation(email)    // registration code → confirm, then auto-sign-in
  └─ Failed(AuthError)
```

`AuthError` is a **closed domain type**, and every arm maps to a message that **does not disclose whether an email
is registered** (FR-016):

`InvalidCredentials` · `CodeIncorrect` · `CodeExpired` · `RateLimited(retryAfter?)` · `Network` ·
`Unavailable` · `Unexpected`

**Never** surface the SDK's exception text. `UserNotFoundException` and `NotAuthorizedException` must produce the
**same** message, or the app becomes an account-enumeration oracle — a thing the pool already guards against with
`prevent_user_existence_errors = ENABLED`, which the client must not undo.

---

## 7. Configuration (build-time, immutable)

```
AppConfig
  cognitoUserPoolId   : String   // a NAME, not a key
  cognitoAppClientId  : String   // a NAME, not a key — and there is NO client secret
  cognitoRegion       : String
  edgeApiBaseUrl      : String   // account/profile  → the cold path
  coreApiBaseUrl      : String   // commerce         → the hot path (nothing to call yet)
```

Supplied by **BuildKonfig** from a git-ignored `secrets.properties`; a missing key **fails the build** (FR-041).
From these, `commonMain` builds **one Amplify config string**, handed to both SDKs — **no
`amplifyconfiguration.json` is generated or shipped** (D12).

> **Why none of this is a secret (FR-042).** A user-pool id and an app-client id are **names, not keys**. They say
> *which* pool to talk to; they authorize **nothing**. Anyone may present them and receive exactly what a stranger
> is entitled to: a challenge. A **secret** is something that, held by an attacker, **grants capability** — a client
> secret, an access key, a signing key. **None of that class may ever enter a mobile binary**, because a mobile app
> is a **published artifact**: `strings`, a decompiler, or a proxy recovers every byte. There is no obfuscated
> secret in a shipped app, only a delayed one.
>
> Hence `generate_secret = false` on the app client — **already true** — and hence the build guard asserting that
> no required key name matches `/SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL/i`. The test for "may this ship?" is not
> *"does it sound sensitive?"* but **"does an attacker who reads it gain anything?"**

---

## 8. What is deliberately absent

- **No local database, no offline cache, no server-data mirror.** Server state is fetched; it is never hand-cached
  (Principle VI). There is nothing to browse offline yet, and inventing a cache now would be inventing a
  cache-invalidation bug now.
- **No product, cart, order, or address model.** They do not exist for **any** customer surface (the platform has no
  product tables at all).
- **No device-token / push model.** Push goes through the notifications path in a later slice.
- **No analytics event model.** Deferred with Principle VII (plan § Complexity Tracking).
</content>
