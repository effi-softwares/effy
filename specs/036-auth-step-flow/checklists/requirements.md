# Specification Quality Checklist: Customer Sign-in & Sign-up — A Stepped Flow

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — all 3 resolved 2026-08-05
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

**Iteration 1 (2026-08-05)** — spec written from four parallel investigations (industry research × 2, customer-web code map, customer-mobile code map, backend/cross-surface constraints).

**Iteration 2 (2026-08-05)** — three clarifications asked and answered; spec updated; checklist now fully passing.

1. **FR-030 — confirm-password: DROPPED**, replaced by a reveal control. The request asked for one, but feature 012's FR-023 forbids it and the account page already omits it. Notably the two customer surfaces disagree today (web asks twice, mobile once) — this settles it by *removing* a field from web, not adding one to mobile. **No amendment to 012 required.**
2. **FR-035a — the name step is REQUIRED**, and is the last thing asked. The account exists and the shopper is signed in before they reach it, so it completes a profile rather than gating access. Abandoning must re-ask, never lock out.
3. **FR-044 — BOTH customer surfaces** (storefront web + mobile app). Internal consoles explicitly out of scope (FR-044a); their own missing resend/countdown is recorded as a follow-on (FR-044b), which matters because those audiences have no password fallback.

Three facts were deliberately **not** raised as clarifications and are recorded as assumptions instead, because the spec has enough to proceed:

- The refusal taxonomy on the code sign-in route is structurally indistinguishable — FR-011 is written to that reality rather than restating 035's unmeetable FR-027.
- "Go to home on success" is narrowed to the deliberate-sign-in case, so the existing return-to-intent behaviour is not regressed.
- First/last name is kept as requested despite naming guidance preferring a single field; the reason is recorded in Assumptions.
