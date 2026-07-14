# Implementation Plan: Customer Profile Management

**Branch**: `012-customer-profile-management` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-customer-profile-management/spec.md`

## Summary

Complete the customer account page: identity display (name · email · initials avatar), name editing,
**change-or-set password**, and **sign out** — the last of which does not exist in the storefront at all
today, despite the parity register claiming it does.

The technical shape of this slice is dictated by **two hard constraints discovered in research**, and almost
every decision below follows from one of them:

1. **Cognito will let a passwordless customer's session set a password with no proof of identity at all.**
   `ChangePassword` documents `PreviousPassword` as *"Required if the user has a password. If the user has no
   password… you can omit this parameter."* Left alone, that turns any borrowed session into permanent,
   silent, credentialed access. **FR-017** closes it: setting a *first* password is gated behind a fresh
   emailed code, verified **server-side, in the same request that sets the password** — so there is never a
   standing "you may set a password now" authority sitting around to be stolen.

2. **`aws-amplify/auth/server` has no `signOut`.** It exports exactly three things (`fetchAuthSession`,
   `fetchUserAttributes`, `getCurrentUser`) — verified against the installed package, not assumed. So the only
   Amplify sign-out is the *client* one, and importing it would drop the auth SDK into the storefront's shared
   chunk and detonate 011's quarantine guard. **Sign-out is therefore built server-side**: a Server Action
   clears the Amplify cookies and revokes the session at Cognito directly. The storefront ships **zero**
   additional bytes of auth SDK, and the quarantine holds.

The resulting architecture keeps **all** credential logic on the **cold path** (`apis/edge-api/customer`) and
**all** of Amplify out of the client. The account page's password and sign-out flows are **Server Actions →
edge-api → Cognito**. The browser never talks to Cognito for any of this feature.

**The load-bearing detail that makes it cheap**: the Cognito calls this needs (`ChangePassword`,
`GetUserAttributeVerificationCode`, `VerifyUserAttribute`, `GlobalSignOut`) are **authorized by the user's own
access token, not by IAM** — AWS explicitly does not evaluate IAM policies for them. So the Lambda performs
them **with the caller's token and no new IAM permission at all**. The only new IAM in this slice is
`ses:SendEmail` for the change-notification.

## Technical Context

**Language/Version**: TypeScript 5.x · Node 22 (Lambda `nodejs22.x`, arm64) · React 19.2 · Next.js 16.2.6

**Primary Dependencies**: Next.js App Router (`cacheComponents: true`) · `@aws-amplify/adapter-nextjs` (server
only) · `@effy/{design-system,shared-types,api-client,edge-shared}` · Serverless Framework v3 · raw `pg` via
`@effy/edge-shared` · Terraform (AWS provider)

**Storage**: PostgreSQL 16, `public.customer` — raw SQL, Goose migrations, no ORM. One forward-only migration
adds password-state columns.

**Testing**: Vitest (unit, both sides) · Playwright (E2E, `apps/customer-web/e2e`) · `terraform validate/fmt` ·
shellcheck · **the two existing gates**: `pnpm size` (160 KB guest budget) and `pnpm depcruise` (the Amplify
quarantine). Both must stay green.

**Target Platform**: Next.js SSR on Amplify Hosting (storefront) + Lambda behind the shared HTTP API gateway

**Project Type**: Web (public SSR storefront + cold-path serverless service)

**Performance Goals**: **The guest budget is untouched** — a visitor who never signs in downloads no more than
before (FR-037 / SC-011). The 160 KB guest limit and the Amplify quarantine are **enforced gates**, not
aspirations.

**Constraints**:

- **Amplify quarantine** — `aws-amplify` may be *reached* only from `app/(auth)/`. Enforced by
  dependency-cruiser with `reachable: true` (011 learned the hard way that a direct-import rule misses a leak
  that goes through a component).
- **`cacheComponents`** — request-time data outside a `<Suspense>` boundary is a **build error**. Every
  personalized read stays inside an island.
- **Server Actions are public endpoints** — every one re-verifies the session itself and derives identity from
  the token, never from the request body (FR-035).
- **The routing law (011 FR-028)** — profile/account → cold path. This slice is entirely cold-path and adds
  **no** commerce route.

**Scale/Scope**: One page, one migration, 5 backend routes, one Terraform change (password policy + SES
permission). No new service; no new package.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | How this slice satisfies it |
|---|---|---|
| **I. Spec-Driven** | ✅ | Spec → plan → tasks. Planning found **two spec defects** (FR-024 unbuildable; FR-022 bypassable via recovery) and **went back and amended the spec** rather than quietly designing around them. |
| **II. Monorepo / Shared Contracts** | ✅ | New wire shapes go in `@effy/shared-types` — defined **once**, imported by both surfaces. The breach-check rule is written **once** in `@effy/edge-shared` and used by both the Lambda and the recovery page (R9). A security check that exists in two copies is exactly what this principle forbids. |
| **III. Dual-Path Backend** | ✅ | 100% cold path. Account management is what the cold path is *for*; **zero** commerce routes added. |
| **IV. Auth Isolation** | ✅ | Customer pool only; the gateway's customer authorizer already refuses every other audience. The Cognito writes are **token-authorized (the customer's own token)** — not even an admin API — so this slice adds **less** privilege than 009 did. The v1.7.0 per-audience credential rule is honored exactly: customer keeps password + OTP + (parked) Google; the internal pools stay strictly passwordless. |
| **V. Consistent Design** | ✅ | Built from `@effy/design-system/ui` primitives that **already exist** (`avatar`, `card`, `dialog`, `input`, `label`, `button`). Jade accent, dark mode, 44px targets. No new tokens. |
| **VI. Layered Architecture** | ✅ | Backend keeps the three-layer slice (handler → service → repo, raw SQL, explicit wiring, no DI framework). Frontend keeps server state on the server; no hand-cached server data in component state. |
| **VII. Observability** | ✅ | Structured logs on every password/sign-out path — **never the password, code, or token** (FR-039 / SC-013). PostHog events keyed on the auth subject id only. |

**Verdict: PASS.** No violations → **Complexity Tracking is empty and omitted.**

One thing worth naming rather than burying: this slice **loosens** the Cognito password policy (12 chars, no
composition rules). That is a deliberate move *toward* current NIST guidance, not a weakening — composition
rules are now considered harmful, and the strength they pretended to add is picked up for real by the **breach
screening** the policy cannot do (R8). Principle IV is untouched: the internal pools remain strictly
passwordless, and `make verify-pool-credentials` still asserts it on every run.

## Project Structure

### Documentation (this feature)

```text
specs/012-customer-profile-management/
├── plan.md              # This file
├── spec.md              # Amended during planning (FR-022b, FR-024 / FR-024a)
├── research.md          # Phase 0 — R1..R12: every decision, and what was rejected
├── data-model.md        # Phase 1 — the password-state columns
├── quickstart.md        # Phase 1 — operator runbook + the adversarial proofs
├── contracts/
│   └── customer-account.contract.md   # Phase 1 — the 5 routes, DTOs, and refusals
└── checklists/requirements.md
```

### Source Code (repository root)

`+` = new, `~` = modified.

```text
apps/customer-web/                          # THE SURFACE
├── app/(account)/account/
│   ├── page.tsx                     ~ identity strip + 3 cards (Suspense islands)
│   ├── actions.ts                   ~ updateProfile (exists) + password + sign-out actions
│   ├── IdentityStrip.tsx            + avatar · name · email (server component)
│   ├── ProfileForm.tsx              ~ dirty-guard, inline confirmation, no optimistic update
│   ├── PasswordCard.tsx             + branches on hasPassword — "Set" vs "Change"
│   ├── SetPasswordDialog.tsx        + step-up: request code → (code + new password) in ONE submit
│   ├── ChangePasswordDialog.tsx     + current password + new password
│   └── SessionCard.tsx              + sign out · sign out everywhere
├── app/(auth)/reset-password/       ~ FR-022b: the same password rules on the recovery path
├── components/
│   ├── Avatar.tsx                   + initials avatar (grapheme-safe, neutral fallback)
│   └── header/UserIsland.tsx        ~ account menu + sign-out (server-rendered island)
├── lib/
│   ├── dal.ts                       ~ getSession() must also surface the ACCESS token
│   ├── initials.ts                  + the initials algorithm (pure, unit-tested)
│   └── api/edge.ts                  ~ carry the access token on the privileged header
└── e2e/account.spec.ts              + the adversarial proofs (SC-004, SC-005)

apis/edge-api/customer/                     # THE COLD PATH
├── serverless.yml                   ~ +5 routes, +ses:SendEmail IAM
└── src/
    ├── functions/
    │   ├── customer-me-v1-get.ts            ~ DTO gains hasPassword + passwordUpdatedAt
    │   ├── customer-password-v1-challenge.ts + step-up code
    │   ├── customer-password-v1-put.ts      + set OR change (one route, two modes)
    │   ├── customer-sessions-v1-delete.ts   + sign out everywhere
    │   └── customer-password-reset-confirm.ts + FR-022b (PUBLIC route — no authorizer)
    ├── password/                    + the slice: service.ts (decisions) + cognito.ts (token-authorized)
    └── customer/repo.ts             ~ password-state reads/writes

packages/
├── shared-types/src/customer.ts     ~ CustomerDTO + password DTOs (ONE definition)
├── edge-shared/src/password/        + breach check (k-anonymity) + policy — ONE source (R9)
└── design-system/src/ui/avatar.tsx    (exists — reused, not rebuilt)

db/migrations/
└── 20260714__customer_password_state.sql  + has_password · password_updated_at

infra/envs/dev/auth-customer.tf      ~ password policy → 12 chars, no composition rules
```

**Structure Decision**: **No new app, no new service, no new package.** This slice *extends* the surface and
the cold-path service 011 created — which is what a follow-on slice for the same audience should do. The only
genuinely new shared code is the breach-check module, and it lives in `@effy/edge-shared` precisely so the
storefront's recovery page and the Lambda enforce **the same rule from the same source** (R9). Two copies of a
security check is the failure mode Principle II exists to prevent.

## Phase 0 — Research

See **[research.md](./research.md)**. Twelve decisions; the four that actually shape the build:

- **R1 — Setting a first password is one atomic server call, not a session-scoped grant.** The step-up code is
  verified and the password is set **in the same request**. There is therefore no window in which "may set a
  password" exists as stealable state — **FR-019 is satisfied by construction**, not by a TTL someone has to
  get right.
- **R3 — Sign-out is server-side cookie clearing + Cognito revocation, not Amplify.** Forced by the absence of
  a server `signOut` — and it turns out to be the better design anyway: the quarantine holds and guests pay
  nothing.
- **R5 — `has_password` must be a platform-owned column.** Cognito **cannot be asked** whether a user has a
  password; there is no such API field, and `UserStatus` does not distinguish it. So the record must know —
  which is *why* every path that establishes a password has to go through the platform, and why FR-022b pulls
  recovery into scope.
- **R7 — Revocation is not instant, and the plan says so out loud.** A revoked session's ID token is **still
  accepted by the API Gateway JWT authorizer until it expires** — up to **60 minutes** on the current pool
  config. That is FR-024a's "bounded and stated" window. Shortening it is a real option with a real SSR cost;
  the trade-off is in R7.

## Phase 1 — Design & Contracts

- **[data-model.md](./data-model.md)** — `public.customer` gains `has_password` and `password_updated_at`. Both
  are **platform-owned**, in exactly the sense `status` already is: never written from token data.
- **[contracts/customer-account.contract.md](./contracts/customer-account.contract.md)** — the five routes,
  their DTOs, and (more usefully) their **refusals**. Including the rule that decides S3: the access token's
  `sub` must match the gateway-verified `sub`, or the request dies.
- **[quickstart.md](./quickstart.md)** — the operator runbook, and the **adversarial proofs** for SC-004 and
  SC-005. Those two are the point of this slice and cannot be signed off by inspection.

### Post-design Constitution re-check

**PASS, unchanged.** The design added no DI framework, no ORM, no cross-pool auth, no client-side Amplify, and
no new IAM beyond `ses:SendEmail`. It *removes* a documented lie (the parity register's sign-out row) rather
than adding one.

## Risks & Open Questions

Carried into `tasks.md` as explicit spikes. **S1 and S2 can change the design and must be settled before the
code is trusted** — they are the two 011 left open, now sharpened.

| # | Risk | Why it matters | Mitigation |
|---|---|---|---|
| **S1** | **`ChangePassword` with `PreviousPassword` omitted** is documented in two places but **unproven on our pool**. | It is the entire mechanism for setting a first password. If it fails, the fallback is a recovery-style flow and the UX changes. | **Spike first, live, against dev** (011 T053). No code proceeds until it is proven. |
| **S2** | **`ForgotPassword` for a never-had-a-password customer is unverified** — and that path is **live right now**. | A customer can hit it today from the sign-in page and nobody knows what happens. | Spike (quickstart § Proofs). It also decides whether FR-022b's route can be built as designed. |
| **S3** | The **access token must reach the Lambda**, but the gateway authorizes the **ID** token. | Cognito's token-authorized APIs need the *access* token. A mismatched pair is a data-integrity bug: the record is updated for customer A while Cognito is mutated for customer B. | Carry it in a **separate header**; the Lambda **rejects any request whose access-token `sub` ≠ the authorizer's `sub`**. Non-negotiable, and written into the contract. |
| **S4** | `fetchAuthSession({ forceRefresh: true })` inside a **Server Action** must actually rewrite the Amplify cookies — or a name change never reaches the header greeting (FR-008). | The header reads `given_name` from the **ID token**, not the record. Without a refresh it shows the stale name until the token expires. | Spike. **Fallback**: the header island reads the name from the record instead — correct, but costs a backend call on every signed-in page render. |
| **S5** | **SES must actually send** (FR-017's step-up code; FR-025's notification). | If email does not send, **set-password does not work at all**. | Hard dependency on **010**, whose SES operator steps are still open. Sequenced explicitly in quickstart. |
| **S6** | Breach-list service outage. | FR-022a demands a stated posture, not an accident. | **Fail closed** — refuse the change and say so. Affordable *precisely because* passwords are optional on Effy (R8). |
| **S7** | Loosening the pool password policy is a **live Cognito update**. | A pool *replacement* would destroy every account on the platform. | `password_policy` is an in-place update (not ForceNew), and the pool carries `prevent_destroy`. **Still read the plan; abort on any `-/+`.** |
