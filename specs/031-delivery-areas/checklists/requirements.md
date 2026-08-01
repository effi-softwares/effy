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

## Post-analysis reconciliation (2026-08-01)

`/speckit-analyze` returned **16 findings — 1 critical, 4 high**. All verified against the repo and all
resolved. The four that mattered:

- **⚠ F1 (CRITICAL) — the SC-014 assertion had nowhere legal to live.** T051 placed it "beside 030's
  SC-002 coverage check", which is inside `apis/core-api`; T053 requires that diff to be **empty**. The
  guard and the assertion it guards contradicted each other, and the task that would have failed is the
  one proving the feature's motivating defect is fixed. Moved to the admin service, over the same query
  that backs `/delivery-health` — which also collapses F7's three competing homes into one.
- **⚠ F2 (HIGH) — "deliberately not served" was inert.** Serviceability is decided by zone membership,
  so a decision recorded *beside* it changed nothing: an area an admin explicitly marked unserved would
  still answer `serviced:true`. **The REGIONAL defect inverted, introduced by the feature meant to
  prevent it.** Fixed in the spec (FR-011a/b/c): the decision and the withdrawal are one transaction,
  and the record survives so provenance is kept.
- **⚠ F3 (HIGH) — the old per-origin grid stayed fully editable**, so FR-013/SC-011 could be undone the
  day after sign-off via `RatesScreen` and the two live offering-write routes. The spec's own reasoning
  rejects "two management surfaces for one concept" — and the first draft left two.
- **⚠ F5 (HIGH) — a metric was declared with no mechanism to emit it.** No cold-path service on this
  platform emits any metric. Now **deferred explicitly** and recorded as a carry-forward, rather than
  declared and quietly not built.

Also fixed: the route count (5 vs 6 — the one dropped was the FR-006 endpoint), a path drift in R1,
untyped `decided_by` provenance (005's recurring defect), the zone-vs-area granularity gap in the health
query, the missing FR-020/FR-029 verifications, a NULL shop postcode, and a fallback for the two
five-admin walks on a small team.

## Notes

**PASS** — all items green. Both open questions were **settled from live data** rather than by
guessing: the per-origin rate conflict is real ($5 vs $8 to Melbourne Metro) so the admin reconciles;
scheduled delivery is included, and is currently configured nowhere.

⚠ **A live defect was found while resolving them, and is now the feature's motivating example.** The
`REGIONAL` zone serves Ballarat and Bendigo and has **zero** inbound offerings — so the storefront
says "we deliver here" and checkout cannot quote. It is recorded in the spec and measured by SC-014.
Nobody can tell whether `REGIONAL` was deliberately unpriced or never finished, which is exactly the
ambiguity FR-012 removes — so fixing the row without the feature guarantees a recurrence.

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
