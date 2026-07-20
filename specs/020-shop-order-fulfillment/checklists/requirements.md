# Specification Quality Checklist: Shop Order Fulfillment (Receive → Pick → Handoff)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-20
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

- **Both clarifications resolved 2026-07-20** (Clarifications § Session 2026-07-20):
  1. **Unavailability is per item, not per portion** (Option B). Recorded, surfaced, and **no automatic
     refund** — FR-010a…FR-010f, SC-011/SC-012.
  2. **Terminal shop state is "ready for pickup"** (Option A), plus a **temporary dev-only pickup stub**
     so the lifecycle is exercisable before a driver surface exists — FR-030…FR-034, SC-013/SC-014.
- ⚠ **Two consequences worth carrying into planning, not hiding:**
  - **The shortfall gap is a real financial debt.** A flagged-unavailable item means the customer paid for
    goods they will not receive and gets nothing back in this slice. That is accepted and time-boxed, but
    the data must make the outstanding obligation *queryable* (Assumptions), or the refunds slice will
    inherit an unrecoverable mess.
  - **The pickup stub is an order-state forgery primitive if it is ever reachable.** It accepts a
    caller-supplied driver identity, so an unauthenticated deployed instance would let anyone mark any
    shop's order collected. FR-031 therefore requires it be *structurally* unable to exist outside local
    development, and SC-013 requires that be proven by **attempting to enable it**, not by code reading.
    It also carries an explicit removal trigger (FR-034) so it does not quietly become permanent.
- **Path assignment (hot vs cold) is deliberately NOT specified here.** The operator's rule — path chosen
  by latency/reliability need, not by audience — is recorded as a constraint in Assumptions; the actual
  per-endpoint decision belongs in `plan.md` with its justification.
- Two substrate facts were verified against the codebase rather than assumed: shop-web has **no** Orders
  navigation at all, and shop-mobile's Orders tab is an explicit "coming soon" placeholder. Both are
  recorded in Assumptions because they materially size the parity work.
- **`/speckit-clarify` session 2026-07-20 — 5 further questions asked and integrated**, all accepted as
  recommended: (1) the state machine is `pending → received → picking → ready_for_pickup` + `collected`;
  (2) both shop roles have full fulfilment access, audit trail as the control; (3) forward-only with one
  permitted reversal (`ready_for_pickup → picking`); (4) shortfalls disclosed to the customer at item
  level only once the portion is terminal; (5) strict FIFO queue with in-place age escalation.
  Re-validated after integration: **16/16 items still passing, no regressions.**
- **Amendment 2026-07-20 — delivery promise (2 further clarifications, 9 total).** The operator raised
  delivery zones/fees/methods/times mid-session. Scoped **out** to a new slice
  **021-delivery-zones-pricing** (see [NEXT-021-delivery-zones.md](../NEXT-021-delivery-zones.md)); 020
  amended only to *consume* the promise read-only.
  - ⚠ **This amended clarification 5.** Strict FIFO was correct only while all orders shared one implicit
    promise; it breaks once same-day and multi-day coexist. FR-001 now orders by promise urgency,
    tie-broken by arrival, and **FR-001b/SC-020 require it degrade to exactly FIFO** while one promise
    exists — so 020 ships correct today and needs no rework when 021 lands.
  - **021 decisions locked**: postcode-list zones (no geocoding dependency), block unserviceable
    addresses at checkout only (preserves guest-first/SEO browsing), 021 ships after 020.
  - **Binding**: who performs a delivery (platform driver vs third party) is never modelled, stored, or
    displayed — FR-002a, SC-021, and an explicit Out-of-Scope entry.
  - Re-validated after amendment: **16/16 items still passing, no regressions.** 50 FRs · 21 SCs.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
