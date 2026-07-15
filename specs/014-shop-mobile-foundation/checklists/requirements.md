# Specification Quality Checklist: Shop Mobile Foundation (Bootstrap)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-15
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

### Validation pass 1 (2026-07-15) — clean

The request carried a technology + infrastructure stack (KMP, Amplify SDKs, the shop pool, a new app client,
the token protocol). As with 013, it was **moved verbatim to [planning-inputs.md](../planning-inputs.md)**,
not deleted, and `spec.md` names no language, framework, SDK, or endpoint. FR-036's "value whose disclosure
grants capability" vs "public identifier a mobile client must carry" is a **security property**, stated as
such, not an implementation detail.

### Two clarifications resolved with the operator, not guessed

Recorded in spec § Clarifications: **telemetry deferred** (mirroring 013, and the shop parity register is
reconciled to say so — otherwise it would overstate mobile delivery), and **done = runs on device +
simulator**. Sign-in method (EMAIL_OTP only) and the login-first model were fixed by the audience and the
request, not open questions.

### Two deviations, carried openly

**Principle V** (iOS renders the shared framework's default design language, not full HIG parity — inherited
from 013) and **Principle VII** (telemetry deferred). Both are in spec § Constitution Impact as ⚠ DEVIATIONS,
and the plan is required to carry them in Complexity Tracking with named closing slices. A deferred
requirement nobody wrote down is a requirement that was dropped.

### One premise the exploration corrected before it reached the spec

The request assumed the customer **two-token** protocol (ID token bearer + `X-Effy-Access-Token`). The shop
audience uses a **single access token** as bearer — verified against `apps/shop-web` and `apis/edge-api/shop`.
That is a HOW detail, so it lives in [planning-inputs.md](../planning-inputs.md) § 4, not the spec — but it is
flagged there loudly so the plan does not reproduce a protocol the shop backend does not use.

### Analyze pass (2026-07-15) — cross-artifact consistency reconciled

`/speckit-analyze` (0 critical) surfaced one HIGH spec-internal drift and a cluster of refinements, all applied:
- **F1 (HIGH)** — **FR-003 was an absolute MUST** ("must follow platform conventions, must not present one
  platform's idioms") that the plan's recorded Principle V deviation (Material 3 on iOS) contradicts. Same gap
  013's analyze pass caught. Fixed: FR-003 split into a **behaviour** MUST (native scroll/back-swipe/text/a11y,
  not exempt) and a **bounded visual exception** (Material 3 chrome, HIG parity deferred to `iOS native shell`).
- **F2 (MED)** — the **design-token source was ambiguous** (per-app generated file vs. the shared package). Settled
  on **reuse**: the shared `packages/design-system/compose/EffyTokens.kt` is srcDir'd into shop-mobile (the same
  file 013 uses), **not regenerated per-app** — one source of truth (Principle II). Plan tree + T013/T017 reconciled.
- **C1/A2 (MED/LOW)** — **SC-003** (adversarial enumeration) and **SC-002** (90 s timing) had only unit / implicit
  coverage; both added as explicit live checks to the operator device matrix (T055).
- **I1 (LOW)** — clarified the **disabled operator** is normally refused at the identity read (→ *Refused*); its
  appearance in the manager gate is **defense-in-depth**, not the primary check.
- **N1 (LOW)** — clarified `ProblemJSON` is re-exported from `problem.ts`, not a `shop.ts` type.

Principle II was independently verified in analyze: the four DTO shapes in data-model.md match `shop.ts` exactly.

### The security core, and its partial-by-design sign-off

The sharpest requirements are the **manager gate** (FR-023–FR-027: role AND status AND shop scope, decided by
the platform, uniform, fail-closed, the hidden control is never the guard) and **cross-pool isolation**
(FR-028). Per 007, the gate's **positive** half needs shop data the back-office creates (009), so live
sign-off is **partial by design** — the negative half (staff, role-less, unassigned manager all refused) is
provable now. This is stated in Assumptions and Dependencies, not assumed away.
</content>
