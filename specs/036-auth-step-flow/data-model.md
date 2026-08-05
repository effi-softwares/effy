# Data Model: Customer Sign-in & Sign-up — A Stepped Flow (036)

**Date**: 2026-08-05 · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

⚠ **This feature adds no table, no column, and no migration.** Almost everything below is *ephemeral flow
state* — the step machine a person is walking through. The one persisted thing already exists.

---

## 1. Persisted data — what already exists, and why it needs nothing

### `public.customer` (unchanged)

| Column | Type | Null? | Role here |
|---|---|---|---|
| `cognito_sub` | text | NOT NULL | Identity key. Survives federated linking. |
| `email` | text | NOT NULL | — |
| `given_name` | text | **NULL** | ⚠ Written by the **name step**, after the account exists. |
| `family_name` | text | **NULL** | ⚠ Same. |
| `has_password` | boolean | NOT NULL | Seeded by `?route=` on the creating read. Unchanged. |
| `status` | text | NOT NULL | The barred gate. Unchanged. |

Both name columns are **already nullable, on purpose** —
`db/migrations/20260715090000_customer_name_parts.sql:21-31`:

> *"Both stay NULLABLE. The federated route (Google, parked) supplies whatever the provider asserts and may
> assert neither — the platform must not invent a name it was never given."*

That sentence was written for Google and it is exactly what name-last needs. **No migration.**

### Cognito user attributes (unchanged schema)

`given_name` / `family_name` are standard, **optional** attributes — there is no `schema {}` block in
`infra/modules/cognito-user-pool/*.tf`, so Cognito's default optional schema applies. Both are in
`customer_writable_attributes` for **both** app clients (`auth-customer.tf:20-24`, `:111`, `:206`), and
`UpdateUserAttributes` is authorised by the **customer's own access token** — no IAM, no admin API. **No
Terraform change.**

### The two-writer rule (the only real data invariant this feature introduces)

A customer's name lives in **two** places and they must not drift:

| Store | Read by | Written by |
|---|---|---|
| `public.customer.given_name/family_name` | the whole account page, **all** of mobile, every DTO | `PATCH /customer/v1/me` |
| Cognito attribute → ID-token `given_name` claim | ⚠ **exactly two lines** — `UserIsland.tsx:61,75` (the web header greeting) | ⚠ `updateName()` — **which has never been called** |

**Invariant (new):** every write of the name writes **both**, in this order — **record first, Cognito second,
best-effort and logged**. Never fail the request on a Cognito error after the record is committed, or the
customer is told their save failed when it succeeded.

⚠ **Do NOT write `phone` to Cognito.** Writing `phone_number` would violate 034 FR-060a (an unverified phone
must never become an identity attribute), and `customer/phone-isolation.test.ts` scans for exactly this.

### The JIT upsert — unchanged, and already correct

`apis/edge-api/customer/src/customer/repo.ts:79-96` seeds the name from the token claims **once, on the
creating insert**, and never refreshes it on conflict. Guarded by `repo.guard.test.ts:63-74`.

Under name-last the creating insert simply carries `NULL, NULL` — which is what the new flow wants, and which
every surface already renders gracefully (`page.tsx:127` *"Add your name below"*, `UserIsland.tsx:61`
→ `"Account"`, `AccountScreens.kt:272` → `"Your account"`). **This guard must not be weakened.**

---

## 2. Ephemeral state — the sign-in machine

```
                    ┌──────────────────────────────────────────┐
                    │  IDENTIFIER  (step 1)                    │
                    │  field: email                            │
                    └───┬────────────┬──────────────┬──────────┘
       "Email me a code"│            │"Use a password"          │"Continue with Google"
                        ▼            ▼              ▼
              ┌───────────────┐  ┌──────────┐  ┌───────────────┐
              │     CODE      │  │ PASSWORD │  │ GOOGLE_PARKED │
              │  field: code  │  │ field:   │  │ (FR-039 msg)  │
              │  resend+timer │  │  password│  └───────┬───────┘
              └───┬───┬───┬───┘  └────┬──┬──┘          │ dismiss
     "Sign in" ok │   │   │ "wrong    │  │ "Forgot?"   ▼
                  │   │   │  email?"  │  └──────────► (existing reset journey)
                  │   │   └───────────┴──► IDENTIFIER  (email PRESERVED — FR-022)
                  │   │ 3rd refusal
                  │   └──────────────────► EXHAUSTED ──"Send a new code"──► CODE
                  ▼
               SUCCESS ──► return-to-intent, else Home  (FR-025)
```

**`SignInFlowState`** (web: React state on one route; mobile: fields on `AuthUiState`)

| Field | Type | Notes |
|---|---|---|
| `step` | `identifier \| password \| code \| exhausted` | ⚠ Web: mirrored into `history.pushState` so browser back moves a step (FR-022). |
| `email` | string | ⚠ **Never cleared by a step change.** Trimmed + lowercased before use — the rate-limit key is `HMAC(email)`, so `A@x.com` and `a@x.com` would otherwise count separately. |
| `code` | string | ⚠ Digits only, **never truncated** (FR-004). Submit gated on `length == OTP_LENGTH`. **Not cleared on refusal** (FR-010). |
| `maskedDestination` | string? | From `AuthStep.NeedsOtp.destination`. ⚠ Currently populated by both mobile drivers and then **discarded** by `AuthViewModel.drive` — wired through here (FR-006). |
| `attemptsUsed` | 0…3 | Client-side mirror of the server cap. Drives the `exhausted` transition. **Reset to 0 by a resend** — a resend starts a new Cognito session whose attempt list is empty (R4). |
| `sendsThisFlow` | 1…5 | ⚠ **The honesty counter (R11).** At 5, the resend control refuses locally instead of firing a request that silently sends nothing. |
| `resendAvailableAt` | timestamp? | `now + 30s` after every send. Web reuses `lib/otp-cooldown.ts` (`COOLDOWN_SECONDS = 30`, built, tested, **never called**). |
| `returnTo` | route? | ⚠ Mobile: `CustomerNavKey.SignIn.returnTo` is a live parameter **every call site passes as `null`** — this feature supplies it. |

### What must survive process death (iOS) — FR-022

⚠ Today `pendingEmail` / `pendingSeedPassword` / `pendingReturnTo` are plain `var`s on `AuthViewModel`
(`AuthScreens.kt:171-173`), outside the state object. An iOS process death on the code step loses the address
the code went to, and the screen cannot even say where to look. Moving them into `AuthUiState` is both the
Principle VI fix and the FR-022 fix.

**Not restorable, and that is correct:** the Cognito challenge session itself. On restore the flow re-enters at
`identifier` with the email pre-filled — never at a dead code step (R1: "a step must be re-entrant").

---

## 3. Ephemeral state — the sign-up machine

```
        ┌────────────────────────────────────┐
        │  IDENTIFIER  (step 1)              │   ⚠ NO NAME FIELD (FR-027)
        │  field: email                      │
        └──┬──────────────┬─────────────┬────┘
 "Email me  │              │"Set a       │"Continue with Google"
  a code"   │              │ password"   ▼
            │              ▼        GOOGLE_PARKED
            │        ┌──────────┐
            │        │ PASSWORD │  ⚠ ONE field + reveal. NO confirm (FR-030).
            │        │          │     Rule stated BEFORE typing, and it says 12 (FR-029).
            │        └────┬─────┘
            └─────────────┴──────────►  CODE  (the SAME step as sign-in — FR-031)
                                          │ confirmed
                                          ▼
                                   ⚠ account EXISTS · signed in (FR-034)
                                          │
                                    ensure record  ⚠ GET /me BEFORE PATCH
                                          ▼
                                   ┌──────────────┐
                                   │  NAME (last) │  first + last, REQUIRED (FR-035a)
                                   └──────┬───────┘
                                          ▼
                                   SUCCESS ──► Home / return-to-intent
                                          + merge guest cart & saved items (FR-037)
```

**`SignUpFlowState`** — as sign-in, plus:

| Field | Type | Notes |
|---|---|---|
| `route` | `otp \| password \| google` | Seeds `has_password` via `?route=` on the record-creating read. |
| `password` | string? | Only on the password route. ⚠ **Never trimmed.** |
| `accountExists` | boolean | True once the code is confirmed. Gates entry to `name`. |
| `recordEnsured` | boolean | ⚠ True once `GET /customer/v1/me` has returned. **The name step must not PATCH before this** — see below. |
| `givenName` / `familyName` | string | ≤ 60 chars each, matching `UpdateCustomerDTO`. |

### ⚠ The ordering hazard, and why `recordEnsured` exists

`customer-me-v1-patch.ts:126-135` maps `CustomerNotFoundError` → **`403 "this account cannot be used"`** — the
exact string a **barred** customer sees. A ninety-second-old account would be told its account is unusable.

The record is created only by `GET /customer/v1/me`. On mobile that is guaranteed —
`SessionState.Authenticated` is unreachable without it (`SessionManager.kt:97-102`). **On web it is not**:
`seed-actions.ts:37-50` has two silent exits (`if (!session) return` and `catch { }`). And ⚠ **the Google
callback never seeds at all** (`CallbackHandler.tsx:49-66` merges cart and saved items and nothing else) — a
latent guaranteed 403 the day Google un-parks.

**Rule:** the name step **reads before it writes**, every time, on every route. The read is an idempotent
create, so it costs one request and removes the failure class entirely.

---

## 4. State that is deliberately NOT modelled

| Not modelled | Why |
|---|---|
| **Why a code was refused** | The platform cannot tell us — wrong, expired, superseded and never-sent are indistinguishable by design (R10). Modelling a `reason` would invite a message we cannot support. |
| **Server-side "superseded"** | Supersession is a **client-side** property: a fresh `signIn()` overwrites the stored session, so the old code becomes unreachable *from the UI*. ⚠ It is **not** revoked server-side — a holder of the old `Session` string can still redeem it for its remaining TTL (R4). |
| **Time until the next code may be sent** | The trigger computes `retryAfterSeconds` and **discards it** (`issuance.ts:115-118`), deliberately, so the client cannot state a wait. |
| **Cross-device / cross-tab send count** | `sendsThisFlow` is per-flow only. A budget already spent elsewhere is invisible to us, and the UI must not pretend otherwise. |
| **A "profile incomplete" flag** | The name step is required *within the flow*, but a nameless account is a **valid, working account** (FR-035a). A persisted incompleteness marker would make it a defect, which it is not. |

---

## 5. Validation rules

| Field | Rule | Source |
|---|---|---|
| `email` | Non-empty, well-formed, **trimmed + lowercased** before any use | ⚠ The rate-limit key is `HMAC(email)`; casing would split the bucket |
| `code` | Digits only; **not truncated**; submit only at exactly `OTP_LENGTH` | FR-004/FR-005; `OTP_LENGTH = 6`, `policy.ts:25` |
| `password` | ≥ **12** characters, **no composition rules** | `PASSWORD_MIN_LENGTH`, `packages/shared-types/src/customer.ts:152`. ⚠ Three sites currently say 8 and are corrected (R8). |
| `givenName` / `familyName` | Required at the name step; trimmed; ≤ 60 | `UpdateCustomerDTO`; `customer-me-v1-patch.ts:78-90` |

⚠ **`OTP_LENGTH` is the only definition of "six" (FR-045).** It exists in two places, once per platform —
`policy.ts:25` (backend) and `packages/mobile-kit/common/ui/OtpInput.kt:30` (mobile). Web currently hardcodes
`maxLength={6}` as a literal in `otp-input.tsx:43`, and copy strings hardcode `"6-digit code"` in three mobile
files. Both are consolidated here.
