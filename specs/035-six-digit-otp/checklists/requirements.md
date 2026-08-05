# Specification Quality Checklist: Platform-Wide Six-Digit One-Time Codes

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-03
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

### Validation iterations

**Iteration 1 — three failures found and fixed:**

1. **Implementation details leaked into the spec.** The draft named the identity provider, its
   Lambda trigger names, the SDK flow-type constants, and the storage technology. All were rewritten
   in vendor-neutral terms ("the identity provider", "the platform owns the code itself", "the store
   holding in-flight codes"). The *constraint* is retained because it is the business justification
   for the feature's cost — a reader must understand why a two-digit change is expensive — but the
   *mechanism* is deferred to `/speckit-plan`.
2. **Two success criteria were technology-flavoured.** An earlier SC referenced trigger invocation
   counts and another referenced a specific datastore's TTL behaviour. Replaced with SC-005
   (attacker-facing outcome) and SC-006 (refusal rate), both verifiable without knowing the design.
3. **Three requirements were untestable as written** — "codes should be secure", "rate limiting must
   be adequate", "the flow should be observable". Replaced with FR-007 (CSPRNG, full space incl.
   leading zeros), FR-008/FR-011/FR-012/FR-013 (named numeric limits), and FR-014 (no readable code
   in any record, verified by SC-008).

### Deliberate choices a reviewer should check rather than assume

- **The numeric values in FR-008 (5 min), FR-011 (3 attempts) and FR-012 (5 sends/address/hour) are
  stated rather than deferred.** They are set inside the identity provider's own published bands for
  the equivalent managed controls, so the change is not a loosening. They are testable as written and
  explicitly tunable during planning — but a vague requirement here would have failed the
  "testable and unambiguous" gate, and vague rate limits are how rate limits end up absent.
- **No [NEEDS CLARIFICATION] markers were raised.** Two candidates were considered and resolved with
  documented assumptions instead:
  - *Should the four already-6-digit codes also move to the platform-owned flow, for one mechanism
    everywhere?* Resolved to **no** (FR-003) — the user asked for 8→6, those are already 6, and
    moving them would multiply the blast radius of an auth change for no user-visible gain.
  - *Should auto-sign-in-after-sign-up be preserved by other means, or given up?* Resolved as an
    explicit either/or in FR-041 rather than a blocking question, because both readings deliver a
    working feature and the choice is cheap to make during planning.
- **FR-037 (measure before building) is a requirement, not a note.** The 8-digit premise could not be
  found in any official vendor document — it rests on vendor engineers' public statements and this
  platform's own observation. Given 029's precedent (a contract test that pinned a payload no code
  ever emitted), the measurement is treated as gating work.
- **FR-030's "the work stops" is deliberately absolute.** The four identity pools hold every real
  account on the platform. This mirrors the standing operator rule already recorded in five places
  across the infrastructure.

### Open items for `/speckit-plan` — not spec gaps

- Which storage holds in-flight codes, and how its availability failure maps to FR-017's fail-closed
  requirement.
- Whether one shared set of platform-owned challenge handlers serves all four audiences, or one per
  audience — a cost/blast-radius trade, not a requirement.
- The rollout sequence across audiences and surfaces (the spec assumes internal-first and per-surface
  reversibility in FR-033; it does not fix the order).
- Whether the governing principle needs an amendment or only a confirmation (FR-040 requires the
  question be settled, and does not pre-judge it).
