# Specification Quality Checklist: Delivery Areas

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
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

**Two open items**, both genuine scope decisions with materially different work behind each answer:
existing per-origin rate reconciliation, and whether scheduled delivery joins the per-area model.
Neither has a defensible default — the first is a data decision with revenue consequences, the second
decides whether a shipped capability keeps a management interface.

Four judgement calls made rather than asked, recorded so `/speckit-plan` need not re-derive them:

- **⚠ "An area is a postcode, presented as places."** This is the spec's load-bearing decision.
  Serviceability is postcode-keyed everywhere — checkout, the storefront answer, the captured quote —
  so an area cannot be finer than a postcode without a change explicitly ruled out of scope. FR-006
  exists *only* because of this gap between how an area is chosen and what it means, and it is the
  requirement most likely to be under-built into a tooltip nobody reads.
- **An unknown postcode warns rather than blocks** (FR-005). A hard block would be safer against 3001
  and would also stall a legitimate operations change whenever the reference record lags a new
  postcode. Admins are trusted operators; the control prevents mistakes, not misuse.
- **Same-day feasibility is a human judgement, not a computed one** (FR-017/FR-018). The platform has
  no routing capability and 030 rejected a third-party geocoding dependency. Showing the shops and
  requiring acknowledgement is honest; a computed radius would be invented precision.
- **Per-origin pricing collapses to per-area** because hidden fulfilment means the shopper can never
  perceive the distinction — while the grid grows as origins × destinations. Recorded in Assumptions
  as a deliberate loss of internal cost expressiveness, not an oversight.

**Three success criteria are observer tests** (SC-003, SC-006, SC-007) rather than machine checks.
Each measures whether an operator *understood* what they just did — which is the failure mode this
feature exists to prevent, and which no automated check can confirm. They are operator walks and must
be listed as such at sign-off, not marked complete on reasoning.
