# Phase 0 Research — Platform-Wide Six-Digit One-Time Codes

**Feature**: 035-six-digit-otp · **Date**: 2026-08-03

Every decision below is sourced from official AWS/Amplify documentation or from this repository. Where
the documentation is **silent**, that is stated and a **blocking spike** is named rather than a guess
being made. This slice is authentication: an assumption that turns out false does not degrade a
feature, it locks people out of the platform.

---

## R0 — The premise, re-verified. And what "not configurable" actually rests on

**Decision**: Proceed on the basis that managed `EMAIL_OTP` emits 8 digits and cannot be configured —
**but gate all work behind an operator measurement (FR-037)**.

**Rationale**: Re-checked against the user pool schema, `SignInPolicyType`, `EmailMfaConfigType` (which
has exactly two fields, `Message` and `Subject`), the message templates, managed-login branding, and
the Terraform AWS provider resource schema. No length knob exists on any of them. The AWS Amplify
service team closed the standing request as a Cognito-side limitation
([amplify-js#14428](https://github.com/aws-amplify/amplify-js/issues/14428), 2025-09-02).

⚠ **But the "8 digits" fact appears in NO official AWS document.** The Cognito developer guide says
only "Amazon Cognito then generates a one-time password (OTP)". The claim rests on Amplify engineers'
public statements, AWS re:Post, and this platform's own observation. That is exactly the shape of
assumption that produced 029's contract test pinning a payload no banner ever emitted. **T001 measures
it before anything is built.**

**Alternatives considered and rejected**:
- **Custom Email Sender trigger** — *structurally impossible*. The trigger receives the code Cognito
  already generated and its documented response contract is *"Amazon Cognito doesn't expect any
  additional return information"*. There is no field to hand back a replacement, and Cognito still
  verifies against its own stored value. Emailing our own code would lock out every user.
- **Custom Message trigger** — the response *"must include the `codeParameter` value that you
  received"*. Prose is editable; digits are not.
- **A new AWS feature** — searched release notes through 2026. None.

---

## R1 — ⚠ Where the code lives between Create and Verify. This is the central design fact

**Decision**: The code is carried as a **keyed hash in `challengeMetadata`**, plus an issued-at
timestamp. **No external store holds the code.**

**Rationale**: `privateChallengeParameters` is set by `CreateAuthChallenge` and read by
`VerifyAuthChallengeResponse`, and is never client-visible (the `InitiateAuth` /
`RespondToAuthChallenge` response schemas carry only `ChallengeParameters`, which is
`publicChallengeParameters`). **But it does not persist across attempts.** When the user answers
wrongly and `DefineAuthChallenge` re-issues `CUSTOM_CHALLENGE`, `CreateAuthChallenge` is invoked
**again with an empty response object** — its request schema has no `privateChallengeParameters` field
at all. The only channel that survives from one `CreateAuthChallenge` invocation to the next is
`request.session[].challengeMetadata`.

So a 3-attempt flow that does not re-send an email on every attempt **must** round-trip something
through `challengeMetadata`.

⚠ **The AWS-authored sample puts the CLEARTEXT code there**
([aws-samples/amazon-cognito-passwordless-email-auth](https://github.com/aws-samples/amazon-cognito-passwordless-email-auth),
`challengeMetadata = \`CODE-${secretLoginCode}\``). **We do not**, for two reasons: FR-014 requires
hash-only storage, and `challengeMetadata` round-trips through the client's `Session` string. The
response schema shows no `ChallengeMetadata` field and the `Session` value decodes to an
AWS-Encryption-SDK/KMS envelope — but **no AWS page states as a positive fact that
`challengeMetadata` is withheld from the client**. Designing so the answer does not matter is free;
depending on it is not.

**Therefore**: `challengeMetadata = "v1:" + issuedAtEpochSeconds + ":" + hmacSha256(code, key)`. The
verify trigger recomputes the HMAC over `challengeAnswer` and compares in constant time. A leak of
`challengeMetadata` would expose a keyed hash of a 5-minute, 3-attempt secret — not the secret.

**Alternatives considered**:
- *Cleartext in `challengeMetadata`* — rejected (above).
- *Store the code in a database, keyed by auth session* — rejected as unnecessary; adds a round trip
  to the tightest budget in the slice (R6) to solve a problem `challengeMetadata` already solves.
- *Re-send a new code on every attempt* — rejected: it makes a typo cost a new email, guarantees the
  inbox has several live-looking codes, and burns the FR-012 send budget on user error.

---

## R2 — ⚠ FR-013 is not buildable in the Lambda. The IP is not in the event

**Decision**: Per-source rate limiting (FR-013) is delivered by an **AWS WAF web ACL associated with
each user pool**, with a rate-based rule scoped to the sign-in operation. It is a **Terraform
deliverable, not a Lambda one**.

**Rationale**: The Cognito trigger event's `callerContext` contains **exactly two fields** —
`awsSdkVersion` and `clientId`. There is no source IP anywhere in the common parameters or in any of
the three challenge triggers' request shapes; `@types/aws-lambda@8.10.162` (installed in this repo)
agrees. **A per-source limit cannot be computed inside the trigger.**

`clientMetadata` is not a substitute, twice over: AWS documents that
`InitiateAuth`/`AdminInitiateAuth` **do not pass `ClientMetadata` to `CreateAuthChallenge` or
`DefineAuthChallenge`** (only `RespondToAuthChallenge` does) — so it is absent on the very invocation
that sends the email — and it is client-controlled and unvalidated, so a self-reported IP is one an
attacker rotates freely.

The official mechanism is WAF on the user pool
([user-pool-waf.html](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-waf.html)),
and it fits precisely:
- Inspects **public API operations including `InitiateAuth` and `RespondToAuthChallenge`**.
- Rate-based rules work, and *"the AWS WAF handler is called before the API-level throttling
  handlers"*.
- Cognito forwards `x-amzn-cognito-operation-name` and `x-amzn-cognito-client-id`, so the rule can be
  scoped to sign-in on a specific client rather than throttling all traffic.
- Associated via the **WAF** API (`aws_wafv2_web_acl_association`) — *"Amazon Cognito doesn't have a
  separate API operation that associates a web ACL."*

⚠ **WAF cannot do the per-address limit**: *"You can't configure web ACL rules to match on personally
identifiable information … for example usernames, passwords, phone numbers, or email addresses. This
data won't be available to AWS WAF."* **FR-012 (per-address) and FR-013 (per-source) therefore need
two different mechanisms.** That is a finding, not a design preference.

⚠ Threat protection is **not** a rate limiter — *"Threat protection doesn't apply rate limits … The
risk ratings … don't take request volume into account."* It offers static IP allow/block lists and
per-request risk scoring, requires the **Plus** tier, and its `Require MFA` automatic response is a
poor fit for a passwordless platform (it would prompt for an SMS/TOTP factor these audiences do not
have). Not adopted in this slice.

**No spec amendment is needed** — FR-013 states the requirement, not the mechanism.

---

## R3 — Storage: DynamoDB, for one counter only

**Decision**: One **DynamoDB table** holding **only the per-address issuance counter** (FR-012), with
native TTL. It is the platform's first DynamoDB usage and is recorded as a justified exception in the
plan's Complexity Tracking.

**Rationale**: R1 removes the code from storage and `session[]` gives attempt counting for free
(R5), so the *only* state that must outlive a single auth session is the hourly send counter. That is
a single atomic counter with a natural expiry — the narrowest possible footprint.

The choice against PostgreSQL rests on three measured facts from this repository:

1. **The Cognito trigger timeout is 5 seconds and cannot be changed** (*"it must respond within 5
   seconds … You can't change this five-second timeout value."*). `CreateAuthChallenge` must do a
   counter read-modify-write **and** an SES send inside that budget.
2. **`@effy/edge-shared`'s pool already sets `connectionTimeoutMillis: 5_000`**
   (`apis/edge-api/shared/src/lib/db.ts:33`) — connection acquisition alone can consume the entire
   Cognito budget. A Sydney RDS round trip **measures 135 ms** (029 SIGNOFF), a Lambda cold start is
   ~1 s (020 research), and both 027 and 029 shipped timeout defects of exactly this shape.
3. ⚠ **The decisive one: edge Lambdas reach Postgres today only because the database is on the public
   internet.** `infra/envs/dev/dev.tfvars:76,81,85` set `db_allowed_cidrs = ["0.0.0.0/0"]`,
   `db_allow_public_ingress = true`, `db_publicly_accessible = true`, and
   `infra/modules/rds-postgres/variables.tf:117-129` says so explicitly: the Lambdas *"run outside the
   VPC … and therefore egress from arbitrary AWS IPs that no allowlist can pin."*
   `infra/envs/dev/edge-network.tf:32-35` records that this posture is **not valid for qa/staging/prod**.
   Putting sign-in on that path would make the eventual VPC migration a **platform-wide sign-in
   outage**. DynamoDB is reachable from outside a VPC by design and carries no such debt.

DynamoDB additionally gives: single-digit-ms latency, **native TTL** (no cleanup job for ephemeral
rows), and a conditional `UpdateItem` that is atomic and retry-safe — which matters because Cognito
*"may retry"* a trigger call, and a naive `ADD 1` would double-count a shopper's budget for one email.

**Alternatives considered**:
- **PostgreSQL** — the constitution-locked default and already wired. Rejected on (1)–(3) above. It
  would also require a Goose migration for a table holding nothing but ephemeral counters.
- **No store; enforce only via WAF** — rejected: WAF cannot see email addresses (R2), so the
  per-address limit would simply not exist.
- **ElastiCache / Redis** — heavier, VPC-bound (reintroducing the exact problem in (3)), and new
  infrastructure for one counter.

⚠ **Fail-open, deliberately.** FR-017 requires the *verification* path to fail closed — no session is
ever established without a verified code, and that is unconditional. The **rate-limit read** is
different: it is anti-abuse, not authorization, and failing it closed would make a DynamoDB blip an
outage for all four audiences. It fails **open with an alarm**. This is a deliberate split and is
recorded here because a reader would otherwise reasonably read FR-017 as covering both.

---

## R4 — ⚠ Two blocking spikes that can change the design

Neither is answerable from documentation. Both are cheap. Both run before implementation.

### R4a — Can an `UNCONFIRMED` user start `CUSTOM_AUTH`?

AWS states generally that *"users who sign themselves up must be confirmed before they can sign in"*
and `InitiateAuth` lists `UserNotConfirmedException`. **But nothing addresses whether Cognito refuses
before the triggers fire, or whether `CUSTOM_AUTH` is treated differently.**

- **If it refuses**: a `PreSignUp` trigger returning `autoConfirmUser: true` becomes **mandatory** for
  the customer self-signup route. Documented and supported — *"Users who are confirmed this way can
  immediately sign in without having to receive a code."*
- ⚠ **`autoVerifyEmail` MUST stay `false`.** Setting it would mark an address verified that nobody has
  proved control of — anyone could squat any address, and under Principle IV's linking rule a
  verified-but-unproven email is an **account-takeover primitive**. Our own OTP verification sets
  `email_verified` instead (R7).
- ⚠ Auto-confirming lets an attacker squat an address they don't control (blocking the real owner's
  sign-up, though not signing in). Mitigated by the existing pre-sign-up collision check and by WAF on
  `SignUp`.
- ⚠ AWS warns that a user with no verified contact method cannot use `ForgotPassword`, and *"a user can
  sign in with an alias only if the alias is verified."* **That warning is about `alias_attributes`;
  this platform uses `username_attributes = ["email"]`** (`infra/modules/cognito-user-pool/main.tf:27`),
  which is a different mechanic — email *is* the username, not an alias. The spike must confirm this
  distinction holds, because if it does not, the flow deadlocks.

The existing 011 account-linking `PreSignUp` Lambda is **deployed but not wired**
(`customer_pre_sign_up_lambda_arn` defaults to `null`). This slice extends it rather than adding a
second pre-sign-up trigger — a pool accepts only one.

### R4b — ⚠ Does passwordless `SignUp` force the 8-digit flow to stay reachable?

`SignUp` accepts an omitted password, but *"you can only create a passwordless user when passwordless
sign-in is available"* — which unpacks to five conditions including *"passwordless sign-in is active in
your user pool **and app client**"*, i.e. `EMAIL_OTP` in `allowed_first_auth_factors` **and**
`ALLOW_USER_AUTH` on the client.

⚠ **Consequence: on any client that keeps `ALLOW_USER_AUTH`, the managed 8-digit `EMAIL_OTP` flow
remains reachable via a raw `InitiateAuth` call**, bypassing our 3-attempt cap, our 5-minute TTL and
our per-address limit. No Effy client would do this, but FR-001 says *every* code the platform issues
is six digits, and a reachable 8-digit path makes that untrue.

Note the bypass is toward a **stronger** credential (8 digits with Cognito's own managed throttling),
so it is a **consistency** defect, not a privilege escalation. It is recorded, not hidden.

**Resolution, per audience** — and this is why the audiences are treated differently:

| Pool | `explicit_auth_flows` after this slice | Bypass? |
|---|---|---|
| driver, shop, admin | `ALLOW_CUSTOM_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` | **None.** These audiences have **no self-signup at all** (`allow_admin_create_user_only = true`), so passwordless `SignUp` is irrelevant and `ALLOW_USER_AUTH` is simply dropped. |
| customer | `ALLOW_CUSTOM_AUTH`, `ALLOW_USER_SRP_AUTH`, `ALLOW_USER_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` | ⚠ **Yes, at the raw-API level**, until the spike below resolves. |

The internal pools therefore land clean. For the customer pool the spike (T003) tests whether
`ALLOW_USER_AUTH` can live on a **separate sign-up-only app client** while the sign-in client stays
`ALLOW_CUSTOM_AUTH`-only — the "and app client" wording suggests it binds the client used in the
`SignUp` call, but this is untested.

⚠ **The obvious alternative — generate and discard a random password at sign-up — is REJECTED, and
the reason is not obvious.** It would break feature 012's set-first-password flow. That flow calls
`ChangePassword` **without** `PreviousPassword`, which only works on an account that has no password
(`apis/edge-api/customer/src/password/cognito.ts:106-117`). Planting a throwaway password makes
`unsafeSetFirstPassword` fail, and desynchronises the platform's own `has_password` column. A fix that
silently breaks a shipped security control is not a fix.

Also note: `ALLOW_USER_AUTH` requires the **Essentials tier**. Dropping it on three pools may permit a
tier reduction — worth checking against real MAU, but not a goal of this slice.

---

## R5 — Attempt counting is free; nothing underneath enforces it

**Decision**: `DefineAuthChallenge` counts `request.session[]`. `MAX_ATTEMPTS = 3`.

**Rationale**: `session[]` holds `{challengeName, challengeResult, challengeMetadata}` in
**chronological order**, and **failed attempts are appended** (`challengeResult: false`) rather than
replacing. That is what makes counting possible without storage.

⚠ **Cognito imposes no cap of its own.** The full quotas page has no quota for custom-challenge
attempts and none on `RespondToAuthChallenge` retries per session — the code-security table covers
`ConfirmSignUp`, `ForgotPassword`, `ChangePassword`, `VerifyUserAttribute` and others, but not this.
Meanwhile the per-user rate is **10 operations/user/second**, which permits ~36,000 guesses/hour
against one account; against a 10⁶ space in a 5-minute window that is ~3,000 guesses per code
lifetime. **The 3-attempt cap in `DefineAuthChallenge` is the only thing standing between a shopper
and brute force.**

⚠ Two correctness traps, both recorded because they are silent when wrong:
1. **The documented `issueTokens` warning**: *"always check `challengeName` in your define auth
   challenge function and verify that it matches the expected value."* Every `issueTokens: true`
   branch must assert `challengeName === "CUSTOM_CHALLENGE"` and that **every** element of the session
   is ours — otherwise tokens can be issued for a challenge type we did not author.
2. **Off-by-one**: `session.length >= 3` yields exactly three tries (lengths 0, 1, 2 issue a
   challenge; 3 fails). This is asserted by a test, not by reading.

⚠ **`AuthSessionValidity` is NOT the TTL.** It bounds the `Session` token between each request and is
**refreshed on each round trip**; range 3–15 minutes. It cannot express "this code dies 5 minutes
after issue". Set it to **5** as a coarse backstop — never below, or the session would expire before
the third attempt — and enforce the real TTL from the issued-at timestamp in `challengeMetadata`.

---

## R6 — The 5-second budget, and what shares it

**Decision**: `CreateAuthChallenge` is the only trigger doing network I/O; it is kept lean and its
clients are module-scoped.

**Rationale**: *"Amazon Cognito invokes Lambda functions synchronously … it must respond within 5
seconds … You can't change this five-second timeout value."* Inside that: a DynamoDB
read-modify-write plus an SES send, on a possible ~1 s cold start.

Mitigations: Node 22 / arm64 with a minimal bundle (`@aws-sdk/client-sesv2` and
`@aws-sdk/client-dynamodb` only — no Amplify, no SDK v2), clients constructed at **module scope** so
warm invocations reuse them, and no Postgres connection anywhere on this path (R3).

⚠ **Cognito "may retry" a trigger call** — so `CreateAuthChallenge` can fire twice for one sign-in.
The send is made idempotent per auth session, and the counter uses a conditional update, or one retry
both double-mails the shopper and burns their hourly budget.

⚠ **Failure is fail-closed and the error text is user-visible**: *"The Amazon Cognito user pools API
returns trigger errors in the format `{{[trigger]}} failed with error {{[error text from response]}}`.
As a best practice, only generate errors in your Lambda functions that you want your users to see."*
**Never throw on a user-data condition** — a `throw new Error("no email attribute for user")` reaches
the client verbatim and is an existence oracle. Return `answerCorrect: false` or an empty challenge
instead; throw only on genuine infrastructure failure, with a fixed opaque string.

Provisioned concurrency is **not** adopted now: it requires a version/alias, and *"you can't declare a
function version in your Lambda trigger configuration"* from the console (Terraform can set an alias
ARN). Revisit if T00x measurement shows cold starts near the ceiling.

---

## R7 — Reinstating email verification (FR-020) — a fourth trigger

**Decision**: A **`PostAuthentication`** trigger sets `email_verified = true` via
`AdminUpdateUserAttributes`, idempotently.

**Rationale**: The automatic verification we are giving up is scoped explicitly to *managed*
passwordless: *"When a user correctly enters a code … **as part of passwordless authentication** …
your user pool marks the user's unverified email address … as verified. The user status also changed
from `UNCONFIRMED` to `CONFIRMED`."* The enumerated list of "other actions that confirm and verify user
attributes" contains exactly two entries for email — passwordless auth and email MFA. **`CUSTOM_AUTH`
is on neither.** From Cognito's point of view our challenge is an opaque Lambda verdict; it has no
idea an email was involved.

`PostAuthentication` rather than `VerifyAuthChallengeResponse` because it is the **only** point that
unambiguously means "the sign-in completed" — the verify trigger can return `true` on an attempt that
`DefineAuthChallenge` then declines to issue tokens for. It also keeps the verify trigger a pure
comparison function, which is what makes the constant-time compare auditable.

⚠ `AdminConfirmSignUp` is **not** used: it is IAM-authorized, only works for self-service sign-ups, its
behaviour on an already-`CONFIRMED` user is undocumented, and it fires `PostConfirmation` mid-sign-in.
If R4a shows confirmation is needed, `PreSignUp` auto-confirm handles it at the right moment instead.

⚠ **This is the most likely place for a silent, delayed failure in the whole slice.** Miss it and
accounts accumulate with `email_verified: false`; nothing breaks until someone tries Google sign-in
and linking refuses — which, per Principle IV, it must.

---

## R8 — One shared trigger implementation, four pools

**Decision**: **One set of four Lambda functions** (`define`, `create`, `verify`, `postAuth`)
branching on `event.userPoolId`, with **one `aws_lambda_permission` per (function, pool)** — 16
permissions, no wildcards.

**Rationale**: `event.userPoolId` is in the common parameters, so per-audience behaviour (copy,
limits) is a branch. Per-pool permissions keep the resource policy honest and match Principle IV; the
documented example pins `AWS:SourceArn` to one pool ARN, and although `ArnLike` permits a wildcard, a
wildcard would silently admit any future pool.

⚠ **Accepted risk: shared fate.** A bad deploy breaks sign-in for all four audiences at once,
including the admin console. Mitigated by (a) **staged attachment** — `lambda_config` is wired one pool
at a time, internal-first, so during rollout an unattached pool is completely unaffected; (b) per-pool
rollback is detaching the trigger or reverting one client's flow, no code deploy; (c) alarms on trigger
error rate. The alternative — twelve-plus functions from one source — was considered and rejected as
operational weight disproportionate to a solo-maintained platform, where Principle VI's "explicit and
greppable" wiring is itself a safety property.

---

## R9 — Service placement: a new `apis/edge-api/auth`

**Decision**: A **new cold-path service `apis/edge-api/auth`** (`@effy/edge-auth`), hosting the four
triggers. No HTTP routes — every function has no `events:` block, exactly like the existing
`preSignUp` trigger.

**Rationale (Principle III)**: The path is **forced, not chosen** — Cognito invokes Lambda and nothing
else, so a Go/Fargate hot-path implementation is not expressible. This is recorded rather than argued
because Principle III requires every plan to justify its path.

**Why not the existing `customer` service**, which already hosts the `preSignUp` trigger:
- Its own header declares *"This service carries CUSTOMER PROFILE / ACCOUNT MANAGEMENT ONLY"*; serving
  driver/shop/admin auth from it contradicts the loudest comment in the file.
- ⚠ **IAM is the decisive argument.** Its role scopes `cognito-idp:*` to the customer pool ARN. A
  four-pool trigger needs all four, which would give the *customer* service's role administrative
  reach over the **internal** audiences — a direct Principle IV smell.
- Blast radius: every `make edge-deploy SERVICE=customer` would then be able to break platform-wide
  sign-in.

The repo makes a new service cheap: `pnpm-workspace.yaml:5` globs `apis/edge-api/*`, `turbo.json` has
no per-package entries, and `Makefile:182` derives `EDGE_DIR` from `SERVICE=`. Required files are
`package.json` (⚠ the name **must** match `@effy/edge-*` or `make edge-test` skips it),
`tsconfig.json`, `vitest.config.ts`, `serverless.yml`, `src/functions/*.ts`.

⚠ The 011 `preSignUp` trigger **stays in `customer`** — it is customer-pool-specific and already
wired there. This slice extends its logic (R4a) rather than relocating it.

---

## R10 — Client SDK flow, and what breaks on each surface

**Decision**: `CUSTOM_WITHOUT_SRP` on all three SDKs, via Amplify only.

| Surface | Today | After |
|---|---|---|
| web (`web-kit`, `customer-web`) | `signIn({options:{authFlowType:"USER_AUTH", preferredChallenge:"EMAIL_OTP"}})` → step `CONFIRM_SIGN_IN_WITH_EMAIL_CODE` | `authFlowType: "CUSTOM_WITHOUT_SRP"` → step `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` |
| Android | `AuthFlowType.USER_AUTH` + `preferredFirstFactor(EMAIL_OTP)` → `CONFIRM_SIGN_IN_WITH_OTP` | `AuthFlowType.CUSTOM_AUTH_WITHOUT_SRP` → `CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE` |
| iOS | `.userAuth(preferredFirstFactor: .emailOTP)` → `.confirmSignInWithOTP` | `.customWithoutSRP` → `.confirmSignInWithCustomChallenge` |

⚠ **`CUSTOM_WITHOUT_SRP`, never `CUSTOM_WITH_SRP`.** amplify-android #2331/#2566 record
`CUSTOM_AUTH_WITH_SRP` returning `AuthSignInStep.DONE` — **issuing tokens without presenting the
challenge** — fixed twice and reported recurring at 2.11.2. A test asserts the first `signIn` returns
the challenge step and **never** `DONE`.

⚠ **Five breakage sites, ranked by how quietly they fail** (from the codebase sweep):
1. `packages/web-kit/src/auth/otp.ts:17-24` — `switch` with a **throwing `default`**. Breaks shop-web
   and back-office simultaneously. *Loud, immediate.*
2. Both `AmplifyAuthDriver.kt` `mapSignIn` `when` blocks have an `else -> Failed(Unexpected)` — **no
   compile error**, a runtime dead end. *Silent.*
3. Both `SwiftAuthBridge.swift` `mapSignIn` `switch` blocks have `default: "unexpected"`. *Silent.*
4. The stringly-typed iOS `BridgeAuthResult.outcome` needs a new constant in two files per app, with
   no compiler help. *Silent.*
5. `customer-web` has **no `switch` on `signInStep` at all** — a new step fails later and more
   confusingly than on the console surfaces.

⚠ **`autoSignIn` does not support `CUSTOM_WITHOUT_SRP`** — Amplify documents only `USER_AUTH`. FR-041's
accepted loss is realised as: after `signUp` resolves, call `signIn` immediately in the same handler.
The user still sees **one** code screen; the cost is two Cognito round trips at sign-up.

⚠ **`mobile-guard.sh` bans the Amplify escape hatch** (`cognitoidentityprovider`,
`CognitoIdentityProviderClient`) with a deliberately empty allowlist. The mobile flow **must** go
through `Amplify.Auth.signIn`/`confirmSignIn`. Reaching for the raw Cognito client is an instant build
failure — which is the correct outcome.

---

## R11 — The shared code input: a plain field, and NOT the `input-otp` package

**Decision**: One logical input — a single styled field with `inputMode="numeric"`,
`autoComplete="one-time-code"`, `maxLength={6}`. **No segmented per-digit boxes. No new dependency.**

**Rationale**: Three independent arguments converge.
1. **FR-025 requires one logical field for assistive technology.** Segmented boxes are several inputs;
   they are the reason screen-reader users lose their place in OTP forms. shop-mobile's existing
   `OtpInput` already documents this intent — *"One logical email-code editor. Platform adapters keep a
   single accessibility/focus node"* — and `AuthFoundationUiTest.kt:81` asserts **exactly one** node
   with that description. That test is a deliberate regression guard against per-digit boxes.
2. ⚠ **The bundle budget forbids the dependency.** `apps/customer-web/scripts/bundle-budget.mjs:88-95`
   records **2.1–5.5 KB** of headroom against the 174 KB gate, `/search` being the tightest at 2.1 KB,
   with the file's own warning that *"any dependency change must be measured immediately."* The
   `input-otp` npm package is not currently a dependency anywhere; adding it to `@effy/design-system`'s
   barrel risks the gate on routes that never render an OTP field. The script's instruction is
   explicit: *"Do NOT raise the limit to make this pass."*
3. It is simply less code.

**Web**: a new `packages/design-system/src/ui/otp-input.tsx` following the house pattern (kebab-case
file, `data-slot`, `cn`, named export, added to the `src/ui/index.ts` barrel). No exports-map change
needed — the package ships TS source. ⚠ It must stay **pure presentation** so it never pulls
`aws-amplify` into a guest route and trips the dependency-cruiser quarantine (`reachable: true`).

**Mobile**: **promote** shop-mobile's `expect`/`actual` `OtpInput` into `packages/mobile-kit/ui/`
(package `com.effyshopping.mobile.kit.ui`, `srcDir`'d into both apps). Its iOS actual is the valuable
part — a native `UITextField` with **`textContentType = UITextContentTypeOneTimeCode`**, which is what
makes iOS offer the autofill chip, plus custom paste handling. customer-mobile currently uses the
generic `EffyField` with no autofill and no `maxLength`, so promotion fixes FR-026 on that surface too.

⚠ **`normalizeOtp` and `OTP_LENGTH` must move with it** (both `internal`, both called by the platform
actuals). `normalizeOtp`'s `.take(OTP_LENGTH)` is **the shipped defect this feature exists to fix** —
after this slice, six is the true length, so truncation-to-six stops corrupting anything. But FR-004/
FR-005 require that a longer paste be **refused, not silently trimmed**, so the promoted version
filters non-digits and **stops accepting input past six** while a submitted value of the wrong length
is refused rather than reshaped.

---

## R12 — Existence parity is the hardest requirement in the slice

**Decision**: Treat FR-016 as a first-class deliverable with its own tests, not as a property that
falls out of the design.

**Rationale**: `PreventUserExistenceErrors = ENABLED` does exactly two things — suppresses
`UserNotFoundException` and populates `request.userNotFound` — and then AWS hands the problem over:
*"We recommend that your Lambda functions maintain the same user experience and account for latency.
This way, the caller can't detect different behavior when the user exists or doesn't exist."*

⚠ **It defaults to `LEGACY`.** It is already `ENABLED` on all four module-owned clients and both mobile
clients — verified — but it is a **Terraform** property, and no amount of Lambda code can compensate if
it regresses.

Each trigger's obligation on `userNotFound === true`:
- `CreateAuthChallenge` — identical motions and an identically-shaped `publicChallengeParameters`, but
  **no email to a stranger**.
- `VerifyAuthChallengeResponse` — always `answerCorrect: false`, still running the constant-time
  compare against a dummy digest so timing matches.
- `DefineAuthChallenge` — identical branch logic and identical attempt count; never a short-circuit
  fail on attempt one.

⚠ **The latency channel is the real difficulty.** A real send calls SES (tens to hundreds of ms); a
phantom send calls nothing and returns measurably faster — so existence leaks *despite* every response
body being identical. Rather than sleeping a guessed interval, the phantom path **sends to SES's
mailbox simulator** (`success@simulator.amazonses.com`), so the timing distribution matches naturally
because it is the same call.

⚠ The **per-address counter must be written for non-existent addresses too**, or its presence becomes a
second oracle and an attacker gets unlimited free probes of unknown addresses.

⚠ ⚠ **`failAuthentication: true`'s wire error is NOT DOCUMENTED.** Community reports say
`NotAuthorizedException`; no AWS page states the mapping. This matters directly for parity — the
message a real user who mistyped sees must be byte-identical to the one an unknown address sees. **T002
captures both and compares.**

---

## R13 — Governance: a PATCH amendment, not a reinterpretation

**Decision**: Amend the constitution **1.11.0 → 1.11.1 (PATCH)**, clarifying that "passwordless
EMAIL_OTP" names the **credential** — an emailed one-time code — and not Cognito's `EMAIL_OTP` enum.

**Rationale**: FR-040 requires the question be *settled*, not assumed. The substantive reading is that
Principle IV is about credentials and isolation: every isolation rule (four pools, per-pool validation,
pinned issuer, no auth proxy, cross-pool rejection, claim-as-origin/record-as-authority) is untouched,
and the audiences keep exactly the credentials they had. A Cognito challenge trigger is **not** an auth
proxy — it is Cognito invoking our code inside its own flow, in the same pool, for the same audience;
`apis/edge-api/customer/src/lib/cognito.ts:14-17` already reasons identically about the pre-sign-up
trigger.

But the literal strings `EMAIL_OTP` (`constitution.md:290`) and `email OTP` (`:295`) are the vendor's
enum names, and this slice **removes that enum from three pools' client flows**. Leaving the text
unchanged would make the constitution false as a description of the platform — which the Quality Gates
themselves define as a defect. PATCH is the right bump: clarification, no principle added, removed or
redefined, no committed plan invalidated.

Same-change dependent updates: `CLAUDE.md` § Auth, `ARCHITECTURE.md`, `packages/web-kit`
(`package.json:7`, `src/index.ts:4`, `src/auth/otp.ts:4-8`, `src/runtime/amplify.ts:6`),
`infra/modules/cognito-user-pool/{main.tf:1-4,variables.tf:32-50}`, `scripts/verify-pool-credentials.sh`,
and the audience registers (FR-042).

---

## R14 — ⚠ A guard that will pass while the platform changes underneath it

**Decision**: Extend `scripts/verify-pool-credentials.sh` **in this slice**.

**Rationale**: It greps the internal pools' `ExplicitAuthFlows` for
`ALLOW_USER_SRP_AUTH|ALLOW_USER_PASSWORD_AUTH|ALLOW_ADMIN_USER_PASSWORD_AUTH`. **`ALLOW_CUSTOM_AUTH`
is not in that list**, so the guard would report ✓ PASS while all four pools gain a brand-new
first-factor auth flow. That is precisely the failure the script's own header warns about — *"the
guarantee is one careless default away from evaporating, on the pools where the blast radius is
worst"* — and precisely the failure it **already suffered once** (it reported PASS while not checking
back-office at all).

⚠ It also reads only `.../app_client_id`, so the **two mobile clients are entirely unguarded**
(`customer_mobile`, `shop_mobile`), and their `explicit_auth_flows` are hardcoded in the env root.

Shipping this feature without extending the guard would put a green tick over an unreviewed widening
of the platform's authentication surface.

---

## R15 — Telemetry (Principle VII)

**Decision**: Backend-only for this slice; no new client analytics.

- **Metrics** (CloudWatch EMF from the triggers → the existing Grafana CloudWatch datasource):
  `otp_code_issued`, `otp_send_failed`, `otp_verify_failed`, `otp_attempts_exhausted`,
  `otp_rate_limited`, `otp_ratelimit_store_unavailable` — all dimensioned by `userPoolId` **only**
  (low cardinality; ⚠ never by email or `sub`).
- **Alarms**: verify-failure rate spike across many addresses (a distributed guessing campaign is now
  visible only in *our* metrics — R5); trigger error rate (fail-closed means an error is an outage);
  `otp_ratelimit_store_unavailable > 0` (the fail-open path in R3 is silent by design and must not be);
  plus the existing SES bounce/complaint alarms, which become sign-in alarms under this design.
- ⚠ **FR-014 binds telemetry**: no code, no HMAC, and no raw email address in any log, metric label, or
  trace. Verified by SC-008.
- **Client analytics is deliberately not added.** Mobile telemetry has been deferred for twelve
  consecutive slices and PostHog has never been initialised on customer-web — adding a first event on
  the authentication path would be both unmeasurable and the wrong place to start. Recorded as a
  carry-forward, not silently skipped.

---

## R16 — What has NO automated coverage today, and what that forces

⚠ **There is no mechanism anywhere in this repository to read a sent email or intercept a code in an
automated test.** No MailHog/Mailpit/Inbucket, no SES event destination, no test inbox. Every
OTP-completing path is deferred to a manual operator step with a real inbox, and the e2e suite says so
deliberately: *"Mocking Cognito and calling that proof would be exactly the dishonest green this slice
has been careful to avoid."*

⚠ Compose UI tests **silently no-op on the JVM host** — `canRunComposeUiTestOnHost()` returns `false`
in the Android host actual, so `AuthFoundationUiTest` does not execute on the one task the Makefile
runs.

**Consequence for FR-036**, stated honestly rather than papered over: automated coverage will be
(a) exhaustive unit tests of the pure trigger logic — generation, HMAC compare, TTL, attempt counting,
parity branches — which is where the security lives and which needs no AWS at all; (b) a container-backed
test of the counter; (c) Playwright coverage of the code **field** (length, paste, refusal messages)
with the code injected, not received. **Completing a real sign-in end-to-end remains an operator step**
with a real inbox, per this repo's established and deliberate practice. The plan does not claim
otherwise.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where the code lives across attempts | Keyed hash + issued-at in `challengeMetadata` (R1) |
| Whether per-source limiting is possible in-Lambda | **No** — WAF web ACL instead (R2) |
| Storage technology | DynamoDB, one counter only, exception recorded (R3) |
| Attempt counting | `session[]`, free, entirely our responsibility (R5) |
| TTL mechanism | Issued-at in `challengeMetadata`, **not** `AuthSessionValidity` (R5) |
| Email verification reinstatement | `PostAuthentication` trigger (R7) |
| One function or many | One set, four pools, staged attachment (R8) |
| Service placement | New `apis/edge-api/auth` (R9) |
| Shared input component | Plain single field, no new dependency (R11) |
| Constitution | PATCH amendment 1.11.1 (R13) |

## Open — resolved by spike before implementation

| # | Question | Decides |
|---|---|---|
| **T001** | Do the codes actually measure 8 and 6 today? | The premise itself (FR-037) |
| **T002** | What exact error does `failAuthentication: true` produce, and is it identical for an unknown address? | Existence parity (FR-016, FR-028) |
| **T003** | Can an `UNCONFIRMED` user start `CUSTOM_AUTH`? Can `ALLOW_USER_AUTH` live on a sign-up-only client? | Whether `PreSignUp` auto-confirm is mandatory, and whether the customer bypass closes (R4a/R4b) |

---

## R17 — The two capabilities this feature gives up (FR-041)

Recorded as **accepted losses**, not discovered later.

### 1. Passkeys (`WEB_AUTHN`) as a first factor on the affected pools

`CUSTOM_AUTH` is client-based authentication; `WEB_AUTHN` is only selectable through the
**choice-based** `USER_AUTH` flow. The three internal pools drop `ALLOW_USER_AUTH` entirely, so a
passkey cannot be offered there without reversing this decision.

**Accepted because** passkeys were never on this platform's roadmap, no audience has asked for them,
and the reversal is cheap: re-add `ALLOW_USER_AUTH` and the flow returns. ⚠ The customer pool keeps
`ALLOW_USER_AUTH` for unrelated reasons (R4b), so the storefront's passkey option is **not**
foreclosed — only the internal consoles'.

### 2. `autoSignIn` after sign-up — ⚠ **NOT lost, and the plan was wrong about this**

Research R10 recorded that Amplify's `autoSignIn` supports only `USER_AUTH`, and the plan drew the
conclusion that sign-up must therefore call `signUp` then `signIn` explicitly. **That conclusion was
wrong and was reversed during implementation.**

The code a customer types on the sign-up route is the **`ConfirmSignUp`** code — already six digits,
and untouched by this feature (FR-003). `autoSignIn` merely completes the session afterwards and
**issues no code of its own**, so FR-001 is not engaged. Removing it would have left the customer
confirmed but signed out, needing a **second** code where there is currently one — a regression
dressed as compliance.

⚠ **What IS unresolved**: what `autoSignIn` does once custom-auth triggers are attached to the pool
is documented nowhere. It may complete from the confirmation alone (today's behaviour, one code) or
initiate a fresh challenge (two codes, possibly an eight-digit one). **Added to spike T003 as
question (c)**, and it must be answered before the customer audience migrates.

### Not a loss, though it looks like one

**Cognito's managed OTP throttling** is replaced rather than lost — but by *our* controls, which is
the whole cost of this feature and is accounted for in FR-007…FR-019 rather than here.
