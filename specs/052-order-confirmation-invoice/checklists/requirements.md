# Specification Quality Checklist: Order Confirmation & Emailed Receipt

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-26
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

## Validation notes (iteration 1 → 2)

Three issues were found on the first pass and fixed in the spec:

1. **Implementation leak** — an early draft of FR-006 and FR-019 named the payment provider and the
   mail transport. Both were rewritten to state the capability ("a recognisable, non-sensitive form",
   "the platform MUST send") without naming the mechanism. The Context section retains references to
   *prior features* by number, which is project history rather than implementation detail.
2. **Unmeasurable success criterion** — SC-005 originally read "renders correctly in email clients".
   It now names the conditions that must hold (light/dark, images blocked, plain text, the most
   restrictive rendering engine), which is checkable without knowing how the email is built.
3. **Untestable requirement** — FR-015's colour rule originally said the palette "should stay local".
   It now states four prohibitions and one removability property, each of which SC-010 verifies
   mechanically.

## Open notes

- Three decisions were resolved with the operator before drafting rather than left as
  [NEEDS CLARIFICATION] markers: the legal status of the document, the colour exception, and whether a
  PDF is in scope. All three are recorded in **Assumptions** with their resolution date.
- **FR-034 is deliberately a requirement, not a note.** The gap between this receipt and a compliant
  Australian tax invoice must land in the feature's artefacts during planning, or it will be
  rediscovered by whoever is asked for a tax invoice first.
