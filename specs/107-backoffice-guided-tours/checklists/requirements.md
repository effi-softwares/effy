# Specification Quality Checklist: Guided Tours in Back-Office

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-03
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

- Builds on 106 (shop console): the running, look, auto-start, Help, search and per-person memory are 106's and are
  not re-specified (FR-001). Role names (`admin`, `manager`, `csa`) appear once in Assumptions as the existing role
  identifiers, not as an implementation choice.
- Inventory taken from the live screens on 2026-11-03 (strings swept from every routed screen and the components it
  renders): 49 tours, 273 steps, every title ≤ 40 and text ≤ 220 characters, no tour over 12 steps.
- Role marks follow the Admin and access page's permission table and each screen's own "needs a manager or an
  administrator" wording. To check on the walk: Delivery and Promotions actions for Customer support.
- Decisions taken without a question: tabs with their own sidebar entry are their own tours; record pages run on the
  open record; back-office records are kept apart from shop-console ones (FR-002).
