# Data Model: Customer Profile Management (012)

**Date**: 2026-07-14 · **Feeds**: [plan.md](./plan.md) · [contracts/](./contracts/customer-account.contract.md)

One table changes. One migration. No new tables, **and deliberately no step-up/code table** — see the note at the
end, because its *absence* is a design decision, not an omission.

---

## `public.customer` — two new columns

| Column | Type | Null | Default | Owner |
|---|---|---|---|---|
| `has_password` | `boolean` | NOT NULL | `false` | **Platform** |
| `password_updated_at` | `timestamptz` | NULL | — | **Platform** |

Both are **platform-owned**, in exactly the sense `status` already is (011 FR-025): they are **never written from
token data**, and no client can set them directly.

### `has_password` — why the database has to hold this at all

**Cognito cannot be asked.** There is no API that reports whether a user has a password: `AdminGetUser` does not
return it, and `UserStatus` does not distinguish it — a passwordless `CONFIRMED` user and an email+password
`CONFIRMED` user are **byte-for-byte identical** on the wire (research R5).

So the platform must remember, which is what makes FR-013 a *data* requirement rather than a *query*. And it forces
the consequence that shaped this whole slice: **every path that establishes a password must pass through the
platform**, or this column silently goes wrong. That is why account recovery was pulled into scope (FR-022b / R6) —
it sets a password, and today it does so entirely client-side where the platform never finds out.

**Who writes it, and when:**

| Event | Write | Authority |
|---|---|---|
| Set first password (`PUT /customer/v1/password`, `mode: "set"`) | `true` + `now()` | **Authoritative** — the platform performed it |
| Change password (`mode: "change"`) | stays `true`, `password_updated_at = now()` | **Authoritative** |
| Recovery confirm (`POST /customer/v1/password/reset-confirm`) | `true` + `now()` | **Authoritative** |
| Registration (JIT upsert on first `/customer/v1/me`) | seeded from the **declared credential route** | **Untrusted hint** — see below |

### The seed is a hint, and that is safe — but only because of *why*

At registration the platform gets no trustworthy signal: sign-up happens client-side against Cognito, and the JIT
upsert sees only a token. So the sign-up form **declares** which route it took, and the row is seeded from that.

That is untrusted input deciding a security-adjacent flag, which deserves an argument rather than a shrug. **Lying
in either direction gains the liar nothing:**

- **"I have a password" (but don't)** → the page offers *Change password* → which demands a current password that
  does not exist → Cognito refuses. The customer is stuck and recovers via "Forgot password?". **No capability
  gained.**
- **"I have no password" (but do)** → the page offers *Set a password* → which demands **a fresh code sent to the
  account's verified email**. Anyone who can read that inbox **can already reset the password via recovery**.
  **No capability gained.**

So `has_password` is a **UX hint at seed time and an authoritative record thereafter**. It is *never* an
authorization input — the actual gate on the set-password flow is the emailed code (FR-017), and the actual gate on
the change flow is the current password (FR-016). Cognito enforces both, regardless of what this column claims.

This is the constitution's own distinction, applied one level down: **the claim is the origin; the record is the
authority.**

### `password_updated_at`

Purely what the account page reports back ("Last changed 12 June 2026"). `NULL` means *never* — which is a normal,
permanent, first-class state for an OTP customer, not a missing value (FR-015). The UI must render it as such and
must never present it as an incomplete profile.

---

## Migration

`db/migrations/20260714__customer_password_state.sql` — forward-only, additive, non-destructive.

- Both columns are added with a safe default; **no backfill is possible or needed** (`public.customer` has no rows
  where the answer is knowable — and per 011's own migration note, it is currently empty in dev anyway).
- `has_password` defaults to `false`, which is the **safe** default: a customer wrongly marked "no password" is
  offered the *set* flow, which is gated by an emailed code — strictly harder than the alternative error, where a
  customer wrongly marked "has password" is merely stuck.
- No index. Neither column is ever a predicate — they are read only on the single-row lookup by `cognito_sub`, which
  is already unique-indexed.

---

## What is deliberately **not** here: a step-up / verification-code table

The obvious design stores a step-up grant (hash the code, store it, expire it, mark it used, rate-limit it). **There
is no such table, on purpose.**

The step-up code is issued and consumed **by Cognito** (`GetUserAttributeVerificationCode` → `VerifyUserAttribute`),
and it is verified **in the same backend request that sets the password** (research R1). So:

- There is no grant to store, because there is **no interval** during which "this session may set a password" exists
  as state anywhere — not in a row, not in a cookie, not in a token.
- **FR-019** ("the authority MUST be short-lived and scoped to that operation") is satisfied **by construction**
  rather than by a TTL that someone has to remember to enforce correctly.
- Expiry, single-use, and rate limiting (FR-018 / FR-020) are Cognito's, and Cognito already gets them right.

A table here would be a **new thing to steal** in exchange for nothing. Its absence is the point.

---

## `CustomerDTO` — the wire shape (`@effy/shared-types`)

Defined **once** and imported by both `customer-web` and `apis/edge-api/customer` (Principle II).

```ts
export interface CustomerDTO {
  id: string
  email: string
  givenName: string | null
  familyName: string | null
  status: CustomerStatus

  /** FR-013 — drives which password control is offered. NEVER inferred from the sign-in route:
   *  a Google-LINKED customer is a native user and CAN hold a password (research R5/R12). */
  hasPassword: boolean

  /** FR-015 — null means "never", which is a legitimate, complete state, not a gap. */
  passwordUpdatedAt: string | null

  createdAt: string
}
```

`cognito_sub` stays out of the DTO, as it has since 011: it is an internal join key, and there is no reason to hand
a customer their identity-provider subject id back over the wire.
