# Implementation Plan: Platform-Wide Six-Digit One-Time Codes

**Branch**: `035-six-digit-otp` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/035-six-digit-otp/spec.md`

**Artifacts**: [research.md](research.md) · [data-model.md](data-model.md) ·
[contracts/auth-triggers.contract.md](contracts/auth-triggers.contract.md) · [quickstart.md](quickstart.md)

## Summary

Replace Cognito's managed 8-digit `EMAIL_OTP` passwordless sign-in with a **`CUSTOM_AUTH` challenge
flow** in which the platform generates, sends, expires and verifies its own **6-digit** code — across
four user pools and six client surfaces — so that every one-time code Effy issues is the same length.

The design's defining property is **how little it stores**. Research established that the code can be
carried as a **keyed hash in `challengeMetadata`**, that attempt counting comes free from Cognito's
`session[]`, and that expiry is an issued-at timestamp. So the secret is **never written to any
database**, there is **no Goose migration**, and the only persisted state in the whole slice is a
single hourly counter per email address.

Two research findings changed the shape of the work:

1. ⚠ **FR-013 is not buildable in a Lambda.** The Cognito trigger event's `callerContext` contains
   exactly two fields and **neither is an IP address**. Per-source rate limiting moves to an **AWS WAF
   rate-based rule** on each pool — a Terraform deliverable, not a code one. The requirement stands
   unchanged; only the mechanism was unknown when the spec was written.
2. ⚠ **DynamoDB, not PostgreSQL**, for the one counter — recorded below as a justified exception.
   The decisive reason is not latency: edge Lambdas reach Postgres today **only because the dev
   database is on the public internet**, a posture the repo itself documents as invalid for
   production. Putting sign-in on that path would make the eventual VPC migration a platform-wide
   sign-in outage.

## Technical Context

**Language/Version**: TypeScript on Node 22 (Lambda, arm64) · Kotlin 2.4.0 / Compose Multiplatform
1.11.1 · Swift (iOS bridge) · React 19 + TypeScript · HCL (Terraform)

**Primary Dependencies**: `@aws-sdk/client-sesv2`, `@aws-sdk/client-dynamodb`,
`@aws-sdk/client-cognito-identity-provider`, `@types/aws-lambda`, Serverless Framework 3.40.0 ·
AWS Amplify (JS v6 / Android / Swift) · Node `crypto` (stdlib — CSPRNG, HMAC, `timingSafeEqual`)
⚠ **No new client-side dependency.** The `input-otp` npm package is deliberately **not** adopted
(research R11 — the bundle budget and FR-025 both argue against it).

**Storage**: **One DynamoDB table** (`effy-<env>-otp-issuance`) holding an hourly issuance counter
keyed on a hashed address, with native TTL. ⚠ **No PostgreSQL table, no Goose migration** — the code
itself is never persisted (data-model.md).

**Testing**: vitest (trigger logic, exhaustive — this is where the security lives) ·
`@testcontainers/postgresql` not needed; DynamoDB access is faked at the repo-wrapper seam per this
repo's existing convention · Kotlin `commonTest` · Playwright (the code **field**, not a real code) ·
⚠ real end-to-end sign-in remains an **operator step** (research R16)

**Target Platform**: AWS Lambda arm64 (`ap-southeast-2`) · iOS 15+ / Android API 24–36 · modern browsers

**Project Type**: Multi-surface platform change — cold-path backend + infrastructure + two shared
packages + six client surfaces

**Performance Goals**: ⚠ **Every trigger must respond inside Cognito's 5-second hard timeout, which
cannot be changed.** `CreateAuthChallenge` is the only one doing I/O (one DynamoDB update + one SES
send) and is the tightest budget in the slice. Sign-in time-to-signed-in no worse than today (SC-015).

**Constraints**: Cognito trigger timeout 5 s (fixed) · `AuthSessionValidity` 3–15 min, refreshed per
request, ⚠ therefore **not** usable as the code TTL · `challengeMetadata` is the only channel that
survives between `CreateAuthChallenge` invocations · trigger errors are **user-visible**, so nothing
may throw on a user-data condition · customer-web guest bundle **174 KB with 2.1 KB headroom on
`/search`** · `prevent_destroy` on all four pools

**Scale/Scope**: 4 Cognito pools · 6 app clients · 6 client surfaces · 4 new Lambdas · 1 new cold-path
service · 1 DynamoDB table · 1 WAF web ACL per pool · 2 shared UI components (web + mobile) ·
~40 hard-coded/user-visible sites identified across the codebase

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Both passes recorded.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-Driven Development** | ✅ PASS | spec → plan → tasks. ⚠ Two spec-level findings (FR-013's mechanism, the DynamoDB choice) are recorded **here and in research.md**, not patched silently. If T001–T003 contradict the design, the spec is amended first. |
| **II. Monorepo with Shared Contracts** | ✅ PASS | One trigger implementation serves four pools. The OTP field is promoted **into** `@effy/design-system/ui` (web) and `packages/mobile-kit/ui` (mobile) rather than written per surface — ⚠ this feature exists *because* shop-mobile wrote its own. A byte-identical cross-language fixture pins the step-name strings (028's precedent). |
| **III. Dual-Path Backend Discipline** | ✅ PASS — **path is forced, not chosen** | **Cold path.** Cognito invokes Lambda and nothing else; a Go/Fargate implementation is not expressible. Recorded explicitly because the principle requires every plan to justify its path. The hot path is untouched. |
| **IV. Auth Isolation** | ⚠ **PASS with a required PATCH amendment** | Four pools, per-pool validation, pinned issuers, no cross-pool acceptance — **all unchanged**; nothing anywhere reads `auth_time` or `amr`, and issued tokens carry the same `iss`/`aud`/`client_id`/`token_use`/`sub`/`cognito:groups`. A challenge trigger is **not** an auth proxy — it is Cognito invoking our code inside its own flow, same pool, same audience. **But** Principle IV's literal text says "strictly passwordless **EMAIL_OTP**", and this slice removes that enum from three pools' client flows. See § Governance below. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | No new colour, no token change (`tokens:check` must pass **unchanged**). ⚠ The mobile OTP field's touch target must clear the 48 dp minimum — 033 shipped a 32 dp control under a comment claiming it cleared it. No card layouts introduced. |
| **VI. Layered Architecture & Explicit Wiring** | ✅ PASS | Trigger handler (edge) → pure policy module → SES/DynamoDB adapters, which are also the **mock seam** this repo already uses. No DI framework; wiring is explicit in `serverless.yml` + Terraform. ⚠ The pure policy module holds **all** security logic and is testable with zero AWS. |
| **VII. Observability & Telemetry** | ✅ PASS | Six CloudWatch metrics dimensioned by `userPoolId` **only**; four alarms — including one on the deliberately-silent fail-open path. ⚠ FR-014 binds telemetry: no code, no HMAC, no raw address in any log or label. Client analytics deliberately **not** added (research R15) and recorded as a carry-forward. |

### Governance — the required amendment

**Constitution 1.11.0 → 1.11.1 (PATCH), in this slice.** FR-040 requires the question be *settled*.

The substantive reading is that "passwordless EMAIL_OTP" names the **credential** — an emailed
one-time code — not Cognito's enum, and that every isolation rule and every audience's credential set
is untouched. But the literal strings at `constitution.md:290` and `:295` are the vendor's enum names,
and leaving them while three pools drop that enum would make the constitution **false as a description
of the platform** — which the Quality Gates themselves define as a defect. PATCH is correct: a
clarification; no principle added, removed, or redefined; no committed plan invalidated.

Same-change dependent updates: `CLAUDE.md` § Auth · `ARCHITECTURE.md` · `packages/web-kit`
(`package.json:7`, `src/index.ts:4`, `src/auth/otp.ts:4-8`, `src/runtime/amplify.ts:6`) ·
`infra/modules/cognito-user-pool/{main.tf:1-4, variables.tf:32-50}` ·
`scripts/verify-pool-credentials.sh` · the audience registers (FR-042).

## Project Structure

### Documentation (this feature)

```text
specs/035-six-digit-otp/
├── plan.md                              # This file
├── spec.md
├── research.md                          # Phase 0 — R0…R16, incl. 3 blocking spikes
├── data-model.md                        # Phase 1 — ⚠ no SQL table; what is NOT modelled and why
├── quickstart.md                        # Phase 1 — operator runbook + rollback drill
├── contracts/
│   └── auth-triggers.contract.md        # Phase 1 — trigger shapes, client flow, 14 pinned invariants
├── checklists/requirements.md
└── tasks.md                             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
apis/edge-api/auth/                          # NEW cold-path service (@effy/edge-auth)
├── package.json                             # ⚠ name MUST match @effy/edge-* or `make edge-test` skips it
├── tsconfig.json  vitest.config.ts  serverless.yml   # copied from the `customer` service
└── src/
    ├── functions/
    │   ├── define-auth-challenge.ts         # state machine: attempts, issueTokens guard
    │   ├── create-auth-challenge.ts         # generate | reuse, send, count
    │   ├── verify-auth-challenge.ts         # pure compare — no I/O
    │   └── post-authentication.ts           # reinstates email_verified (FR-020)
    ├── otp/
    │   ├── policy.ts        policy.test.ts  # ⚠ ALL security logic; zero AWS; exhaustively tested
    │   ├── codec.ts         codec.test.ts   # challengeMetadata encode/decode
    │   ├── mailer.ts                        # SES adapter — mock seam
    │   └── issuance.ts      issuance.test.ts# DynamoDB counter — mock seam
    └── lib/audience.ts                      # userPoolId → audience copy/limits

apis/edge-api/customer/src/functions/pre-sign-up.ts   # EXTENDED: autoConfirmUser (pending T003)

infra/
├── modules/cognito-user-pool/{main.tf,variables.tf}  # 4 trigger ARNs, explicit_auth_flows, auth_session_validity
├── envs/dev/auth-{customer,driver,shop,backoffice}.tf # per-pool wiring + 16 aws_lambda_permission
├── envs/dev/otp-store.tf                    # NEW — DynamoDB table + IAM
└── envs/dev/waf-user-pools.tf               # NEW — rate-based rule + association (FR-013)

packages/
├── design-system/src/ui/otp-input.tsx        # NEW — plain single field, zero new deps
├── mobile-kit/ui/OtpInput.kt (+ .android.kt, .ios.kt)  # PROMOTED from shop-mobile
└── web-kit/src/auth/otp.ts                   # ⚠ the throwing `default` — breakage site #1

apps/                                         # 6 surfaces: flow constant, step handling, copy
├── customer-web/  shop-web/  back-office/
├── customer-mobile/  shop-mobile/            # AuthDriver + AmplifyAuthDriver + SwiftAuthBridge + AuthStep
└── driver-mobile/                            # untouched — FR-006 binds it when it grows a sign-in screen

scripts/verify-pool-credentials.sh            # ⚠ EXTENDED — see Complexity Tracking
```

**Structure Decision**: A **new `apis/edge-api/auth` service** rather than extending
`apis/edge-api/customer`, which already hosts the `preSignUp` trigger. The decisive argument is IAM:
the customer service's role is scoped to the customer pool ARN, and widening it to four pools would
give the *customer* service administrative reach over the **internal** audiences — a direct Principle
IV smell. Its own header also declares it carries "CUSTOMER PROFILE / ACCOUNT MANAGEMENT ONLY". The
repo makes a new service nearly free: `pnpm-workspace.yaml` globs `apis/edge-api/*`, `turbo.json` has
no per-package entries, and `Makefile:182` derives `EDGE_DIR` from `SERVICE=`. ⚠ The 011 pre-sign-up
trigger **stays** in `customer` — it is customer-pool-specific and already wired there; a pool accepts
only one.

## Rollout

Sequenced, reversible, internal-first — because a locked-out shop operator is a support ticket and a
locked-out shopper is a lost order.

| Stage | Audience | Rollback |
|---|---|---|
| 1 | back-office | revert one client constant |
| 2 | shop (web, then mobile) | per-surface constant |
| 3 | driver | pool attached, no client yet |
| 4 | customer-web | per-surface constant |
| 5 | customer-mobile | per-surface constant |

⚠ **Rollback is a client constant, never a Terraform apply.** The triggers stay attached and dormant —
they fire only for `CUSTOM_AUTH`. Both flows coexist during rollout (FR-033). The drill is rehearsed
at stage 1, while it is cheapest to discover it does not work.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **DynamoDB introduced** — the constitution locks "Database: PostgreSQL 16" | One hourly counter per address (FR-012). WAF cannot see email addresses, so this cannot be pushed to the edge. Native TTL, atomic conditional update (⚠ Cognito *may retry* a trigger, and a naive `ADD 1` burns a shopper's budget for one email), single-digit-ms inside a **5 s hard timeout** shared with an SES send. | **PostgreSQL** — ⚠ edge Lambdas reach it today *only because the dev DB is publicly accessible* (`db_allowed_cidrs = ["0.0.0.0/0"]`), which `infra/envs/dev/edge-network.tf` records as **invalid for prod**. Sign-in on that path makes the VPC migration an outage. Plus: `connectionTimeoutMillis` is already 5 s — the pool alone can consume Cognito's entire budget — a Sydney round trip is 135 ms, cold start ~1 s, and 027 and 029 both shipped timeouts of exactly this shape. **PostgreSQL is not displaced**; it remains the platform's database for all product data. |
| **A second datastore's failure mode differs from FR-017** | FR-017's fail-closed rule governs *verification* and is unconditional. The **rate-limit read fails OPEN with an alarm**. | Failing it closed makes a DynamoDB blip a sign-in outage for all four audiences. This is anti-abuse, not authorization — but a reader would fairly read FR-017 as covering both, so it is written down rather than left to inference. |
| **One trigger set serves four pools** (shared fate) | Three-to-four Lambdas instead of twelve-plus, on a solo-maintained platform where Principle VI's greppable wiring is itself a safety property. `event.userPoolId` makes per-audience behaviour a branch. | Per-pool function sets would remove shared fate but quadruple the deploy surface. ⚠ **Accepted risk**: a bad deploy breaks all four audiences at once, including the admin console. Mitigated by staged attachment (an unattached pool is wholly unaffected), per-pool rollback via a client constant, and alarms on trigger error rate. |
| **`scripts/verify-pool-credentials.sh` is modified by the feature it guards** | ⚠ It greps only for `ALLOW_USER_SRP_AUTH\|ALLOW_USER_PASSWORD_AUTH\|ALLOW_ADMIN_USER_PASSWORD_AUTH`. **`ALLOW_CUSTOM_AUTH` is absent**, so it would report ✓ PASS while four pools gain a new first-factor flow — the exact failure its own header warns about, and one it has **already suffered once**. It also never checks the two mobile clients. | Leaving it unmodified ships a green tick over an unreviewed widening of the platform's auth surface. The extension is written **before** the flows change, and proved by deliberately breaking it. |
| **The customer pool keeps `ALLOW_USER_AUTH`** — so the managed 8-digit flow stays reachable by raw API on that one pool | Passwordless `SignUp` requires it (*"you can only create a passwordless user when passwordless sign-in is available"*). The internal pools have no self-signup and drop it entirely — they land clean. | ⚠ **A random throwaway password at sign-up was rejected for a non-obvious reason**: it would break 012's set-first-password flow, which calls `ChangePassword` **without** `PreviousPassword` and only works on an account with no password — and would desynchronise `public.customer.has_password`. A fix that silently breaks a shipped security control is not a fix. **T003** tests a sign-up-only app client; if it fails, this is an accepted, recorded consistency gap (the bypass yields a *stronger* 8-digit code with Cognito's own throttling, so it is not a privilege escalation). |

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | ⚠ **The 8-digit premise is not in any AWS document** | **T001 measures it first.** If sign-in is already 6, stop and return to the spec. |
| 2 | ⚠ **Existence parity leaks via latency** — a phantom send skips SES and returns measurably faster, so existence leaks despite identical bodies | The phantom path **calls SES too**, to the mailbox simulator, so timing matches naturally rather than via a guessed sleep. The counter is written for unknown addresses. **T002** measures both latencies. |
| 3 | ⚠ **`email_verified` silently missed** — nothing breaks until Google linking refuses, possibly weeks later | Its own `PostAuthentication` trigger, its own metric, and quickstart §5 check 11. Called out in research R7 as the most likely delayed failure in the slice. |
| 4 | ⚠ **Three silent client breakage sites** — Kotlin `else ->` and Swift `default:` produce no compile error, only a runtime dead end | Model the new step in each app's **`AuthStep` sealed interface**, converting three silent runtime failures into compile errors. |
| 5 | ⚠ **`CUSTOM_AUTH_WITH_SRP` can issue tokens without presenting the challenge** (amplify-android #2566, fixed twice, reported recurring) | Use `WITHOUT_SRP` everywhere; a test asserts the first `signIn` returns the challenge step and **never** `DONE`. |
| 6 | ⚠ **A trigger error's text reaches the user verbatim** | Never throw on a user-data condition; return `answerCorrect: false` or an empty challenge. Throw only on infrastructure failure, with a fixed opaque string. Pinned as invariant 10. |
| 7 | ⚠ **`/search` has 2.1 KB of bundle headroom** | The OTP field is a plain input with **zero new dependencies**. Measure in §3, never raise the limit. |
| 8 | ⚠ **SES is the single point of failure** — under this design, no email means no sign-in, with no password fallback for three audiences | `make mail-verify` before each stage; SES **production access is a hard prerequisite** before the customer audience; the existing bounce/complaint alarms become sign-in alarms. |
| 9 | ⚠ **No automated way to read a sent email exists anywhere in this repo** | Stated plainly rather than papered over: security logic is proven by exhaustive unit tests needing no AWS; completing a real sign-in stays an **operator step**, per this repo's deliberate practice (research R16). |
| 10 | ⚠ **Cognito enforces no attempt cap of its own** — 10 req/user/sec permits ~3,000 guesses per code lifetime | `DefineAuthChallenge` is the only control. Off-by-one asserted by test; `issueTokens` guarded on `challengeName`. |

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1. **No new violations.** Three notes:

- **Principle II strengthened by the design**, not merely satisfied: promoting the OTP field into the
  shared packages removes the third divergent implementation. ⚠ This feature exists *because* one
  surface wrote its own — leaving that unfixed would guarantee a recurrence.
- **Principle IV**: the design touches no isolation rule; the amendment is a wording clarification and
  is scoped as PATCH. Recorded in § Governance with its dependent updates.
- **Principle VII**: metrics are `userPoolId`-dimensioned only, and FR-014's no-secrets rule is
  extended explicitly to telemetry — a metric label is as much a log as a log line.

Complexity Tracking carries **five** entries, each with the simpler alternative and why it fails. The
DynamoDB and `ALLOW_USER_AUTH` entries are the two a reviewer should challenge hardest.
