# Specification Quality Checklist: Driver Mobile UI Completion

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-20
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

**Iteration 1 (2026-09-20)** — two clarifications raised, both scope-affecting, both now resolved by
the operator:

1. **Placeholder visibility** → **register only, never marked in the UI.** Screens stay clean for
   review and screenshots. ⚠ Consequence folded into FR-016 and a new US2 scenario 5: with no visual
   marking, a placeholder a driver could act on (ETA, distance, delivery window) must be *omitted*
   rather than invented — the judgement is now the only safeguard. SC-005 was rewritten around the
   register, and SC-015 added to test the omission rule.
2. **Map fidelity** → **OpenStreetMap**, because it needs no vendor key, account or billing. ⚠ The
   platform still holds no coordinates (049 R13: shops have no address, orders are un-geocoded), so the
   cartography is real and the markers are placeholder — recorded in FR-023c and the register. FR-023e
   records the stylised fallback if OSM proves impractical on both platforms, so the Map tab cannot end
   up unfinished either way. FR-023b captures the licence's attribution obligation.

**Iteration 2 (2026-09-20)** — re-validated. Zero markers remain. 7 user stories, 31 functional
requirements, 15 success criteria. All items pass.

Screen names in FR-001 were cross-checked against the design's own enumerated screen list: 46 total,
45 in-app plus `push` (an OS rendering, carved out in FR-002).

Two pre-existing defects found in the 2026-09-20 audit are folded into this feature's requirements
rather than left implicit — the shop-audience sign-in copy (FR-010, SC-008) and the letter-based
navigation glyphs (FR-008).
