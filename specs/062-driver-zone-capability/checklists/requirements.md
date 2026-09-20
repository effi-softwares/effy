# Specification Quality Checklist: Driver Zone Capability & Coverage

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

1. An early draft let FR-017 read as "report coverage per zone". Rewritten to require coverage **per
   kind of work**, because a zone served only by drivers cleared to collect is uncovered for delivery
   and a single figure per zone hides exactly that.
2. SC-003 originally asserted that "every zone" includes future zones. Rewritten to be **proven by
   causing it** — creating a zone afterwards and observing the clearance — since a property nobody
   exercises is a claim, not a criterion.
3. SC-009 originally asserted the single-zone field was gone. Rewritten to require **searching the
   platform's own surfaces**, because "we removed it" is not a testable outcome.

**Zero `[NEEDS CLARIFICATION]` markers.** Three questions that could have been raised were settled as
documented Assumptions, each with a defensible default and a precedent in this codebase:

| Question | Settled as | Basis |
|---|---|---|
| Which functions and methods exist? | collect / deliver × standard / same-day | Mirrors the work the platform already models — a package is collected from a shop and delivered to a customer, and its method is set at checkout |
| Does a clearance imply availability? | No — permission, not a promise | Availability is the driver clocking on (established in 061); conflating them would make a cleared driver look available on their day off |
| Who may grant a clearance? | admin/manager; read open to csa | Matches driver and vehicle management exactly |

**Deliberate negative requirements** — FR-024/FR-025 (remove the single zone field and its readiness
reason), FR-026 (assigns no work) and FR-027 (does not change how zones are defined) are requirements
about what must **not** exist. They are stated because the first two describe capability being removed,
and the third would otherwise be added by resemblance: a feature about zones invites re-cutting zones.

**The sharpest requirement is FR-011.** "Every zone" covering zones created afterwards is the one
behaviour whose absence would be **invisible** — a driver would quietly stop being eligible for new
areas, nothing would fail, and nobody would be told. SC-003 exists to force it to be demonstrated
rather than assumed.
