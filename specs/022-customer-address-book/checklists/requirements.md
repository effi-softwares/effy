# Specification Quality Checklist: Customer Address Book

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-22
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

- **All 3 clarifications RESOLVED 2026-07-22 — zero markers remain:**
  1. **Edit ships now** (FR-017, SC-011) — full CRUD, the backend PATCH already exists.
  2. **Deleting the default is blocked** while other addresses remain (FR-016a, SC-010); allowed only for
     the last address. Keeps "exactly one default" true by construction.
  3. **Preset chips (Home/Work/Other)** mapping to the existing free-text label (FR-006a) — no data-model
     change.
- **The dominant fact, verified in code:** the backend is essentially DONE — `customer_address` +
  `GET/POST/PATCH/DELETE /v1/addresses` (incl. `label`, `isDefault`/`makeDefault`, and edit via PATCH)
  already ship on **core-api (hot path)** from 019, and the customer-web checkout already has an inline
  `AddressForm`. This slice is therefore ~90% **client surface work** (two apps, at parity) over an
  existing model. The spec says so plainly and keeps the entities "existing".
- **The UI mechanics the operator specified** (shadcn responsive dialog/drawer on web; FAB → bottom-sheet
  on mobile) are captured at spec altitude as "surface-appropriate responsive container" (FR-007, SC-006)
  — the concrete components belong in `plan.md`.
- **Path decision deferred to the plan, deliberately flagged:** the existing endpoints are on the hot
  path though the doctrine would say cold path for "profile" — reuse-in-place is almost certainly right,
  but the plan must record it (Principle III).
- **`/speckit-clarify` session 2026-07-22(b) — 2 further questions, both accepted as recommended:**
  1. **Delete-default block is SERVER-enforced** (FR-016a, SC-010) — grounded in code: 019's set-default
     CTE already guarantees exactly-one-default server-side, but its DELETE has no protection, so 022 adds
     a small backend guard (the slice is *mostly*, not purely, frontend). Holds against races/direct calls.
  2. **Edit opens by tapping the row body** (FR-017a) — set-default/delete stay distinct per-row controls
     (Uber Eats/eBay pattern; large mobile target).
  Re-validated: **16/16 items still passing, no regressions.** 23 FRs · 11 SCs.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
