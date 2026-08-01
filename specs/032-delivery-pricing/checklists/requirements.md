# Specification Quality Checklist: Delivery Pricing & Same-Day Coverage

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-01
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

## Validation Result

**PASS** — 43 FRs · 4 user stories · 15 success criteria · 0 clarifications.

⚠ **Re-validated after `/speckit-analyze` (2026-08-01).** The pass added four requirements the first
draft was missing, each of which would have shipped as a real gap:

- **FR-030a** — an approved area later removed from every delivery zone. The spec listed it as an edge
  case and then had no requirement covering it, so an approval would have outlived the service it
  depends on.
- **FR-033a** — ⚠ **a banded fee does disclose a coarse distance.** The first draft asserted the
  opposite in research and left FR-033 reading as though nothing leaked. Bands bound the leak; they do
  not eliminate it, and band width is therefore a privacy parameter.
- **FR-036a / FR-037a** — ⚠ nothing let anyone *record* a real weight. FR-036 was satisfiable by a
  database default alone, which means SC-012 measured arithmetic rather than data.

## ⚠ This spec is bigger than it looks, and the plan must not pretend otherwise

Two of its requirements are **not delivery work at all**, and each is capable of consuming a slice:

- **FR-036 — every product must have a weight.** Weight is currently an optional *catalog attribute*,
  required only for one category, and **14 of 38 live products have one**. Making it universal is a
  change to how products are described, with a decision needed about the products that lack it. This
  is the single largest hidden cost in the spec.
- **FR-035 — every place must have a location.** Cheaper: the source dataset already carries a
  coordinate per locality and 030's load discarded it. A re-derivation and a migration, not new data.

⚠ **The plan should sequence these first and say plainly that they are prerequisites, not features.**
If they are treated as incidental the slice will stall halfway with a pricing model that cannot be fed.

## Judgement calls made rather than asked

- **Straight-line distance, stated as such** (Out of Scope). It under-states road distance by roughly
  7% on the one pair measured. Bands plus upward rounding absorb it, and a routing provider is an
  external dependency on the customer-facing price path — rejected in 030 and rejected again.
- **Rounding is UPWARD, not nearest** (FR-005). Nearest means the platform silently absorbs the
  difference on half of all orders; that is a revenue decision disguised as a formatting choice.
- **A declaration is a proposal with no effect** (FR-017). It is what makes US2 shippable alone and
  safe, and it is the only reading of "shops should not be able to change it without admin approval"
  that holds if an approval is slow.
- **Approval shows distance** (FR-023). Without it the admin is making the same judgement the zone
  check made — and that check permitted same-day to Ballarat from **98 km** away.
- **Gaps in the rules must still produce a fee** (FR-011). A missing band silently meaning free
  delivery is the same class of defect as an absent row meaning "not served" — the ambiguity 031's
  decision record exists to remove.

## ⚠ Observer tests

**SC-009** requires 5 admins to state a distance correctly. Like 031's, it measures whether a person
*understood* what they were shown — the failure this feature exists to prevent. It is an operator walk
and must be listed as such at sign-off, not marked complete on reasoning.

**SC-008** is not an observer test but is the most important criterion here: the Ballarat/Bendigo pair
is the exact case that motivated the feature, and it must be exercised by name.
