# Specification Quality Checklist: Customer Mobile Foundation (Bootstrap)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Validation pass 1 (2026-07-14) — one failure, fixed

**"No implementation details" FAILED on the first draft.** The feature request is *made of* technology —
a 40-line library list, two named SDKs, a named build plugin, two named config files. Writing a spec from
it without carrying that in was the whole difficulty.

**Fix**: the technology was **not deleted** (that would lose real operator decisions). It was moved,
verbatim and unedited, to [planning-inputs.md](../planning-inputs.md), which is binding input to `/plan` —
the artifact that is *allowed* to hold HOW. `spec.md` carries a note at the top saying exactly this, so a
reader who expects to see the stack knows where it went and why.

Re-validated after the move: `spec.md` names **no** language, framework, SDK, library, or file format. The
closest it comes is FR-042's distinction between "a value whose disclosure grants capability" and "a public
identifier a mobile client must carry" — which is a **security property**, not an implementation detail,
and it is stated in exactly those terms.

### Three clarifications resolved with the operator, not guessed

Recorded in spec § *Clarifications* (session 2026-07-14): **Google parked** (mirroring web), **telemetry
deferred**, **done = runs on device + simulator**.

### One deviation, carried openly rather than buried

**Principle VII** requires crash reporting and product analytics on every mobile surface. This slice defers
both. That is written into spec § *Constitution Impact* as a **⚠ DEVIATION, taken knowingly**, and the plan
is **required** to carry it in Complexity Tracking with a justification and a named closing slice.

A deferred requirement that nobody wrote down is just a requirement that was dropped.

### Clarify pass (2026-07-14) — re-validated 16/16, and one defect caught

Four ambiguities resolved with the operator and integrated: **the deferred sign-in trigger** (Account, not a
placeholder checkout), **the guest home** (honest empty state, zero mock data), **session lifetime** (30 days
of inactivity), **barred mid-session** (refuse, then destroy the local session).

**The first of those was a real defect, not a preference.** US3 required the app to defer sign-in to "the one
action that genuinely requires an account" — and the spec **never named that action**, because mobile has no
cart or checkout to hang it on. The acceptance scenario was therefore **untestable as written**. It now names
Account, and FR-002b bounds it: exactly one such action exists, and zero others.

**A second defect was caught by the ambiguity scan.** FR-027/US5 had inherited 012's **pre-amendment** wording
("signs out every *other* device, preserving this one"). 012 amended that during planning because it is **not
expressible** — the identity service revokes all-or-nothing. Left standing, this spec would have asked for a
behaviour that cannot be built, and the likeliest outcome is the one 012 named: it quietly degrades to
*revoking nothing*, and ghost sessions ship. Corrected to the amended requirement (everything goes, including
this phone), with the reasoning recorded inline so the next reader does not "fix" it back.

Requirements grew 44 → 49; success criteria 18 → 21. Checklist re-validated after the rewrite: **16/16 still
passing**, no regressions.

### Plan pass (2026-07-14) — two more spec defects caught by research, both fixed in the spec

Planning ran four parallel research streams (repo integration, Amplify native SDKs, CMP/iOS/Nav3, contract+token
sharing). Two of them turned up **requirements that could not be built as written** — same class of defect as the
clarify pass, caught one artifact later:

- **FR-027** still carried 012's **pre-amendment** "sign out every *other* device" wording in one place the clarify
  pass had already corrected elsewhere. Reconciled: **every session, including this phone** (Cognito revokes
  all-or-nothing).
- **FR-019a** asked for a **"30 days of inactivity"** window. Research confirmed against AWS docs that **Cognito has
  no inactivity window at all** — the refresh credential expires a fixed period *after sign-in*. Unbuildable, and it
  would have signed out a daily-active customer. Corrected to **90 days from sign-in** (operator decision), with the
  reasoning recorded inline.

Both fixes live in `spec.md` (Principle I: fix the earliest affected artifact), not in the plan. Checklist
re-validated against the corrected spec: **still 16/16.**

### Two deviations, both recorded rather than waived

The plan carries **two** knowing constitution deviations, each in Complexity Tracking with a **named closing
slice**: **Principle V** (iOS ships Material 3, not HIG — closing slice `iOS native shell`) and **Principle VII**
(no telemetry — closing slice `customer-catalog`). Neither required a constitution amendment; the constitution keeps
telling the truth about what is owed, and the plan records the debt. This satisfies the "no [NEEDS CLARIFICATION]"
and "scope bounded" checklist items rather than contradicting them — a recorded, bounded, reversible deviation is a
decision, not an ambiguity.

### Two dependencies that can invalidate design, flagged loudly

The spec's hardest requirement — **FR-024**, the emailed-code step-up before a first password — rests on the
**two unresolved spikes from 012 (T001/T002)**. Both are recorded in § *Dependencies* as **binding on this
surface and able to change its design**. Neither 011's nor 012's backend is deployed yet, so this app's
account features **cannot be signed off live** until those operator runs complete. That is stated, not
assumed away.
</content>
