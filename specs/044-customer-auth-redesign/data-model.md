# Data Model — 044 Customer Storefront Authentication Redesign

**Phase 1 output.**

## There is no persisted data in this feature

No table is created, altered or dropped. **No Goose migration is written**, and `make db-up` is not
part of this slice's operator steps. No DTO changes shape, no request or response body changes, and no
Cognito attribute is read or written that is not already read or written today.

That is worth stating rather than leaving to inference: every slice in this platform since 019 has
carried a migration, and the absence of one here is a deliberate property of a presentation slice, not
an oversight. If a task in `tasks.md` turns out to need one, the plan is wrong and must be revisited
(Principle I).

The only backend file this slice touches — `apis/edge-api/customer/src/newsletter/service.ts` — has
two locally-declared constants replaced by an import of the same values from the shared package. It
stores nothing new and its stored shapes are untouched.

---

## Transient client state (the whole model)

All of it lives for as long as a screen is open and is discarded on navigation. None of it is server
data, so Principle VI's prohibition on hand-caching server state in components is not engaged.

### 1. `FieldState` — per input, per screen

The state that makes FR-011 through FR-014 possible. One of these exists for each of: `email`,
`password`, `given-name`, `family-name`. **The code field is deliberately not one of them** — its
validity is structural (exactly six digits) and is derived, not tracked.

| Field | Meaning | Notes |
|---|---|---|
| `value` | what the customer has typed | already exists today; trimmed at the boundary (FR-015) |
| `touched` | whether the customer has entered something **and then left the field** | an untouched field must never show an error (FR-011). Focus alone does not set it — arriving in a field and tabbing straight out is not a mistake worth shouting about |
| `error` | the message to show, or none | **derived from `value` on demand, never stored as a second source of truth**. Storing it invites the state where the value is corrected and the message is stale — which is precisely the bug FR-013 names |
| `submitted` | whether the form has been submitted at least once | after a submission every field validates regardless of `touched`, so a field the customer never entered still reports that it is required |

**Visibility rule** (one rule, not four): a message is shown when `error` is present **and**
(`touched` **or** `submitted`).

### 2. `ValidationRule` — the vocabulary

A closed set. Adding a fifth rule is a spec change, not an implementation detail.

| Rule | Applies to | Refuses | Message intent |
|---|---|---|---|
| `required` | every field | empty after trimming — **whitespace-only is empty** (FR-015, D-12) | name the thing that is missing |
| `emailShape` | email | anything failing the platform's shared rule, or over the shared length ceiling | say the address does not look right — **never** say whether it exists (FR-044) |
| `minLength` | password | fewer than `PASSWORD_MIN_LENGTH` characters | state the rule; it is also stated before typing (FR-016) |
| `codeLength` | the code field (derived) | not exactly `OTP_LENGTH` digits | for a **longer** value, say how many were entered and how many an Effy code has (FR-004) |

**Ordering matters and is fixed**: `required` is evaluated before any shape rule, so an empty field
never reports a format problem it does not have.

### 3. `CodeFieldView` — derived, not stored

What the rebuilt control renders. Computed from the input's value on every render; nothing is held.

| Derived value | Definition |
|---|---|
| `cells` | exactly `OTP_LENGTH` entries; entry *i* holds `value[i]` or nothing |
| `activeIndex` | `min(value.length, OTP_LENGTH - 1)`, indicated **only while the input has focus** (FR-006) |
| `overflowing` | `value.length > OTP_LENGTH` — collapses the control to its plain rendering so a long paste cannot *look* like a six-digit code (FR-004) |
| `invalid` | driven by the caller's `aria-invalid`; paints the cells themselves, not just the message (FR-007) |

### 4. `InterruptionReason` — a closed vocabulary read from the URL

| Value | Rendered as |
|---|---|
| `password-changed` | an informational notice: the password was changed and signing in again is expected (FR-034) |
| anything else, including absent | **nothing** |

⚠ **This value is attacker-controlled.** It arrives in a query string, so it selects a message from a
fixed map and is **never echoed into the page**. Rendering it — or any substring of it — would let
anyone place arbitrary text on the one screen where a shopper is about to type a credential. The same
discipline `safeNextTarget` already applies to `next`.

Two places in the product already produce this value and nothing reads it
(`app/(account)/account/actions.ts` and `ResetPasswordForm`); this slice adds the reader, not the
producer.

---

## State that already exists and is not changed

Listed so a reader can see the boundary of this slice:

- The step position and its history entry (`_lib/step-history.ts`) — unchanged.
- `challengeLive` / `accountExists` / `codeSent` guards — unchanged.
- Resend cooldown and the per-flow send ceiling (`_lib/use-code-resend.ts`, `lib/otp-cooldown.ts`) —
  unchanged.
- The Amplify session and every in-flight challenge — unchanged.
- Cart and saved-list merge on sign-in — unchanged.

## Validation rules traced to requirements

| Requirement | Where it lands in this model |
|---|---|
| FR-009 validate before advancing | the submit path evaluates every field's rules before any platform call |
| FR-010 stricter than the browser | `emailShape`, sourced from the shared package (one rule, two consumers) |
| FR-011 on blur and on submit | `touched` and `submitted` |
| FR-012 beside the field | `error` renders in the shared field primitive's error slot |
| FR-013 clears on correction | `error` is derived, so correction clears it with no extra step |
| FR-014 focus the first problem | the submit path walks fields in DOM order and focuses the first with an `error` |
| FR-015 trim; whitespace is empty | trimming happens at the validation and submission boundary |
| FR-016 reflect the password rule | `minLength`, evaluated live rather than only at submit |
| FR-017 one error region | journey-level messages are passed **into** the step and rendered in its single region |
| FR-034 explain the interruption | `InterruptionReason` |
| FR-044 no enumeration | `emailShape` refuses **malformed**; nothing refuses **unknown** |
