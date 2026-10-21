# Implementation Plan: Delivery Today, Postcode by Postcode

**Branch**: `097-same-day-by-postcode` (work on `dev`) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/097-same-day-by-postcode/spec.md`

## Summary

Each postcode on Effy's delivery list gets one more fact: **Delivery today — offered / not offered**
(default offered). Where it is off, the address is sold windows from the next delivery day only.

**The whole approach in one sentence: the Effy calendar for that address simply does not start with
today.** `effyDays` — the one function every Effy path already builds its days with — takes the
postcode's setting and leaves today out when it is off. Everything else follows with no new rule:

- **Checkout**: no `same_day` day in the quote → no Same-day section on web or app (both already
  render a quote with no today as no section), no "Delivery today" surcharge priced.
- **"As soon as possible"**: already lands on the first day with an open Any-time window — now a
  later day.
- **The payment-intent call**: re-quotes, so a stale choice of today is refused (`date_unavailable`)
  and the customer chooses again; a place already held is untouched.
- **Back-office move to Effy / re-time**: list and commit both use the calendar → today neither shown
  nor accepted.

The setting travels inside the ONE coverage answer (`public.coverage_for_postcode` gains a column),
so no new reader of the list's table appears. Staff get it through the existing Coverage routes: a
column, two filters (Delivery today; "farther than N km"), a bulk action, a choice in Add places, a
line in the checker.

Details and rejected alternatives: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (Node 20 Lambdas; React 19 back-office), SQL (PostgreSQL 16, Goose).

**Primary Dependencies**: existing only — `@effy/edge-shared/delivery` (`coverage.ts`, `windows.ts`,
`quote.ts`, `override.ts`), `@effy/shared-types` (`delivery-admin.ts`), TanStack Query (back-office).

**Storage**: one migration — `delivery_zone_postcode.today_offered boolean NOT NULL DEFAULT true`, and
`coverage_for_postcode` re-created with a sixth result column. No new table.

**Testing**: Vitest — `windows.test.ts` (pure calendar), the coverage/commerce/admin/fleet container
tests, the existing guard tests (`coverage.guard`, `override.guard`, `fee.guard`,
`gateway-capacity.contract`), back-office `CoveragePanel.test.tsx`.

**Target Platform**: the one serverless backend (`admin`, `commerce`, `orders`, `fleet` redeployed);
back-office. **No change** to customer-web, customer-mobile, driver-mobile, shop-web.

**Project Type**: monorepo — backend services + one web console.

**Performance Goals**: none new. The coverage function returns one more boolean from a row it
already reads; the list's new filters are predicates on the same table (13 rows in dev; the list is
bounded by Effy's area, hundreds at most).

**Constraints**: customer wire unchanged (installed apps cannot be updated); one coverage function,
one calendar, one window rule — all kept; no new route on either gateway.

**Scale/Scope**: 1 migration; ~5 shared files, ~3 admin files, 2 fleet call sites; 1 shared-types file;
~4 back-office files. Roughly a two-day feature.

## Constitution Check

| Principle | Verdict |
|---|---|
| **I. Spec-driven** | Pass. One planning finding written back as a requirement detail rather than a plan-only deviation: the spec's "filter by distance" needs a km filter the list does not have (research R6) — it is FR-011's "including distance", now made concrete in the contract. |
| **II. Monorepo, shared contracts** | Pass. Staff types only in `packages/shared-types/src/delivery-admin.ts`; no customer type changes. |
| **III. Single serverless backend** | Pass. No new service, route or integration; staff gateway only. `gateway-capacity.contract.test.ts` unchanged. |
| **IV. Auth isolation** | Pass. Existing back-office authorizer and manager/admin write gate; customers reach nothing new. |
| **V. Native-feel, consistent design** | Pass. A table column, a facet, a bulk-bar control, a checkbox in an existing dialog, a line in the checker — no cards. Existing tokens and primitives only. |
| **VI. Layered architecture** | Pass. Handler → service → repository, raw SQL; `windows.ts` stays pure (the flag is an argument). |
| **VII. Observability** | Pass. Audited (`coverage.postcode.today`); live updates through the existing `announce(ops, coverage)`. No new telemetry needed. |
| **Real-world identifiers** | N/A — no identifier introduced. |

No violation. **Post-design re-check: unchanged.**

## Project Structure

### Documentation (this feature)

```text
specs/097-same-day-by-postcode/
├── plan.md              # this file
├── research.md          # R1–R8: where the flag lives and why the calendar carries it
├── data-model.md        # the column, the function's new result column, the staff types
├── quickstart.md        # machine checks + operator steps + the dev walk
├── contracts/
│   └── admin-coverage.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/
└── <timestamp>_coverage_today_offered.sql        # NEW — column + coverage_for_postcode re-created

apis/edge-api/shared/src/delivery/
├── coverage.ts          # Coverage.todayOffered, read from the function
├── windows.ts           # effyDays(now, lookahead, noWeekdays, noDates, todayOffered) — all required
├── windows.test.ts      # calendar without today
├── quote.ts             # passes coverage.todayOffered
└── override.ts          # windowsNow + bindEffyWindow take the order's postcode setting

apis/edge-api/admin/src/
├── delivery/coverage.repository.ts   # list column/filters/count, add with flag, setTodayOffered (+audit)
├── delivery/coverage.service.ts      # validate + route patch/add, checker field
└── functions/delivery-coverage-list-v1-get.ts   # parse `today`, `minKm`

apis/edge-api/fleet/src/
├── dispatch/windows.ts  # effyDays(…, true) — staff calendar, not an address
└── slots/service.ts     # effyDays(…, true)

apis/edge-api/commerce/src/checkout/
└── checkout.container.test.ts        # quote / ASAP / intent refusal / held place stands

packages/shared-types/src/
└── delivery-admin.ts    # CoveragePostcodeDTO, counts, Add/Patch requests, CoverageCheckDTO

apps/back-office/src/features/delivery/
├── repo.ts              # CoverageFilters.today / minKm
├── coverage/CoveragePanel.tsx        # column, facets, bulk control
├── coverage/AddPlacesDialog.tsx      # "Offer delivery today" (default on)
├── coverage/PostcodeChecker.tsx      # the checker line
└── coverage/CoveragePanel.test.tsx
```

**Structure Decision**: an extension of 076's coverage slice and 078's calendar, in the files that
already own them. Nothing new is scaffolded.

## Complexity Tracking

None — no constitution violation to justify.
