# Specification Quality Checklist: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-31
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

**Status: 16/16 passing.**

## Notes

### Validation iteration 1 (2026-07-31)

15/16. The spec named no language, framework, component library or API; the product-domain nouns that appear
("Home tab", "Search screen", "product tile", "pull-to-refresh") are user-visible things the shopper
interacts with, not implementation choices. Success criteria were stated as shopper-observable outcomes
(taps, swipes, seconds, viewport fractions, tester pass rates) with no system-internal metrics.

The single failing item was three open [NEEDS CLARIFICATION] markers, all scope-level, each with no
defensible default.

### Validation iteration 2 (2026-07-31) — all clarifications resolved

**Q1 → search interaction model (FR-008…FR-012a).** Tapping Home's search entry takes the shopper **straight
to the Search screen** with the field focused and the keyboard raised. Home's entry does not accept text.
This keeps exactly one search field in the app — the alternative would have put a second, weaker search (no
filters, no sort, no paging) on the screen the shopper meets first.

**Q2 → banner content source (FR-037…FR-037d, US5).** Banners are **derived from the promotions the
back-office already manages**, shown only when an operator explicitly marks a promotion publicly
advertisable. Three consequences were written in rather than left implicit:

- The advertisable flag is **opt-in, never default** (FR-037a) — private promotions exist (a single
  customer's goodwill credit, a partner code), and defaulting to public would hand every shopper a discount
  meant for one.
- The banner needs **shopper-facing wording** distinct from the promotion's internal code (FR-037b) — an
  operator's identifier is not a sentence a shopper can read.
- Withdrawal, expiry and exhaustion take a banner down **without an app release** (FR-037c, SC-014).

This makes the slice **two-surface**: a small back-office addition alongside the mobile work. Recorded in
Assumptions so planning does not discover it late.

**Q3 → best sellers deferred (FR-038, FR-039, Out of Scope).** The requested "best sellers" section is out.
The store exposes no purchase-popularity ranking, and the spec's own honesty rule forbids a section title the
data cannot back. FR-038 generalises that into a standing rule; FR-040 keeps adding it later a new section
rather than a rebuild. US5 was reused for the operator half of banners, so the story count and numbering stay
contiguous.

**Re-verified after the edits**: no [NEEDS CLARIFICATION] markers remain; FR-001…FR-047 (with FR-012a and
FR-037a–d) are contiguous with no gaps or duplicates; SC-001…SC-016 are all measurable and
technology-agnostic. Every item that passed in iteration 1 was unaffected by the three answers and still
passes.

### Governance note (not a defect)

This feature **reverses feature 026's FR-025a for the Home tab**. That is stated in the spec's Context
section and bound by FR-003, with SC-002 (a real product visible without scrolling) and SC-006 (the last
section within four swipes) retained as the guard rails protecting what 026's decision was protecting. It is
recorded rather than made silently so that a later reader can see the trade was deliberate.
