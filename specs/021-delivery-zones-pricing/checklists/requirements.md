# Specification Quality Checklist: Delivery Zones & Pricing

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-21
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

- **Three of the original clarifications RESOLVED 2026-07-21** — and the first reshaped the feature:
  1. **Per-shop split delivery (AliExpress / Daraz model)** — each shop's items are a separate delivery
     with its own price/time; the customer places one order, pays once, and sees an **anonymised
     per-package breakdown**. This gives 020's per-portion queue **genuinely independent** ready-bys,
     adds a **shop location** (shops have none today, 007), and makes the order fee the **sum** of
     per-package fees. A material scope increase, deliberately embraced.
  2. **Full back-office management UI ships in this slice** (Option A).
  3. **Both date-picker and derived-window** — service level per package; scheduled adds a specific date.
- **All 5 clarifications RESOLVED 2026-07-21 — zero markers remain.** The two surfaced by the per-shop
  answer were settled:
  4. **Partial serviceability → auto-exclude undeliverable items with a notice + explicit confirm**
     (FR-006b/006c, SC-011a); all-undeliverable blocks entirely.
  5. **Method selection → one order-level preference with per-package override** (FR-006a, SC-011b).
- **⚠ Hidden-fulfilment reconciliation is the delicate part.** AliExpress/Daraz name the seller; Effy
  must not (constitution: customers never see a shop). The spec resolves this by making the breakdown
  **by anonymous package** — split shown, seller/location never — enforced by FR-019 and SC-006. This
  interpretation should be sanity-checked in `/speckit-clarify` or the plan review.
- **The path decision is deferred to `plan.md`** (dual-path doctrine, 020 precedent): per-package quoting
  is latency-critical on the checkout path (hot path); back-office coverage/rate CRUD is latency-tolerant
  (cold path) — "one capability, two audiences, two paths."
- **Money-path integrity (US3, FR-008…FR-011, SC-002/SC-004) is load-bearing and now per-package.** This
  is the second slice to touch the payment amount and the first live checkout only just worked — fee
  drift and client-supplied-fee/item-reassignment attacks are explicit success criteria.
- **Facts verified against the codebase**: `pricing.DeliveryFeeCents = 500` is the flat fee replaced;
  `order.delivery_fee_amount` exists as a per-order column (tolerates the summed total); `public.shop`
  has **no location** (007 comment: "no address, hours, capacity, zones"); `shop_fulfillment` (020) has
  no per-portion fee/window column yet — 021 adds it.
- **`/speckit-clarify` session 2026-07-21(b) — 5 further questions asked and integrated**, all accepted
  as recommended, all high-impact (they drive the data model, money path, and acceptance tests):
  1. **Rate table keyed on (origin zone → destination zone)** — the shop's location resolves to an origin
     zone; methods/prices/times are per zone-pair, not per shop (FR-015; Rate entity).
  2. **Atomic multi-package finalization** — paid-transition + every snapshot + every shop portion in one
     transaction, extending 019's fan-out; no partially-finalized paid order (FR-012a, SC-011c).
  3. **Short-lived quote validity window** — captured server-side, honored within the window; expiry or a
     lapsed same-day forces a re-quote; the client never supplies the fee (FR-011/011a; Quote entity).
  4. **Package-aware cart** — the cart groups items into anonymous packages from the start (no shop,
     price, or window until the delivery step); serviceability still checked at checkout only (FR-005a).
  5. **Shop sees service level + ready-by, not the fee, not the carrier** — enough to prioritise/pack,
     nothing that leaks a payment amount (020's wall) or a carrier (FR-021a).
  Re-validated after integration: **16/16 items still passing, no regressions.** 31 FRs · 16 SCs.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
