# Specification Quality Checklist: Customer Cart — Persistent, Synced & Complete

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-30
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — FR-066 resolved 2026-07-30 (back-office console screen)
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

## Validation notes (iteration 1)

Issues found and fixed while writing:

1. **"Optimistic local mirror" leaked the mechanism.** The user's chosen sync model names a technique.
   Rewritten as outcomes: FR-014/FR-015 (immediate reflection, count correct without a round trip),
   FR-016 (coalescing), FR-017/FR-018 (retained, applied exactly once). The *how* belongs in the plan.
2. **"Cart revision / version" was almost an implementation detail.** Kept only as an entity attribute
   phrased by purpose ("so a device can tell whether what it holds is current") and as behaviour
   (FR-010), not as a named concurrency mechanism.
3. **Merge semantics were originally "union with max quantity" — a formula.** Restated as the
   observable outcome in FR-011/FR-012 and SC-003, so it is testable without prescribing the operation.
4. **Success criteria contained one technical metric** ("no more than two requests to the platform",
   SC-005). Retained deliberately: it is the only honest way to verify the *efficiency* requirement the
   user asked for, and it is observable from outside without knowing the implementation.
5. **Minimum-order scope was ambiguous** (whole cart vs per anonymous package). Resolved as a
   documented assumption rather than a clarification marker — the whole-cart reading is the one
   consistent with "one Effy cart, one total", and the alternative is recorded as future work.
6. **Promotional codes have no existing platform concept** — no promotion engine, no minimum-order
   field anywhere. This is flagged in the plan-facing notes and is the source of the single remaining
   clarification (FR-066): where an operator creates codes materially changes the size of this slice.

## Validation notes (iteration 2)

FR-066 resolved by the operator: **promotional-code administration lives in the back-office console**
(option a). Consequences folded into the spec:

- New **User Story 10 — Run a promotion**, the operator's journey, independently testable.
- **FR-066…FR-072** replace the clarification marker: a managed console area, usage visibility, edits
  constrained once a code has been used, disable-not-delete, attribution, and definition validation.
- **SC-020 / SC-021** make the operator path and the invalid-definition refusals measurable.
- Assumptions record that **the back-office console is a third surface in this slice** — this is the
  single largest scope consequence of the decision and the plan must size for it.

All checklist items now pass. Spec is ready for `/speckit-plan`.

## Notes

- Three surfaces are in scope: `customer-mobile`, `customer-web`, and `back-office` (promotions only).
- The plan must confront two things the spec deliberately leaves open, both of which are *how* questions:
  the sync mechanism that satisfies FR-006…FR-020, and where the promotion entity's authority lives given
  Effy's hot-path/cold-path split (the cart is hot-path by the routing law; promotions administration is
  internal-operator CRUD, which is cold-path by the same law — so one concept is read by both paths).
