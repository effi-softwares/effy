# Contract: Customer Account & Password (012)

**Service**: `apis/edge-api/customer` (cold path) · **Gateway**: shared HTTP API · **Pool**: customer

All routes are `/customer/v1/...` per the shared-gateway contract. Four are behind the **customer JWT authorizer**;
**one is deliberately public** and the reason is given.

> **The routing law (011 FR-028) holds.** Everything here is profile/account → cold path. **No commerce route may
> be added to this service** without a recorded exception.

---

## The two rules that bind every authenticated route

### 1. Two tokens, and their `sub`s MUST match

The gateway authorizes the **ID token** (`Authorization: Bearer <idToken>` — unchanged from 011; the authorizer's
`audience = [client_id]` is configured for it). But Cognito's password APIs are authorized by the **access token**.
So the storefront sends both:

```http
Authorization:         Bearer <ID token>        ← the gateway verifies this
X-Effy-Access-Token:   <access token>           ← the Lambda relays this to Cognito
```

**MUST**: the Lambda **rejects with `401` any request whose access-token `sub` ≠ the `sub` the authorizer verified.**

This is not defensive padding. Without it, an attacker who holds a victim's ID token can pair it with **their own**
access token: the authorizer verifies the victim, the platform looks up **the victim's row**, and Cognito mutates
**the attacker's user**. The result writes `has_password = true` onto the victim's record while setting the
*attacker's* password — a corrupted record that leaves the victim permanently holding the wrong control. One
comparison closes the entire class. See research R12.

### 2. The record decides, not the credential

Every route re-reads `public.customer` and **refuses a `barred` customer with `403`** (FR-034), however impeccable
the token. Identity comes from the verified `sub` — **never** from the request body (FR-035).

---

## `GET /customer/v1/me` — *modified*

Unchanged behavior (record-backed identity read + idempotent JIT upsert). The DTO **gains two fields**:

```jsonc
{
  "id": "…", "email": "…", "givenName": "Janith", "familyName": "Madarasinghe",
  "status": "active",
  "hasPassword": false,              // FR-013 — decides which control the page renders
  "passwordUpdatedAt": null,         // FR-015 — null = never, a legitimate state
  "createdAt": "2026-07-14T…"
}
```

Accepts an **optional** `?route=password|otp|google` hint on the **first** (creating) upsert only, to seed
`has_password`. It is **client-asserted, untrusted, and safe** — the full argument is in [data-model.md](../data-model.md);
the short version is that lying in either direction gains the liar **no capability the inbox-holder did not already
have**. It is ignored on every subsequent call: once the platform has performed a password write, the record is
authoritative and the hint is dead.

---

## `POST /customer/v1/password/challenge` — *new*

Sends the step-up code that FR-017 requires. **It grants nothing** — it only puts a code in the customer's inbox.

| | |
|---|---|
| **Body** | *(none)* |
| **Auth** | customer JWT + access token |
| **Cognito** | `GetUserAttributeVerificationCode(accessToken, "email")` — token-authorized, **no IAM** |
| **`202`** | Code sent. Response body carries **only** a masked destination (`j•••@example.com`) — never the full address, never the code. |

**Refusals**

| Code | When |
|---|---|
| `409` | The account **already has a password** (`has_password = true`). The set flow does not apply; use `change`. |
| `403` | Barred customer. |
| `429` | Rate-limited (Cognito's own limits, surfaced). |

---

## `PUT /customer/v1/password` — *new* — set **or** change

**One route, two modes**, because they are two flows for two people (FR-014) and the platform must refuse the one
that does not apply — even if the caller contrives to submit it.

```jsonc
// mode: "set"     — the customer has NEVER had a password
{ "mode": "set",    "code": "123456",  "newPassword": "…" }

// mode: "change"  — the customer HAS one
{ "mode": "change", "currentPassword": "…", "newPassword": "…" }
```

### `mode: "set"` — the security core (FR-017)

**MUST** be refused with `409` unless `has_password = false`.

Executed as **one atomic sequence in one request** — there is no stored grant, and therefore no window in which
"may set a password" exists as stealable state (research R1):

1. **Policy + breach check** on `newPassword` (`@effy/edge-shared/password`) — *before* anything is touched.
2. `VerifyUserAttribute(accessToken, "email", code)` — **consumes the code; proves the inbox.**
3. `ChangePassword(accessToken, ProposedPassword)` — **`PreviousPassword` omitted.** This is the call Cognito
   permits and Amplify **cannot express** (its `updatePassword` asserts a non-empty `oldPassword` client-side), and
   it is precisely why this must live on the backend.
4. `GlobalSignOut(accessToken)` — FR-024.
5. `UPDATE customer SET has_password = true, password_updated_at = now()`.
6. Notify the account email (FR-025) — **no link in the message.**

⚠ **Order is load-bearing.** The code is verified in step 2, *before* the password is set in step 3. A session that
cannot produce a valid code **never reaches step 3**. That is SC-004, and it is the reason this route exists.

### `mode: "change"` (FR-016)

**MUST** be refused with `409` unless `has_password = true`. Same sequence, but step 2 is skipped and step 3 passes
`PreviousPassword` — **Cognito verifies the current password itself**, which is why no separate auth-flow call is
needed and why `ADMIN_USER_PASSWORD_AUTH` stays disabled.

### Refusals (both modes)

| Code | When | Note |
|---|---|---|
| `400` | Password fails policy (< 12 chars) | Actionable message. |
| `400` | Password appears in a **known breach** | Actionable message. **On breach-service outage: also refused** — fail closed (FR-022a / R8). |
| `400` | `CodeMismatchException` / `ExpiredCodeException` | The code is wrong, expired, or already used (FR-018). |
| `401` | `NotAuthorizedException` on `change` | Wrong current password (FR-016). **Says which field**, per FR-027. |
| `403` | Barred customer | Uniform; never discloses *why*. |
| `409` | Wrong mode for this account's state | FR-014 — the platform refuses the flow the customer cannot reach. |
| `429` | Cognito rate limit | FR-020. |

**Success `200`** returns the updated `CustomerDTO` **and** signals the caller that **all sessions are now revoked**
— the storefront must clear cookies and route to sign-in (FR-024).

**Never logged, ever**: the password, the code, either token (FR-039 / SC-013).

---

## `DELETE /customer/v1/sessions` — *new* — sign out on all devices (FR-032)

`GlobalSignOut(accessToken)` → `204`. Token-authorized; no IAM. The storefront then clears cookies and redirects to
a public page.

---

## `POST /customer/v1/password/reset-confirm` — *new* — **PUBLIC (no authorizer)** (FR-022b)

The recovery ("forgot password") confirm step, **moved behind the backend**.

```jsonc
{ "email": "…", "code": "…", "newPassword": "…" }
```

**Why public.** The caller has **no session** — that is the entire point of account recovery. They prove the inbox
instead. The Cognito API it wraps (`ConfirmForgotPassword`) is itself unauthenticated and needs **no IAM**, so this
route holds no privilege whatsoever.

**Why it exists at all.** Two defects, one fix (research R6):

1. **FR-022 was bypassable.** Breach screening on the account page but not on the recovery page is not a rule, it is
   a **detour sign** — and recovery sets a password too.
2. **FR-013 was corruptible.** Recovery ran client-side, so the platform never learned a password now existed, and
   `has_password` went stale **permanently** — leaving the account page offering the wrong control forever after.

Sequence: policy + breach check → `ConfirmForgotPassword` → `UPDATE customer SET has_password = true,
password_updated_at = now()` (looked up by email) → notify (FR-025).

**Refusals**: `400` policy/breach/code · `429` rate limit. It **MUST NOT** disclose whether the email is registered
(the pool runs `prevent_user_existence_errors = ENABLED`; this route must not undo that).

---

## Cognito surface used — and the IAM it needs

| Call | Authorized by | New IAM |
|---|---|---|
| `GetUserAttributeVerificationCode` | the customer's **access token** | **none** |
| `VerifyUserAttribute` | the customer's **access token** | **none** |
| `ChangePassword` | the customer's **access token** | **none** |
| `GlobalSignOut` | the customer's **access token** | **none** |
| `UpdateUserAttributes` (name → token claims, FR-008) | the customer's **access token** | **none** |
| `ConfirmForgotPassword` | *unauthenticated* | **none** |
| *notification email* | — | **`ses:SendEmail`** ← the only new permission in this slice |

AWS does not evaluate IAM policies for the token-authorized operations. The Lambda is **relaying the customer's own
authority, not exercising its own** — so a compromised customer Lambda still cannot touch an account whose token it
does not hold. That is a materially smaller blast radius than 009's shop provisioning, which genuinely required
`AdminCreateUser`.

**Deliberately not used**: `AdminSetUserPassword`. It would make the *backend* the authorizer of a credential change
rather than a relay of the customer's own — and a bug in that check is exactly the account-takeover primitive this
entire slice exists to eliminate (research R4). It remains available as an operator break-glass, and nothing more.
