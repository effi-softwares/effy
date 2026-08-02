# Specification Quality Checklist: Customer Saved Items — Watchlist, Guest Saving & Zone-Aware Purchasability

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-02
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

## Validation Notes

**Iteration 1 — two items initially failed, both fixed in place:**

1. **"Success criteria are technology-agnostic" — FAILED.** SC-005 originally read *"…using no more
   than one additional membership lookup for the whole screen"*, which prescribes a solution shape
   (a bulk membership read) rather than a shopper-visible outcome. Rewritten as a first-display-time
   measurement at two screen sizes, which tests the same property without naming the mechanism.

2. **"No implementation details" — FAILED.** FR-021 originally read *"the personalised portion must
   be separable from the shared portion"* — an architectural instruction, not a requirement.
   Rewritten to state the outcome it was protecting: storefront content must not get slower for
   shoppers who are not signed in, and content identical for every shopper must not start behaving
   as though it differs per shopper. FR-020 was likewise rewritten from "MUST NOT require a separate
   request per product" to a cost-does-not-grow-with-product-count statement.

**Zero [NEEDS CLARIFICATION] markers were needed.** The four decisions that would have warranted them
(scope model, guest saving, extent of the rewrite, notification scope) were settled with the operator
before drafting. Ten further judgement calls are recorded in the Assumptions section with reasoning,
rather than deferred — most consequentially: the cap values, undo restoring original list position,
the guest→account join being automatic-and-disclosed rather than confirmed, price rises not being
badged, and previously saved data being discarded rather than migrated.

**One item deserves attention at planning time, though it passes here:** SC-009 (the colour-free
distinguishability of saved vs unsaved) is an observer test, not a machine check. The monochrome
design language leaves the control with no colour cue at all, so it is a real design risk carried
into planning deliberately rather than assumed away.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
