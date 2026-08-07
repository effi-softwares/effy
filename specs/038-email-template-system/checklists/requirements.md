# Specification Quality Checklist: Platform Email Template System

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-07
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

## Validation notes

**Three clarifications were resolved with the operator before writing** rather than left as markers —
each was a scope fork whose answer changed large parts of the specification:

1. **Authoring model** → engineers, in the repository. (Ruled out a stored-template console, an
   editor UI, and a migration.)
2. **Provider-sent messages** → in scope. (Added User Story 3, FR-054…FR-057, SC-017, SC-018.)
3. **Template set** → auth set plus one data-heavy commerce proof. (Added User Story 5,
   FR-058…FR-062, SC-015.)

**Deliberate judgement calls, recorded so `/plan` does not relitigate them:**

- **Email-client behaviour is treated as environment, not implementation.** Naming the constraint
  ("a client that strips embedded stylesheets", "an engine that is not a browser engine") is a fact
  about the world the feature ships into, in the same way a browser support matrix is. No authoring
  format, compiler, template language or send mechanism is named anywhere in the specification — those
  are `/plan`'s to choose, and the research to inform that choice is in `research-inputs/`.
- **The design section is intentionally concrete** (exact hex, exact px, exact copy, a wireframe). The
  operator asked for a design that matches the app; a specification that said "consistent with the
  design system" would not be verifiable. Every value is traced to an existing design-system token, so
  the section specifies an *outcome*, not a technique.
- **Two facts correct the request's premise and are stated up front**: the platform has never sent an
  HTML email (both existing messages are plain text only), and four of the six live message types are
  sent by the identity provider rather than by platform code. Both materially change the slice.

**Carried into `/plan` as open inputs, not gaps:**

- The postal address for the compliance footer is an **operator input** and MUST NOT be inferred
  (platform prohibited-values rule).
- The non-production recipient allowlist is an operator input.
- The declared target-client set is named by behaviour in the spec; `/plan` must pin the exact list and
  the size budget number against the vendored support dataset.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- Research gathered during specification is preserved in
  [`research-inputs/`](../research-inputs/) — an industry survey of in-house template systems, and an
  HTML-email authoring rulebook with 55 testable rules and 31 lint checks. `/speckit-plan` should
  consume both when producing `research.md`.
