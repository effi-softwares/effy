# Contract — `edge-api/customer`, as consumed by `customer-mobile`

**This contract is not new.** `apis/edge-api/customer` was built by 011 and 012 and is **already implemented**.
This document records it **as the mobile app must consume it**, so the second client cannot drift from the first.

**Base URL**: SSM `/effy/<env>/edge/api_endpoint` → dev: `https://edge-api.dev.effyshopping.com`
**Media type**: `application/json`; **errors**: `application/problem+json`
**Every response carries** `x-request-id` — **log it**, it is how a support request becomes a backend trace.

---

## ⚠ The two-token protocol — read this before anything else

Every authenticated route on this service needs the **ID token** as the bearer. The password and session routes
**additionally** need the **access token** in a second header.

```http
Authorization:       Bearer <ID token>
X-Effy-Access-Token: <access token>          # lowercase on the wire: x-effy-access-token
```

| Why | |
|---|---|
| **`Authorization` = ID token** | The gateway's JWT authorizer pins `audience = [app_client_id]` — that is the **ID token's** shape. `GET /customer/v1/me` also **401s if the token carries no `email` claim**, which the access token does not have. **Sending the access token as the bearer fails, confusingly.** |
| **`X-Effy-Access-Token` = access token** | Cognito's `ChangePassword` / `GlobalSignOut` / `GetUserAttributeVerificationCode` / `VerifyUserAttribute` are **access-token-authorized**. The Lambda holds **no IAM permission** for them — it relays **the customer's own authority**. That is why there is no auth proxy here (Principle IV). |
| **They are cross-checked** | The backend decodes the access token's `sub` and **401s if it differs from the gateway-verified `sub`**. The mismatched-pair attack is already closed — do not try to be clever. |

---

## Routes

### 1. `GET /customer/v1/me` — identity read + just-in-time record creation

```http
GET /customer/v1/me?route=password        # ?route= is a SEED, honoured only on FIRST appearance
Authorization: Bearer <ID token>
→ 200 CustomerDTO
```

- **Idempotent creation** (FR-031): the first call creates the platform's record; every later call reads it. Two
  calls make **one** record. A customer who already exists from the web lands on **that same record**.
- **`?route=`** seeds `has_password` at registration (`password` → `true`; omit → `false`). It is **ignored on every
  call after the first**. It is a **UX hint, never an authorization input** — lying in either direction grants no
  capability the inbox-holder didn't already have.
- **`403`** → the customer is **barred**. This is the *answer*, not a failure (FR-033).

**Mobile MUST**: call this **once per session start**, pass `?route=password` **only** when the customer just
registered *with* a password, and render **everything** from the response — **never** from token claims (FR-032).

### 2. `PATCH /customer/v1/me` — change the display name

```http
PATCH /customer/v1/me
Authorization: Bearer <ID token>
{ "givenName": "Ada", "familyName": "Lovelace" }     # null or "" clears; max 60 chars each
→ 200 CustomerDTO
```

Only `givenName` / `familyName` are writable; anything else in the body is **ignored**. The backend also pushes the
name to Cognito so the ID token's claims do not drift.

**Mobile MUST**: after a successful name change, **force a token refresh** (`fetchAuthSession(forceRefresh = true)`)
so the ID token's `given_name` claim matches the record — otherwise the greeting goes stale until the token expires
(the web app hit exactly this).

### 3. `POST /customer/v1/password/challenge` — email a step-up code

```http
POST /customer/v1/password/challenge
Authorization: Bearer <ID token>
X-Effy-Access-Token: <access token>
{}
→ 202 { "maskedDestination": "j•••@example.com" }
```

Sends a code to the account's **verified email**, now. **Only** for the `set` journey. There is **no stored grant**
— this call creates nothing the app can hold, and nothing an attacker can steal.

### 4. `PUT /customer/v1/password` — set or change

```http
PUT /customer/v1/password
Authorization: Bearer <ID token>
X-Effy-Access-Token: <access token>

{ "mode": "set",    "code": "123456",  "newPassword": "…" }      # first password
{ "mode": "change", "currentPassword": "…", "newPassword": "…" } # existing password

→ 200 { "customer": CustomerDTO, "allSessionsRevoked": true }
```

**Server-side ordering — this is the security core, and it is why the app must not reimplement it:**

```
policy check (length + BREACH SCREENING, fail-closed)
  → [set]  VerifyUserAttribute(code)        ← the code is verified IN THE SAME REQUEST that writes the password
  → ChangePassword                          ← for `set`, WITHOUT PreviousPassword (Cognito permits this — that is the hazard)
  → GlobalSignOut                           ← every session, EVERYWHERE
  → DB has_password = true
  → email notification (NO LINK — a link here is itself a phishing primitive)
```

**`allSessionsRevoked` is always `true` — including the calling device.**

**Mobile MUST**, on `200`: **discard its tokens and return to sign-in**, telling the customer why and inviting them
to sign in with the password they just chose (FR-027, SC-019). It **MUST NOT** try to keep the session alive.

**Breach screening is fail-closed and lives here.** The app can pre-validate **length only** (`PASSWORD_MIN_LENGTH
= 12`, no composition rules); it **cannot** pre-validate breach status and must not pretend to.

### 5. `DELETE /customer/v1/sessions` — sign out everywhere

```http
DELETE /customer/v1/sessions
Authorization: Bearer <ID token>
X-Effy-Access-Token: <access token>
→ 204
```

Relays `GlobalSignOut`. **Not instant**: already-issued access tokens on other devices remain valid for **up to 60
minutes** (FR-027a). **Do not claim an immediacy the platform does not deliver.**

**Plain sign-out** (this device only) is **not an API call** — it is a **local token purge** via the driver.

### 6. `POST /customer/v1/password/reset-confirm` — finish account recovery (**PUBLIC**)

```http
POST /customer/v1/password/reset-confirm          # NO authorizer — the customer is locked out by definition
{ "email": "…", "code": "…", "newPassword": "…" }
→ 200 { "ok": true }
```

**Recovery is split, and the split is deliberate** (012 FR-022b): *starting* a reset is a client-side Cognito call
(`resetPassword`), but **finishing** it goes **through the backend** — because `confirmForgotPassword` called
directly would **bypass breach screening** and leave `has_password` **permanently wrong**.

**Mobile MUST NOT call `confirmResetPassword` from the SDK.** This is a real, previously-shipped bug class; the web
app removed that call for exactly this reason.

### 7. Health — `GET /customer/healthz` · `GET /customer/readyz` (public)

---

## Errors — `application/problem+json`

```json
{ "type": "https://effyshopping.com/problems/validation-failed", "title": "…", "status": 400,
  "detail": "…", "instance": "…", "request_id": "…", "errors": [{ "field": "…", "message": "…" }] }
```

| Status | Means | The app shows |
|---|---|---|
| **400** | too short · **breached password** · **breach service down (fail-closed)** · wrong code · expired code | The reason, actionably. A breach refusal is **not** a server error — say what it is. |
| **401** | not signed in · **token pair mismatch** · **wrong current password** (title `Incorrect password`) | Re-auth, **or** "that password is not right" — the two must not be conflated. |
| **403** | **barred**, or unknown customer | "This account cannot be used." **A valid credential is not permission.** |
| **409** | `WrongModeError` — `set` on an account that has a password, or `change` on one that doesn't | Re-read `hasPassword` and offer the **other** journey. Never both. |
| **429** | rate-limited | Explain the wait. **Do not retry silently.** |
| **503** | unavailable | Recoverable — offer retry, **lose nothing the customer typed** (FR-008). |

**Never surface `title`/`detail` for auth failures verbatim if it would disclose whether an email is registered**
(FR-016).

---

## What the mobile app must NEVER call

| Forbidden | Why | Enforced by |
|---|---|---|
| Cognito `ChangePassword` (via Amplify **or the escape hatch**) | It permits **omitting the previous password when the user has none** — the account-takeover primitive 012 exists to close. **IAM cannot close it**; only the backend gate can. | **Build guard** (D8), proved by deliberately breaking it |
| Cognito `GlobalSignOut` directly | The backend orders it with the DB write and the notification. | Same guard |
| SDK `confirmResetPassword` | Bypasses breach screening; leaves `has_password` wrong. Route 6 exists for this. | Same guard |
| Amplify `escapeHatch` / `getEscapeHatch` | Hands you the raw `CognitoIdentityProviderClient` — every forbidden call above becomes reachable. | Same guard |

---

## The routing law (011 FR-028), binding here

| Traffic | Backend |
|---|---|
| product · catalog · search · cart · order · payment | **`core-api`** (hot path) — **nothing to call yet** |
| customer profile · account · password · sessions | **`edge-api/customer`** (cold path) — **this contract** |

The app builds **one HTTP client per base URL** so the law is **structural**, not a comment.
</content>
