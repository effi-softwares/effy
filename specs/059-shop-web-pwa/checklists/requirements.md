# Specification Quality Checklist: Shop Console as an Installable, Notifying Production App

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-19
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — all 3 resolved by operator decision 2026-09-19
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

### Iteration 1 — findings and fixes

1. **Tech leaked on the first pass.** "Service worker", "manifest", "VAPID" and "FCM" appeared in
   early drafts of the requirements. All removed — they are the *how*, and they belong in
   `/speckit-plan`. What survives is the user-visible consequence: the console is installable
   (FR-001), opens without browser chrome (FR-002), stays current (FR-009…FR-011).

2. **One platform constraint was kept, deliberately, because it is a product fact and not a
   technical one.** On Apple tablets — which is what this audience uses — notification permission
   cannot be requested until the console is installed to the home screen. That is why US2 is P1 and
   not a convenience, so it is stated in the Assumptions and in US2's own rationale. Removing it
   would make US2's priority look arbitrary.

3. **"Every feature should work exactly" was nearly dropped as unmeasurable.** It is now US6 +
   FR-038…FR-040 + SC-010/SC-011, measured against the shop capability parity register, which is an
   artifact that already exists. Its scope was Q1 below.

4. **The three markers raised were scope questions, not gaps.** Each carried a stated default, so
   the spec was complete without them; answering them narrowed or widened the slice. See iteration 2.

### Iteration 2 — clarifications resolved

All three questions were answered by the operator on 2026-09-19 and written into the spec's
**Decisions taken** table.

| # | Requirement | Decision | Spec change |
|---|---|---|---|
| Q1 | FR-038 | Verify + fix what the register already claims | FR-038 narrowed; **FR-038a added** — a capability marked delivered on a passing suite alone does not satisfy the walk |
| Q2 | FR-036 | Refuse writes while offline | FR-036 given its reason (no conflict rule exists for a late pick); queuing stays in Out of Scope |
| Q3 | FR-017 | All four attention conditions notify | FR-017 widened; **FR-017a added**, FR-020 and FR-024 strengthened — the four must be independently switchable and independently bounded |

⚠ **Q3 raised the risk rather than lowering it, and the spec now says so.** With all four conditions
notifying, the hygiene requirements stopped being precautionary: the two stock conditions can stay
true for days while the two order conditions resolve within the hour, so a single stock count could
produce dozens of interruptions and train the operator to dismiss the one notification that mattered.
FR-017a, FR-020 and FR-024 exist to make that unrepresentable.

### Validation result

All checklist items pass. Spec is ready for `/speckit-plan`.
