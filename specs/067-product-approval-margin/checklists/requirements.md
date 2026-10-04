# Specification Quality Checklist: Product Approval & Effy Margin

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-04
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

- Three decisions were settled with the operator before writing (2026-10-04) and are recorded at the
  top of the spec: the margin model (shop price + margin = customer price), products already on
  sale stay on sale with "margin not set", and a shop sees its shop price and the customer price but
  never the margin as a figure.
- Five further choices were made as assumptions; revisit with `/speckit-clarify` if the client
  disagrees:
  1. A margin can be a percentage or an amount, per product (FR-029).
  2. Effy can change a live product's margin at any time, effective immediately (FR-032).
  3. Shop-facing money (order view, sales figures) is in shop prices; each order line keeps both
     prices (FR-043, FR-044). This goes beyond the PRD, which named it only as an impact.
  4. The shop's "was" price has the same margin applied (FR-035).
  5. Reviewers do not edit shop content (FR-013).
