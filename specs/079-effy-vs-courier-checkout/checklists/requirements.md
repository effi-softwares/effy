# Specification Quality Checklist: Checkout and Orders — Delivered by Effy vs Courier Delivery

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-09
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

- No markers were raised; five judgment calls were settled by default and are recorded under
  Assumptions for the operator to confirm or overturn in `/speckit-clarify`:
  1. One switch shared with 078 (not a separate one for this feature).
  2. The no-window courier fallback is in scope (P3, off by default).
  3. One platform-wide estimate text now; per-courier-service estimates wait for E6.
  4. Courier parcels move via the hub as "standard" does today until E6.
  5. Orders from before the switch are not relabelled for customers; shops see them as
     Effy driver / Courier by what they effectively were.
- The backlog's E5 prompt was amended on 2026-10-09 for 078's decisions (customer words stay; built
  switched off) before this spec was written.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
