# Specification Quality Checklist: Suburb-Aware Delivery Location

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-01
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

## Validation Result

**PASS** — all items green. The one open item from the first pass (surface scope) was settled by the
operator as **both customer surfaces, full parity**, and is recorded in the spec's *Resolved Scope
Decisions* section rather than left as a marker.

## Notes for the reviewer

Four judgement calls are recorded here so `/speckit-plan` does not have to re-derive them.

- **"Bottom sheet" is a UX pattern, not a technology.** FR-026 names it because the operator specified
  the interaction shape directly. It constrains presentation, not implementation. FR-032a deliberately
  does *not* extend it to web — the two surfaces reach parity of capability, not of form factor.
- **FR-043 … FR-046 read as constraints rather than capabilities**, which is unusual for a spec. They
  are here because the web storefront's page-weight budget is a **shopper-facing** property (every
  public page carries the affordance, and two routes sit within a kilobyte of the limit), and because
  the honest response to breaching it is to reduce the web presentation rather than widen the
  dependency. Leaving that unstated would let the plan discover it late and quietly choose the other
  way.
- **Five success criteria are observer tests** (SC-003, SC-008, SC-009, SC-011, SC-018) rather than
  machine checks. That is deliberate — each measures whether a person *reads* or *reaches* the right
  meaning, which is the failure mode this feature exists to prevent and which no automated check can
  confirm. They are operator walks and must be listed as such at sign-off, not marked complete on
  reasoning. *(028 marked six verification tasks complete on reasoning and three defects fell out of
  the re-audit.)*
- **FR-002 is load-bearing and easy to get wrong cheaply.** A locality record limited to served areas
  would be smaller, faster, and would silently collapse "we have never heard of that place" into "we do
  not deliver there" — the exact conflation the entire capability exists to prevent. FR-009, FR-012 and
  SC-004 all become unenforceable if it is violated.

## Known limitation carried into the slice

**FR-019 cannot fully hold on mobile.** The mobile delivery location does not survive an app restart
(025's persistence half, met on web and unmet on mobile). So a signed-in mobile shopper who deliberately
switches to a different place is re-seeded from their account default on next launch — the explicit
choice that was meant to outrank it did not survive. It is honoured within a session. Recorded in
Assumptions and in Out of Scope; **not** hidden, and worth re-reading before planning in case the
persistence fix is cheap enough to pull in.
