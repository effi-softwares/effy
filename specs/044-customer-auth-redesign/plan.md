# Implementation Plan: Customer Storefront Authentication — Visual Redesign & Input Repair

**Branch**: `044-customer-auth-redesign` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/044-customer-auth-redesign/spec.md`

## Summary

The storefront's authentication screens got their **flow** from 036 and never got a **look**, or a
**voice for their inputs**. This slice fixes both, and changes nothing else: no step is added, removed
or reordered, no credential changes, no data is stored, and no backend behaviour moves.

Three pieces of work, in priority order:

1. **Rebuild the one-time-code control** so its six positions are visible, aligned with their own
   label, individually indicated, and capable of carrying an error — while remaining **one input** for
   assistive technology. The current control paints its positions as 3px hairlines in the border token
   and, because an inline negative margin overrides one half of a centring rule, shoves them against
   the right edge of the column. That is the screen the operator photographed.
2. **Give every field real validation.** The platform already owns the right email rule — it lives in
   the newsletter Lambda. It is promoted to the shared package and consumed by both, so the client
   refuses exactly what the server refuses. Errors appear beside the field that caused them, in the
   platform's own treatment, on blur and on submit; unavailable actions become focusable and say what
   is missing rather than silently doing nothing.
3. **Make the screens look like Effy** by composing the storefront's existing type, control, field and
   spacing definitions instead of the five local copies these screens declare today — plus a
   full-height mobile column with a keyboard-safe action area, and a composed two-part desktop layout.

Two register items (D-11, D-21) could not be confirmed by reading the code and are verified against a
running build **before** anything is changed, with the result written down either way.

## Technical Context

**Language/Version**: TypeScript 5.x, React 19.2, Next.js 16.2 (App Router, Cache Components / PPR).
Node 22 toolchain.

**Primary Dependencies**: none added. Existing: `@effy/design-system` (tokens + `ui` primitives),
`@effy/shared-types`, `aws-amplify` (already quarantined inside `app/(auth)/`), Tailwind v4. **No form
library, no OTP library, no validation library** — see research R1/R3.

**Storage**: none. This feature persists nothing. No Goose migration, no schema change.

**Testing**: Vitest + Testing Library (`apps/customer-web`, `packages/web-kit`), Playwright e2e
(`apps/customer-web/e2e/`), plus the repository's mechanical gates — `pnpm -r typecheck`,
`pnpm -r test`, `depcruise` (the Amplify quarantine), `scripts/bundle-budget.mjs` (9 guest routes /
174 KB), `packages/design-system/scripts/check-tokens.mjs` (AA contrast + token guards),
`tokens:check` (Compose theme drift), `check-no-emerald` / `check-no-jade`.

**Target Platform**: web browsers, 320px → 1440px+, light and dark, with an explicit obligation at
320px (FR-026) and under a software keyboard (FR-027).

**Project Type**: web front-end slice inside the monorepo, touching one shared UI package, one shared
types package, and — for a constants extraction only — one cold-path Lambda.

**Performance Goals**: no measurable change. The guest bundle must not grow (SC-012); the auth routes
are not in the budgeted set but must not regress the barrel that budgeted routes reach.

**Constraints**: guest first-load JS ≤ 174 KB on all nine measured routes; WCAG AA with zero exemptions
(the platform's own rule, mechanically enforced); minimum touch target 44px; monochrome ramp plus the
two semantic colours only; the Amplify quarantine must stay clean; the two internal consoles must be
provably undisturbed.

**Scale/Scope**: 7 screens (sign-in ×3 steps, sign-up ×3 steps + name step, reset ×3 steps, callback),
1 shared UI control, 1 shared constant pair, ~12 files edited, 3 created.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1. Result: **PASS**, with one recorded
deviation (Complexity Tracking).*

| Principle | Assessment |
|---|---|
| **I — Spec-Driven** | `spec.md` committed with a validated checklist; this plan cites it; `tasks.md` follows. The two unverified defects are handled by returning to observation before code, not by patching around them. **PASS** |
| **II — Monorepo & Shared Contracts** | This principle is the *reason* for two of the changes. The email rule is promoted out of the newsletter Lambda into `@effy/shared-types` rather than copy-pasted (R2); the auth screens stop declaring their own field/button/heading primitives and compose the storefront's (R5). The code control stays in `@effy/design-system`, shared with the consoles. **PASS — and improved** |
| **III — Dual-Path Backend** | **Neither path.** No handler, no Lambda, no endpoint, no migration. The single backend file touched (`newsletter/service.ts`) has two locally-declared constants replaced by an import of the same values; behaviour is unchanged and its existing tests are the proof. Declared explicitly per the principle's requirement (R14). **PASS** |
| **IV — Auth Isolation** | Untouched. No pool, client, issuer, token or claim changes. The customer pool's three credential routes are unchanged. Enumeration defences (FR-044) are carried as hard constraints and their invariance test stays green. **PASS** |
| **V — Design & Consistency** | Monochrome ramp + the two semantic colours only; no new token, no new hue (FR-031, verified by `check-tokens.mjs` and the retired-hue sweeps). Reference platforms are named and used (Uber Eats/Instacart for the stepped mobile flow, eBay for field and error treatment). **No card layout** is introduced — the form is a column, not a bordered tiling container, and there are no metric cards; the escape clause is not invoked. Dark mode is a first-class requirement of the slice, not a pass at the end. **PASS** |
| **VI — Layered Architecture** | Presentation-layer only. No repository, no service, no DI. Client state stays unidirectional and local to the step; **no server data is hand-cached in component state** — the only new state is per-field validity, which is genuine client state (see `data-model.md`). **PASS** |
| **VII — Observability & Telemetry** | Three product events declared (R13). Stated plainly: PostHog is still not initialised on `customer-web`, so they will not fire — which is why **no success criterion in this slice is measured through telemetry**. No metrics or alerts, because no backend behaviour is added. **PASS, with the platform gap restated rather than implied** |
| **Real-World Identifiers** | No new address, domain, phone or endpoint. The existing customer-facing mailbox `hello@effyshopping.com` on the code screen is unchanged and already approved. **PASS** |
| **Quality Gates** | Every gate in the repository runs; three are load-bearing for this slice's success criteria (bundle budget → SC-012, `check-tokens` → SC-007, the consoles' unmodified tests → SC-011). **PASS** |

**Post-Phase-1 re-evaluation**: unchanged. The Phase 1 design introduces no new package, no new
dependency, no new endpoint and no new token. The one deviation identified before Phase 0 (no form
library) survived the design and is recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/044-customer-auth-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 — R1…R15
├── data-model.md        # Phase 1 — transient client state only; no persistence
├── quickstart.md        # Phase 1 — the verification walk
├── contracts/
│   ├── otp-cells.contract.md      # the shared code control's contract, incl. the console lock
│   └── auth-validation.contract.md# the shared email rule + per-field validation contract
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
├── BASELINE.md          # created by the first task — the D-11 / D-21 observation
└── tasks.md             # /speckit-tasks output — NOT created here
```

### Source Code (repository root)

```text
packages/design-system/
├── src/ui/otp-input.tsx                  # EDIT — rebuild the `cells` variant (R1). `plain` untouched.
└── scripts/check-tokens.mjs              # EDIT — amend the monospace guard's rationale (R1)

packages/shared-types/
├── src/validation.ts                     # NEW — EMAIL_SHAPE, EMAIL_MAX_LENGTH, isEmailShape (R2)
└── src/index.ts                          # EDIT — export it

apis/edge-api/customer/
└── src/newsletter/service.ts             # EDIT — import the shared rule instead of declaring it (R2)
                                          #        behaviour unchanged; existing tests unmodified

apps/customer-web/
├── app/(auth)/
│   ├── layout.tsx                        # EDIT — composed desktop layout + brand panel slot (R9),
│   │                                     #        svh/dvh column, surface → bg-background (R5)
│   ├── _components/
│   │   ├── AuthKit.tsx                   # EDIT — compose components/storefront/kit.tsx (R5);
│   │   │                                 #        aria-disabled actions (R4); one error region (R6)
│   │   ├── CodeStep.tsx                  # EDIT — single error region, subordinated advisory stack,
│   │   │                                 #        in-flight indication (D-05/D-06/D-07)
│   │   ├── NameStep.tsx                  # EDIT — stacked on small screens (D-19), skip route (D-15)
│   │   ├── BrandPanel.tsx                # NEW  — the desktop composition's second part (R9)
│   │   └── ReasonNotice.tsx              # NEW  — closed-vocabulary interruption notice (R7)
│   ├── _lib/
│   │   └── validation.ts                 # NEW  — per-field rules + touched/error state (R3)
│   ├── sign-in/{page,SignInForm}.tsx     # EDIT — validation, reason notice, skeleton shape
│   ├── sign-up/{page,SignUpForm}.tsx     # EDIT — validation, skeleton shape
│   └── reset-password/ResetPasswordForm.tsx  # EDIT — validation, single error region
├── components/storefront/kit.tsx         # READ-ONLY — the primitives being composed
└── e2e/                                  # EDIT/NEW — otp-entry, a11y, and a new auth-validation spec

packages/web-kit/src/console/OtpSignInCard.test.tsx   # MUST PASS UNMODIFIED (SC-011)
```

**Structure Decision**: this is a **presentation slice inside `apps/customer-web`**, with two
deliberate reaches outside it, each justified by Principle II rather than convenience:

- **`packages/design-system`** — because the code control is genuinely shared with the two internal
  consoles. Fixing it in the app would mean forking it, which is the exact thing the package exists to
  prevent. The `variant` parameter already isolates the consoles, and R11 makes that isolation
  provable rather than assumed.
- **`packages/shared-types`** — because the email rule is cross-cutting and already exists once. The
  alternative is a second copy in the storefront that can disagree with the backend about what a valid
  address is.

Everything else stays inside `app/(auth)/`, which is also what keeps the Amplify quarantine intact.

## Implementation phases

**Phase 0 — Baseline (blocking).** Run the storefront, walk the five email entry points and the phone
keyboard case, and write `BASELINE.md`. D-11 and D-21 are recorded as confirmed or not-reproduced,
with what was actually seen. Nothing is edited first — a "fix" for a defect nobody has observed is a
change with no evidence behind it.

**Phase 1 — The shared code control (US1, P1).** Rebuild the `cells` variant (R1). Unit tests for the
cell count, the single-node invariant, the active indicator, the error state and the long-paste
signal. Run the consoles' tests **unmodified** and both console builds. Measure the bundle.

**Phase 2 — Validation (US2, P1).** Promote the email rule (R2); build the validation module (R3);
wire all five entry points; convert committing actions to `aria-disabled` (R4). Update the tests that
assert `disabled` — deliberately, as a contract change.

**Phase 3 — Look and layout (US3, P2).** Compose the kit primitives (R5), the mobile column and sticky
action area (R8), the desktop composition and brand panel (R9), heading scale, alignment, skeletons,
the name step's small-screen stacking.

**Phase 4 — Journey copy (US4, US5, P3).** The reason notice (R7) and the name step's skip route.

**Phase 5 — Verification.** The full gate sweep, the responsive and dark-mode walk, the screen-reader
walk, the colour-removed walk, and the observational criteria (SC-001, SC-002, SC-016) which need
people and cannot be claimed from a green suite. 039's lesson stands: layout, contrast and hierarchy
are not properties a DOM assertion can see.

## Risks

| Risk | Handling |
|---|---|
| A change to the shared code control locks out `shop-web` / `back-office`, whose emailed code is their **only** credential | The `variant` default isolates them; their tests must pass **unmodified** (SC-011) and both consoles must build. If those tests fail, the change is wrong — they are not edited. |
| The `@effy/design-system/ui` barrel is reached by a budgeted guest route (`/delete-account`), so a bigger control could cost guest bytes | The bundle gate runs on all nine routes and the delta is recorded, not assumed (SC-012). |
| The overlay technique hides text selection and the native caret | Accepted and recorded (R1). A six-digit code is retyped, not partially selected; an explicit active-cell indicator replaces the caret. Checked under `forced-colors` too. |
| `aria-disabled` changes an assertion several existing tests rely on | Listed as an intended contract change in R4, with the tests named. Not a test loosened to make something pass. |
| Composing the kit's `bg-card` field onto a `bg-card` page removes figure/ground | Handled in the design: the auth surface moves to `bg-background` (R5). Verified in the dark-mode and contrast walk. |
| A "redesign" quietly changes flow or copy the platform is constrained to | FR-039 through FR-044 exist for this. The enumeration invariance test and the refusal-copy rules are carried as hard constraints (R15). |
| D-11 turns out not to reproduce, and the slice looks like it fixed something imaginary | Phase 0 writes down what was actually seen. FR-009 is justified independently of D-11 — `name@example` is confirmed, and no inline error exists anywhere. |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **No form library on these forms**, where the constitution's locked web stack names the TanStack suite (and both internal consoles use it) | The entire requirement is per-field touched/valid/message state across five short forms — roughly forty lines. `apps/customer-web` is deliberately dependency-lean; 019 shipped its cart on `useSyncExternalStore` for the same reason, and this app carries the platform's only bundle budget. | Adding TanStack Form would put a dependency into the one app that most carefully refuses them, to solve a problem it does not have. Rejected on proportionality, and recorded here rather than taken silently. |
