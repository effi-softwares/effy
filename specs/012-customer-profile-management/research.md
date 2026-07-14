# Research: Customer Profile Management (012)

**Date**: 2026-07-14 · **Feeds**: [plan.md](./plan.md) · [spec.md](./spec.md)

Two research passes ran before the spec was written (UI/UX standards; Cognito + Amplify mechanics). Both were
verified against **the installed packages in this repo** (`aws-amplify@6.18.0`, `@aws-amplify/auth@6.20.0`) and
against current AWS documentation — not from memory. What follows is what was decided, and what was rejected.

---

## R1 — Setting a first password: one atomic call, no grant

**Decision.** The step-up code is verified **and the password is set in the same backend request**:

```
POST /customer/v1/password   { mode: "set", code, newPassword }
  → VerifyUserAttribute(accessToken, "email", code)      ← consumes the code, proves the inbox
  → ChangePassword(accessToken, ProposedPassword)        ← NO PreviousPassword (the user has none)
  → GlobalSignOut(accessToken)                           ← FR-024
  → UPDATE customer SET has_password = true, password_updated_at = now()
```

**Rationale.** The obvious design is a two-step one: verify the code, mint a short-lived "step-up grant", let
the customer post a password against it. **That grant is a new thing to steal.** Doing both in one request means
there is no interval during which "this session may now set a password" exists as state anywhere — not in a
cookie, not in a token, not in a row. **FR-019 ("the authority MUST be short-lived and scoped to that
operation") is satisfied by construction**, which is strictly better than satisfying it with a TTL that someone
has to remember to enforce.

The UI still *feels* like two steps (ask for a code, then type it) — but the first step only **sends** the code.
It grants nothing.

**Why this is the whole feature.** From the [`ChangePassword` API reference](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ChangePassword.html):

> "The user's previous password is required **if the user has a password**. **If the user has no password** and
> only signs in with passwordless authentication options, **you can omit this parameter.**"

Restated: **Cognito will let any holder of a valid access token silently plant a permanent password on a
passwordless account.** A borrowed phone, a shared laptop, an XSS'd token — a *transient* foothold becomes
*durable, credentialed* access, and an OTP-only customer would never notice. This is the same class as the
[better-auth advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-qq9h-g4jm-xgf3). The
safety is **entirely ours to impose** — the platform will not do it for us.

**Rejected**: *allow the set from a bare session* (what Cognito permits) — an account-takeover primitive.
*A stored step-up grant* — a stealable credential, for no benefit.

---

## R2 — Step-up uses Cognito's attribute-verification code, not a home-grown one

**Decision.** `GetUserAttributeVerificationCode(accessToken, "email")` sends the code;
`VerifyUserAttribute(accessToken, "email", code)` consumes it. Both token-authorized; **no IAM**.

**Rationale.** It satisfies FR-018 *by type*: an attribute-verification code is a **different kind of code** from
a sign-in OTP, so a sign-in code cannot be replayed here and vice versa — the "single-purpose" requirement is
enforced by Cognito's own plumbing rather than by our discipline. Cognito also owns expiry, single-use, and rate
limiting (FR-020). Email delivery rides the pool's existing SES configuration, so it is branded by 010 for free.

Side effect: it re-sets `email_verified = true`. Our users are already verified, so this is a no-op.

**Rejected**: *a platform-owned code table* (generate → hash → store → send via SES → expire → rate-limit). It
is more code, a new table, a new SES send path, and a new set of ways to get expiry and single-use wrong — to
re-implement something the identity provider already does correctly.
*Reusing `resetPassword()` as the step-up* — it cannot verify identity **without also mutating the credential**
(`confirmResetPassword` requires a new password to consume the code), and it is an **unauthenticated** endpoint
keyed only on a username, so it proves nothing whatsoever about the current session.
*Re-running `signIn()`* — Amplify's `signIn()` calls `assertUserNotAuthenticated()` first and throws
`UserAlreadyAuthenticatedException` when a session exists. You would have to destroy the session you are trying
to protect.

---

## R3 — Sign-out is server-side; Amplify never touches the client

**Decision.** A Server Action (a) calls Cognito `GlobalSignOut` / `RevokeToken` with the customer's token and
(b) **deletes every `CognitoIdentityServiceProvider.<clientId>.*` cookie** from the jar, then redirects to a
public page.

**Rationale.** Forced by a fact, then vindicated by it. **`aws-amplify/auth/server` has no `signOut`** — verified
against the installed package, whose server entry point re-exports exactly:

```
@aws-amplify/auth/dist/esm/providers/cognito/apis/server/index.d.ts
  export { fetchUserAttributes } from './fetchUserAttributes';
  export { getCurrentUser }      from './getCurrentUser';
```

…plus `fetchAuthSession` from core. That is the entire server-side auth surface. There is no server `signOut` to
call.

The alternative is the client `signOut()` from `aws-amplify/auth` — which imports the SDK into a component the
storefront renders on **every page**, blowing both the 160 KB guest budget and 011's `depcruise` quarantine
(which uses `reachable: true` **specifically** to catch a leak that arrives through a component rather than a
direct import — that lesson is 011 research D11, and it is exactly the trap here).

We already parse those cookie names in `lib/session.ts`, so deleting them is not a hack — it is the same
contract, read in the other direction. **Guests keep downloading zero bytes of auth SDK.**

**Rejected**: *client-side `signOut()`* — breaks the quarantine and the budget. *A `/sign-out` page inside
`(auth)/`* — legal under the quarantine and it would work, but it costs a full navigation and an SDK download
to do what one Server Action does for free.

---

## R4 — Cognito is called with the **customer's** token, so the slice adds almost no IAM

**Decision.** `ChangePassword`, `GetUserAttributeVerificationCode`, `VerifyUserAttribute` and `GlobalSignOut` are
invoked from the Lambda **using the caller's access token**. The only new IAM statement in this slice is
`ses:SendEmail`.

**Rationale.** AWS is explicit that these are token-authorized: *"Amazon Cognito doesn't evaluate IAM policies in
requests for this API operation."* So the backend needs **no `cognito-idp:*` permission at all** to perform them —
it is relaying the customer's own authority, not exercising its own. That is a meaningfully smaller blast radius
than 009's shop provisioning (which genuinely needed `AdminCreateUser`), and it means a compromised customer
Lambda cannot touch an account whose token it does not hold.

**Rejected**: **`AdminSetUserPassword`** — works, but it makes the *backend* the authorizer of a credential change
rather than a relay of the customer's own. A bug in that authorization check is an account-takeover primitive of
exactly the kind this whole slice exists to eliminate. AWS also explicitly advises against setting passwords on
federated profiles. It stays available as an operator break-glass and nothing more.
**`ADMIN_USER_PASSWORD_AUTH`** to verify a current password — would mean enabling a plaintext-password auth flow
the module deliberately does not offer. `ChangePassword` verifies `PreviousPassword` server-side already; there
is nothing to gain and a flow to regret.

---

## R5 — `has_password` is a platform-owned column, because Cognito cannot be asked

**Decision.** `public.customer.has_password boolean NOT NULL DEFAULT false`, maintained by the platform.

**Rationale.** **There is no Cognito API that answers "does this user have a password?"** `AdminGetUser` does not
return it, and `UserStatus` does not distinguish it — a passwordless `CONFIRMED` user and an email+password
`CONFIRMED` user are **identical** on the wire. So the record must know, in exactly the sense it already knows
`status` (011 FR-025: platform-owned, never written from token data).

Which forces a consequence worth stating plainly: **every path that establishes a password must go through the
platform**, or the record silently goes wrong. That is precisely why **FR-022b pulls account recovery into scope**
(R6) — recovery sets a password, and today it does so entirely client-side, where the platform never learns of it.

**The seeding problem, and why the answer is safe.** At *registration* the platform gets no signal either: sign-up
happens client-side against Cognito, and the JIT upsert on the first `/customer/v1/me` sees only a token. So the
sign-up form **declares** the route it took, and the record is seeded from that declaration.

That declaration is **client-asserted and therefore untrusted** — so it is worth being precise about why it is
nonetheless safe, because "untrusted input decides a security-adjacent flag" deserves an argument, not a shrug:

- **Lying "I have a password" (when you don't)** → the page offers *Change password*, which requires a current
  password you do not have. Cognito refuses. You are stuck, and you fix it via recovery. **You gained nothing.**
- **Lying "I have no password" (when you do)** → the page offers *Set a password*, which requires **a fresh code
  sent to the account's verified email**. Anyone who can read that inbox **can already reset the password via
  recovery**. **You gained nothing.**

In both directions the declaration grants **no capability the email-holder did not already have**. It is a **UX
hint, not an authorization input** — and the platform's own writes (set · change · recovery-confirm) are
authoritative from that moment on. This distinction is the same one the constitution already draws: *the claim is
the origin, the record is the authority*.

**Rejected**: *inferring from the credential route used at sign-in* — a Google-linked customer **can** hold a
native password (they are a *linked local* user, not an `EXTERNAL_PROVIDER` user), so "signed in with Google" says
nothing about whether a password exists. Inferring here would show the wrong control to a real cohort. **FR-014
therefore branches on `has_password`, never on "how did you sign in".**

---

## R6 — Account recovery is pulled into scope, because it was a bypass

**Decision.** `confirmResetPassword` moves **behind the backend**: a new **public** (unauthenticated) route
`POST /customer/v1/password/reset-confirm` runs the password rules, calls Cognito `ConfirmForgotPassword`, and
updates `has_password`.

**Rationale.** Two independent defects, one fix:

1. **FR-022 was bypassable.** Breach screening enforced on the account page and not on "Forgot password?" is not a
   rule — it is a detour sign. The recovery page sets a password too.
2. **FR-013 was corruptible.** Recovery is a client-side Amplify call today; the platform never learns a password
   now exists, so `has_password` silently goes stale and the account page offers the wrong control forever after.

`ConfirmForgotPassword` is an **unauthenticated** Cognito API (no IAM, no token), so the Lambda can call it on the
customer's behalf without holding any privilege at all. The route is public for the same reason the Cognito API is:
the caller has no session yet — they are proving the inbox instead.

**This is a deliberate scope addition**, recorded in the spec (FR-022b + Scope) rather than smuggled into the plan.

**Rejected**: *leave recovery alone and accept the gap* — it defeats the one control the product owner explicitly
chose to pay for.

---

## R7 — Revocation is **not** instant, and we say so

**Decision.** After a password set/change: `GlobalSignOut` → clear cookies → return the customer to sign-in.
**FR-024a's "bounded window" is stated as: up to the ID-token lifetime, currently 60 minutes.**

**Rationale.** Two facts that most systems ship without noticing:

1. **Cognito's revocation is all-or-nothing.** `GlobalSignOut` revokes *every* refresh token for the user,
   **including the current device's**. There is no "revoke all except this one", and the other devices' refresh
   tokens cannot be enumerated in order to be revoked selectively. **This is why the spec's FR-024 was amended
   during planning** — the original "preserve the current session" was not expressible, and the honest response was
   to make the requirement *stronger* (everything goes) rather than quietly weaker (nothing goes, ghost sessions
   forever).
2. **Revocation does not invalidate already-issued tokens at our gateway.** AWS: *"revoked tokens will still be
   valid if they are verified using any JWT library that verifies the signature and expiration of the token."* Our
   API Gateway **JWT authorizer does exactly that** — it checks signature and expiry, and knows nothing of
   revocation. So a revoked session's token keeps opening `/customer/v1/*` **until it expires**.

Current pool config (`infra/modules/cognito-user-pool/variables.tf`): `id_token_validity = 60` minutes,
`access_token_validity = 60` minutes, `refresh_token_validity = 30` days. **So the residual window is up to 60
minutes**, and the customer must not be told otherwise.

**Recommendation (not taken in this slice, deliberately)**: shortening the customer pool's token lifetimes to ~15
minutes would cut the window 4×. It is **not** free: under SSR, a token that expires mid-render cannot be
refreshed from a React Server Component (cookies are not writable there), so a shorter TTL pushes refresh churn
into Server Actions and route handlers and risks a refresh loop. That is its own slice, with its own testing.
**Recorded here so the number is a decision, not an accident.**

---

## R8 — Password policy: 12 characters, no composition rules, breach-screened, fail-closed

**Decision.** Cognito pool policy → `minimum_length = 12`, `require_lowercase/uppercase/numbers/symbols = false`.
Breach screening in the Lambda via the **k-anonymity range API** (SHA-1 the password, send the **first 5 hex
characters only**, match suffixes locally). **The password never leaves the process.** Send `Add-Padding: true`
to defeat response-size analysis. On breach-service failure: **fail closed** — refuse, and say why.

**Rationale.** Current NIST guidance (SP 800-63B-4): **no composition rules**, **no scheduled expiry**, **do**
screen against breached-password lists — the composition rules the pool enforces today ("1 upper, 1 lower, 1
number") are now considered *harmful*, because they push users toward `Password1!` and buy nothing. The product
owner chose **12** over NIST's 15 (a conversion trade-off; see spec Clarifications), and that choice is only
defensible **while breach screening and rate limiting both hold** — if either is ever dropped, the floor must be
revisited. That conditional is written into the spec's Assumptions on purpose.

**Fail closed** is affordable here specifically because **passwords are optional on Effy**: a customer blocked by a
breach-service outage can still sign in with an emailed code, which is the safer route anyway. On a
password-mandatory product this call would go the other way.

**Infra note**: `password_policy` is an **in-place update** on `aws_cognito_user_pool` (not ForceNew), and the pool
carries `prevent_destroy`. **Read the plan anyway; abort on any `-/+`** — a replaced pool destroys every account on
the platform.

**Also required**: the current error string in `app/(auth)/_lib/auth-actions.ts` promises *"at least 8 characters
with upper and lower case letters and a number"*. It becomes a lie the moment the policy changes, and must be
updated in the same commit.

---

## R9 — The breach check is **backend-only**; the browser gets the length rule and nothing else

> **⚠ CORRECTED during implementation (2026-07-14).** This entry originally proposed one shared module,
> `@effy/edge-shared/password`, imported by **both** the Lambda and the storefront's recovery page. That was
> wrong on two counts, and building it would have been worse than the thing it was trying to prevent.

**Decision.**

- **`@effy/shared-types`** → `PASSWORD_MIN_LENGTH = 12` + a pure `checkPasswordPolicy()`. No crypto, no network.
  Safe in the browser **and** the Lambda. This is what gives the customer instant "too short" feedback.
- **`@effy/edge-shared`** → `src/password/breach.ts`, the k-anonymity check. **Backend only. It never ships to a
  browser.**

**What the original entry got wrong.**

1. **The browser never needed it.** T035 routes the recovery page **through the backend**
   (`POST /customer/v1/password/reset-confirm`), precisely so the screening cannot be bypassed. Once that is
   true, the *only* consumer of the breach check is the Lambda. The shared module was solving a problem the
   design had already removed.
2. **`@effy/edge-shared` is not importable from Next.js without lying about what it is.** It lives at
   `apis/edge-api/shared` and declares `pg` and `pino` as **dependencies**. A subpath export could dodge them at
   *bundle* time, but it would still make the storefront depend on the cold-path database library — an
   architectural inversion that a future reader would rightly assume was a mistake, because it is one.

**And the corrected shape is strictly safer.** A breach check that runs *only* on the server **cannot be
skipped by a hostile client**. The original design would have run it in the browser too — where it is a
courtesy, not a control, and where a crafted request simply ignores it. Enforcement belongs on the server; the
client gets a hint. Principle II is still satisfied: the **length rule** has exactly one definition
(`@effy/shared-types`), and the **breach rule** has exactly one definition (`@effy/edge-shared`). Neither is
copy-pasted; they simply live where they are enforced.

**Rejected**: *the original shared-module plan* — solved a need that no longer existed, and would have coupled
the public storefront to the backend's database library to do it.

---

## R10 — The initials avatar

**Decision.** At most **two** initials (first + last). One word → **one** initial, never two letters from one word.
Extract the leading **grapheme** via `Intl.Segmenter` (`granularity: 'grapheme'`) — **not** `str[0]`, which splits
surrogate pairs and mangles combining marks. Uppercase with `toLocaleUpperCase()`. **Fall back to a neutral person
glyph** for: no name, a leading character that is not a letter (emoji, digit, punctuation), or a non-Latin script.
Colour: **one** brand-token pair for every customer — no per-user hashed palette.

**Rationale.** The failure modes here are all *other people's names*. A single CJK character or an Arabic glyph is
not an "initial" and reads as noise; guessing a letter from the email address is worse (it shows a stranger's
initial to someone whose name we simply do not have). `str[0]` on "👨‍👩‍👧 Smith" produces a broken half-emoji.
`toUpperCase()` on a Turkish dotless *ı* produces the wrong letter. Every one of these is avoidable by refusing to
be clever.

A hashed multi-colour palette is a **contrast liability for zero benefit**: a customer only ever sees their **own**
avatar (there is no roster, no comments, no multi-user view anywhere in this surface), so colour variety
distinguishes nothing while forcing every generated hue to be contrast-checked in light *and* dark. One
brand-token pair, checked once. If the colour were keyed on anything, it would be keyed on the **stable id**, never
the name — or it would change when the customer edits their name (FR-004).

**Accessibility**: beside a visible name → `aria-hidden="true"` (or the screen reader announces the name twice).
Standalone (the header menu trigger) → `role="img"` + `aria-label="<name>"`, and **not** the word "avatar" — the
role already says it.

---

## R11 — The name change must reach the header, and the header reads the **token**

**Decision.** `updateProfile` writes the record **and** the Cognito attributes (`given_name`/`family_name`, via
token-authorized `UpdateUserAttributes`), then calls `fetchAuthSession({ forceRefresh: true })` **inside the Server
Action** to mint a fresh ID token and rewrite the cookie, then `revalidatePath("/")`.

**Rationale.** This is a real bug hiding in an innocuous requirement. `lib/session.ts` reads the header greeting
from the **ID token's `given_name` claim** — deliberately, because that is what lets a signed-in customer's name
render with **zero** backend calls on a cached page. But it means a name changed **only** in the database **does not
appear in the header** until the token happens to refresh (up to 60 minutes, per R7). FR-008 and FR-012 both fail,
silently, and only in production.

A Server Action **can** write cookies (unlike a React Server Component), which is what makes the forced refresh
possible at all.

**Risk (S4)**: that Amplify's SSR cookie adapter actually persists the refreshed tokens from within a Server Action
is **plausible but unproven** → spike. **Fallback**: the header island reads the name from the platform record
instead of the token — unambiguously correct, but it adds a Lambda + DB round trip to **every signed-in page
render**, which is precisely the cost the token-claim design was chosen to avoid. Take the fallback only if the
spike fails.

---

## R12 — Access token in, `sub` checked

**Decision.** The gateway keeps authorizing the **ID token** (`Authorization: Bearer <id>`, unchanged — the
authorizer's `audience = [client_id]` is configured for it and it works today). The **access token** rides a second
header. The Lambda **rejects any request where the access token's `sub` ≠ the `sub` the authorizer verified.**

**Rationale.** Cognito's token-authorized APIs need the *access* token; our gateway is wired for the *ID* token.
Sending both is the pragmatic answer — but naively trusting the second one creates a **mismatched-pair** bug:
present a victim's ID token (which the authorizer verifies, and which selects the victim's **database row**) with
your **own** access token (which selects **your** Cognito user), and the platform updates *the victim's record* to
say a password exists while setting *your* password. Not a takeover — but a corrupted record that leaves the victim
holding the wrong control forever.

The `sub` equality check is one comparison and it closes the whole class. It is in the contract as a **MUST**, not a
nicety.

**Not attempted**: reconfiguring the gateway to authorize access tokens. Cognito access tokens carry `client_id`
rather than `aud`, and whether the HTTP API JWT authorizer accepts them under an `audience` configuration is exactly
the sort of thing that is easy to *believe* and expensive to be wrong about. The dual-token approach needs no infra
change and no assumption.

**Google caveat (parked, but binding the day it is un-parked)**: tokens minted through the hosted-UI OAuth flow carry
**only the scopes the app client allows**. If `aws.cognito.signin.user.admin` is not in `AllowedOAuthScopes`, then
`ChangePassword`, `UpdateUserAttributes` and `GlobalSignOut` **all fail for the Google cohort specifically** —
invisibly, until the first Google customer tries to edit their profile. Folded into 011's **T052**.

---

## Sources

Cognito: [ChangePassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ChangePassword.html) ·
[SignUp](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignUp.html) ·
[ForgotPassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ForgotPassword.html) ·
[AdminSetUserPassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserPassword.html) ·
[Authentication flows (passwordless)](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html) ·
[Linking federated users](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-federation-consolidate-users.html) ·
[Token revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)

Standards: [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) ·
[OWASP Authentication CS](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) ·
[OWASP Session Management CS](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) ·
[WCAG 2.2 SC 3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)

UX: [Baymard — accounts & self-service](https://baymard.com/blog/current-state-accounts-selfservice) ·
[GOV.UK password input](https://design-system.service.gov.uk/components/password-input/) (why there is **no**
confirm-password field) · [GitHub sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode)
(the step-up precedent — and note it accepts an **emailed code** as the factor for a user with no password, which
is exactly our case) · [web.dev sign-out](https://web.dev/articles/sign-out-best-practices)

In-repo, verified directly: `@aws-amplify/auth@6.20.0` server exports (no `signOut`); `updatePassword.mjs`
(asserts a non-empty `oldPassword` **client-side**, so Amplify **cannot express** the set-first-password call at
all — R1's call must be made by the backend); `infra/modules/cognito-user-pool/` (token TTLs, auth flows, password
policy); `apps/customer-web/.dependency-cruiser.cjs` (the `reachable: true` quarantine); `scripts/bundle-budget.mjs`
(the 160 KB guest limit).
