# Specification Quality Checklist: Promotional Banner Templates & Home Carousel

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

## Notes

**Status: 16/16 passing.**

### Validation iteration 1 (2026-07-31)

**15/16.** The spec names no framework, language or component. Domain nouns that appear
("back-office", "Home", "promotion", "banner") are things an operator or shopper interacts with, not
implementation choices. Success criteria are stated as observable outcomes — minutes, percentages,
aspect-ratio tolerance, counts of live promotions, tester pass rates.

**Three open [NEEDS CLARIFICATION] markers**, all of which change what gets built:

1. **FR-011 — what the tool produces.** "A fixed-size template for generating the banner" reads two
   ways: the console *composites* a finished picture, or it supplies the canonical canvas plus
   validation for artwork made elsewhere. The first is an image-editing feature; the second is a
   validator. Different slices.
2. **FR-027 — the placement model.** Whether each promotion picks one placement or every advertised
   promotion appears in both. Determines whether "placement" is new operator data or merely a
   rendering rule.
3. **FR-031 — message text vs. artwork.** The sharpest one. A "template for generating a banner"
   implies the message is baked into the picture; **028's FR-033 forbids exactly that**, because real
   text is what keeps a banner legible at large text sizes and reachable by a screen reader. These
   two cannot both hold, and the spec should not pretend otherwise.

**Deliberate scope note (not a defect)**: this feature also closes 028's unwalked operator loop
(US5 / FR-033 / FR-034). 028 shipped that path and never ran it, so no banner has ever rendered —
US5 exists so the claim is finally tested rather than inherited.


### Validation iteration 2 (2026-07-31) — all three resolved

**Q1 → canvas + validator (FR-011, FR-011a).** The console states the canonical size, ships a
**downloadable template file** with the safe area marked, previews, and validates. It does not
composite images.

⚠ **This narrows the original request** — "a template for generating the banner" became a template to
design *from*. Recorded in the spec rather than quietly delivered, because the two readings are
genuinely different features. It solves the problem operators actually have (nobody told them the
dimensions) without building an image editor, and forecloses nothing.

**Q2 → one placement per promotion (FR-027, FR-027a).** Exclusive, with a safe default so an operator
who marks a promotion advertisable without thinking still gets a sensible result. The alternative
needs no new data and is wrong at the only scale that matters: three or four live promotions would
each appear twice on one screen.

**Q3 → live text over artwork (FR-031, FR-031a, FR-031b).** **Upholds 028's FR-033** rather than
reversing it. Two consequences were written in rather than left implicit: the platform — not the
operator — **guarantees contrast** in both appearances, since nobody can be relied on to test their
artwork against every rendering condition; and the tool must **tell the operator the safe area will
carry text**, so they do not place their own headline there and find it double-printed.

**Re-verified**: no markers remain; FR-001…FR-034 (with lettered variants) all testable; SC-001…SC-012
measurable and technology-agnostic. Every item that passed in iteration 1 is unaffected.
