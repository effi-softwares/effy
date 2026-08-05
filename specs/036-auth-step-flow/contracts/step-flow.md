# Contract: The Step Machines, Screen by Screen (036)

**Date**: 2026-08-05 · **Plan**: [../plan.md](../plan.md)

Binding on **both** customer surfaces. Same steps, same order, same decisions (FR-044). Where a surface
legitimately differs — routing mechanism, back gesture — it is called out.

**Mechanism reminder** (R1/R2): web = **one route per journey**, steps as client state, `history.pushState` for
back. Mobile = **one Nav3 route per step**.

---

## SIGN-IN

### S1 · Identifier — `/sign-in` · `CustomerNavKey.SignIn`

| Element | Detail | FR |
|---|---|---|
| Title | see [copy.md](copy.md) | — |
| Email field | `type=email`, `autocomplete="username"` ⚠ (not just `email` — managers key on `username`), autofocus | FR-016 |
| **Primary** | *Email me a code* | FR-016 |
| Divider + **Google** | mark + label, below the primary | FR-038 |
| **Secondary link** | *Use a password instead* → **S2** | FR-017 |
| Footer | *Don't have an account? Join* → sign-up, `next` preserved | FR-021 |

Exits: S2 · S3 · Google (S0) · sign-up.

### S2 · Password

| Element | Detail | FR |
|---|---|---|
| Email | ⚠ **Displayed, not re-asked.** Web additionally keeps a hidden `autocomplete="username"` input in the same `<form>` as the password | FR-018, FR-023 |
| Password field | `autocomplete="current-password"`, **reveal toggle**, paste permitted | FR-023 |
| **Primary** | *Sign in* | — |
| Link | *Forgot your password?* → existing reset journey | FR-019 |
| Link | *Email me a code instead* → **S3** (no retyping) | FR-020 |
| Back | → S1, **email intact** | FR-022 |

⚠ **Web must keep the email input mounted in the same `<form>`** (hidden after step 1) — that is the whole
password-manager fix, and it is why steps are not separate routes (R1).

### S3 · Code — ⚠ THE SHARED STEP

Identical component in sign-in, sign-up and password reset (FR-001, FR-031).

| Element | Detail | FR |
|---|---|---|
| Destination line | *We sent a code to `a•••@example.com`* — from `AuthStep.NeedsOtp.destination` | FR-006 |
| **Code field** | ONE labelled field, six visible positions, `inputmode=numeric`, `autocomplete="one-time-code"`, `dir="ltr"`. ⚠ Digits only, **never truncated**; over-length stays visible and blocks submit | FR-002, FR-003, FR-004 |
| **Primary — at the BOTTOM** | *Sign in*. Enabled only at exactly 6 digits. ⚠ **No auto-submit** | FR-005 |
| Resend | Disabled 30 s; live countdown; `aria-live="polite"` / Compose `liveRegion` | FR-007, FR-015 |
| Resend confirmation | ⚠ Must point at the **newest** email | FR-008 |
| ⚠ Send ceiling | At `sendsThisFlow == 5` the control refuses **locally** rather than firing a no-op | FR-009 |
| Refusal | Inline, `#e01010` destructive token, ⚠ **input NOT cleared** | FR-010 |
| Link | *Wrong email?* → S1, **email intact** | FR-014 |
| Back | → S1 | FR-022 |

**Transitions — and this is the repair (R9):**

| Observed | Meaning | Action |
|---|---|---|
| step is `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` **again** | ⚠ Wrong/expired code, attempt 1 or 2. **No exception is thrown.** | `attemptsUsed++`, show the refusal, **STAY**. ⚠ Today web calls `done()` here and navigates a signed-out shopper away. |
| `DONE` / `isSignedIn` | Accepted | → S5 |
| `NotAuthorizedException` | Allowance spent (or an unknown address — indistinguishable, FR-011) | → S4 |
| `SignInException` (Amplify) | ⚠ The 3-minute client store expired (R1) | → S1, *"your sign-in timed out"*, email intact |
| `ForbiddenException` | ⚠ WAF IP rate limit — **unhandled on every surface today** | Specific message; do **not** fall through to the generic default |

### S4 · Exhausted

Not a modal, not a toast — a **step**, because the session is genuinely over.

- States that the attempt is finished, without claiming why (FR-011).
- **One** action: *Send a new code* → issues a fresh code, resets `attemptsUsed`, → S3. ⚠ Consumes one of the
  five hourly sends (FR-013, SC-019).
- Secondary: *Use a different email* → S1.

### S5 · Success

`returnTo` if present, else **Home** (FR-025). Then merge guest cart + saved items.

⚠ **Mobile**: `completeSignIn` must call `navigator.resetToRoot()` **first**, then `selectTab(Home)` — never
`resetTo(Home)`, which plants Home as the *Account* tab's root and is a bug `CustomerNavState.kt:151` actively
`require`s against and `CustomerNavStateTest.kt:33,46` pins.

### S0 · Google (parked)

Visible on S1 (FR-038). Choosing it shows a specific *"not available yet, use the code"* message and returns to
S1 (FR-039). ⚠ **No `signInWithRedirect` call** — there is no hosted domain, and calling it produces the
generic failure FR-039 forbids. Un-parking must not move or reword the control (FR-040).

---

## SIGN-UP

### U1 · Identifier — `/sign-up` · `CustomerNavKey.SignUp`

⚠ **No name field** (FR-027). Otherwise identical in shape to S1: email + *Email me a code* + Google +
*Set a password instead* → **U2** + footer *Already have an account? Sign in* (FR-036).

### U2 · Password

| Element | Detail | FR |
|---|---|---|
| Email | ⚠ Displayed, not re-asked (hidden `username` input on web) | FR-028 |
| Password | `autocomplete="new-password"`, **reveal toggle**, paste permitted | FR-030 |
| ⚠ Confirm password | **REMOVED** — the reveal replaces it (012 FR-023) | FR-030 |
| Rule, stated **before** typing | *At least 12 characters. Use anything you like — no special characters required.* ⚠ Three sites say 8 today | FR-029 |
| **Primary** | *Create account* | — |

### U3 · Code

⚠ **The same component as S3** (FR-031). Two behavioural differences, both because this is Cognito's *managed*
flow, not our custom challenge:

- Resend is `resendSignUpCode({ username })` — ⚠ **called nowhere in the repo today**; no surface can resend a
  sign-up code.
- Refusals **are** distinguishable here: `CodeMismatchException` ≠ `ExpiredCodeException` ≠
  `LimitExceededException`. The message **must** say which (FR-011).
- ⚠ Does **not** consume the 5/hour custom-challenge budget.

⚠ **SPIKE-2 gates what follows U3.** If `autoSignIn` issues a second challenge, the sequence becomes
`U1 → U3 → U3' → U4` and the design changes.

### U4 · Name — the last step, every route

| Element | Detail | FR |
|---|---|---|
| Precondition | ⚠ Already signed in; **`GET /customer/v1/me` has returned** | FR-034, `recordEnsured` |
| Fields | First name, Last name — both required, ≤ 60, trimmed | FR-033, FR-035a |
| **Primary** | *Finish* → `PATCH /customer/v1/me` via the **existing** `updateProfile` action / use case | FR-035 |
| No skip | Required — but abandoning must **never lock out**; re-ask on next arrival | FR-035a |
| After write | Web: force token refresh (which becomes real once `updateName` is wired). Mobile: `SessionManager.refreshRecord()` | FR-035 |

⚠ **Reached from Google too**, once un-parked — which is why `CallbackHandler` must seed the record now
(otherwise a guaranteed 403 with the *barred* wording).

### U5 · Success

Home / `returnTo`, **and merge the guest cart + saved items** (FR-037). ⚠ Sign-up does **not** merge today
while sign-in does — a live gap this closes.

---

## PASSWORD RESET (entry point moves; journey unchanged)

Reached from **S2** only (FR-019). It adopts **S3**'s code component (FR-001) and gains resend by re-calling
`resetPassword`. Its `minLength={8}` becomes 12 (R8). Everything else — the server-side confirm that preserves
breach screening and `has_password` (012 FR-022b) — is untouched.

---

## Cross-cutting

| Rule | Both surfaces | FR |
|---|---|---|
| Step legibility | Every step states where it is and that back exists | FR-043 |
| Back | Web: `popstate`. Mobile: gesture + `EffyBackArrow`. ⚠ **Never loses a typed value** | FR-022 |
| Re-entrancy | Arriving at a step whose session is spent → step 1, email intact — never a dead form | FR-022, R1 |
| Existence disclosure | Unknown and known addresses produce **identical** screens and wording | FR-024, SC-012 |
| Visual language | No new token, no new colour. Existing type, spacing, radius | FR-041 |
| Touch targets | ≥ 48 dp/px on every control | FR-042 |
| Email normalisation | Trim + lowercase before every use | ⚠ `HMAC(email)` is the rate-limit key |
