# Specification Quality Checklist: Platform Domain & Per-Environment Namespaces

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-12
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

**All items pass. Ready for `/speckit-plan`.**

Both open questions were resolved by the operator (2026-07-12):

- **FR-016 (scope of "other places")** → **attach the shared API only.** It is the sole public endpoint
  in existence. The hosted frontends and the latency-sensitive backend are named by the same
  convention, but each is attached by the slice that *deploys* it. Recorded in Assumptions and Out of
  Scope.
- **FR-017–FR-022 (sign-in email)** → **in scope, per-environment.** Development verifies and sends as
  its own namespace (`no-reply@dev.effyshopping.com`), keeping its sending reputation isolated from the
  production apex exactly as its DNS records are. The operator's preferred design turned out to be both
  achievable and the better one.
  - Added **FR-022** from a gap the operator's answer surfaced: sending *from* an address does not
    imply receiving *at* it. A `hello@` contact address would bounce replies until inbound mail exists,
    which is out of scope — so no human-reachable address is advertised in this slice.

Tech-specific directives are recorded in [operator-directives.md](../operator-directives.md),
including a **factual correction to the request**: Route 53 hosted zones are global (there is no
"hosted zone in Sydney"), but ACM certificates are regional — a CloudFront/Amplify-fronted name needs a
`us-east-1` certificate while the regional API Gateway domain needs an `ap-southeast-2` one. That is a
**fourth** region-pinned value living outside Terraform, and belongs in the `infra/envs/README.md`
runbook alongside the existing three.
