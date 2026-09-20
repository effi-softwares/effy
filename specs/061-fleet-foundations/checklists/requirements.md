# Specification Quality Checklist: Fleet Foundations — Driver, Vehicle & Shop Location Management

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

**Validation run 1 — issues found and fixed before this checklist was marked:**

1. *"See a vehicle's whole life"* in the input could have been read as telemetry. Narrowed in FR-016 to
   holding periods with dates and odometer readings — no journey, trip or position data, consistent with
   US7 and FR-035/FR-036.
2. Early FR-027 phrasing risked implying a single blocking reason. Rewritten as **every** applicable
   reason (FR-026), because the remedy differs per reason and a first-match list would send an operator
   to fix the wrong thing.
3. SC-007 originally read as an assertion of absence. Rewritten to be **verified by searching the
   platform's own surfaces**, since "we did not build it" is not a testable outcome.

**Zero `[NEEDS CLARIFICATION]` markers.** Four questions that could have been raised were instead
settled as documented Assumptions, because each had a defensible default and a recorded precedent:

| Question | Settled as | Basis |
|---|---|---|
| Is a vehicle holding tied to a duty period? | Independent, with its own start and end | Subsumes the per-shift case rather than assuming it |
| What happens when a driver is stood down holding a vehicle? | Warn, itemise, require an explicit decision | Mirrors the existing stand-down precedent (FR-019) |
| Which licence class covers which vehicle? | All phase-1 vehicles are light; Class C suffices | Verified weight threshold; richer mapping deferred |
| Who sets the expected finish time? | The driver on going on duty; visible to back-office | FR-032/FR-034 |

**Deliberate negative requirements** — FR-031 (no shop coordinates), FR-035/FR-036 (no location
interface or storage) and FR-037 (assigns no work) are requirements about what must **not** exist. They
are stated because the corresponding capability either exists today and is being removed, or would
otherwise be added by resemblance to a neighbouring feature.

**Not blocked by open research items.** Photo retention, Modern Award coverage and the food-safety
temperature question remain unresolved (decisions D17, D19) and none of them are in this feature's
scope.
