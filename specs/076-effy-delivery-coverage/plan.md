# Implementation Plan: Effy Delivery Coverage

**Branch**: `dev` (feature directory `076-effy-delivery-coverage`) | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/076-effy-delivery-coverage/spec.md`

## Summary

One flat list of postcodes Effy delivers to, owned by Effy alone, and one answer per address —
*Delivered by Effy*, *Courier delivery*, or *cannot deliver*. Second slice of the delivery model v2
programme (`docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E2); the fee engine (E3), the windows
(E4) and the checkout (E5) all read what this produces.

The approach, in seven decisions (reasoning in [research.md](research.md)):

1. **Evolve the existing tables in place** (R1). `delivery_zone_postcode` already *is* a unique list of
   postcodes; `delivery_zone` becomes the optional group. A second, copied list would let the address
   screen and the live checkout disagree until three later epics land.
2. **One SQL function decides** — `public.coverage_for_postcode` (R2). Nothing else may.
3. **Distance is worked out in SQL** and stored per postcode with how it was obtained; a hub move
   recalculates the computed ones in the same transaction (R3).
4. **Removing a group never removes postcodes** — the foreign key that cascades today becomes
   SET NULL (R4).
5. **The live fee and same-day rules run on frozen settings** through three named bridges, each removed
   by a later epic (R5). Nobody's fee changes at release.
6. **Courier delivery is a switch that cannot yet be turned on**, so the three-answer rule is complete
   without promising an order nobody can place (R7).
7. **One refusal sentence in one file**, rendered by every surface (R8).

⚠ **One limitation, stated up front** (R6): driver clearances are still granted per group until E8, so
a postcode with no group can only be delivered by a driver cleared for every zone. The screen shows
the driver count and asks for confirmation at zero; the planner is not changed here.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose); TypeScript on Node 22 (Lambda, arm64); React 19
(back-office Vite SPA, customer-web Next.js 16); Kotlin 2.4 / CMP 1.11 (customer-mobile).

**Primary Dependencies**: none added.

**Storage**: one forward-only migration — columns on `delivery_zone_postcode`, `delivery_zone`,
`delivery_settings`; one new table `courier_excluded_postcode`; four SQL functions; a backfill that
raises rather than guesses. See [data-model.md](data-model.md).

**Testing**: container tests on the real migrations (P1–P9, P14–P16); guard tests (P10–P12); Vitest
unit for the admin service; React component tests; Kotlin `commonTest` for the address and checkout
view models. Proofs in [quickstart.md](quickstart.md), each broken once.

**Target Platform**: services `admin` (staff gateway), `storefront`, `commerce`, `customer` (shared
gateway); apps back-office, customer-web, customer-mobile; `infra/envs/dev/live.tf`.

**Project Type**: monorepo (backend services + web + mobile).

**Performance Goals**: the coverage decision is one indexed lookup on a unique postcode plus one
singleton read; it runs inside the existing quote and address reads, adding no round trip. The list
screen pages at 100 rows.

**Constraints**: zero postcodes gain or lose delivery at release (SC-002); no fee changes at release;
no customer DTO carries a group, distance or reason; no polling (071); no card layouts; the operator
runs the migration, deploys and Terraform.

**Scale/Scope**: 1 migration; 4 SQL functions; 13 admin routes added, 11 removed (net +2 on the staff
gateway: 144 → 146 of 300; `admin` stack ≈ 374 → 384 of 500 resources); 3 customer responses gain one
field; 1 back-office screen section replacing two; 2 customer surfaces updated; 1 live kind.

## Constitution Check

*Constitution v3.2.0. Evaluated before research and again after design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | The spec carries no technology. One gap found while planning (R6) went **back into the spec** as an assumption. |
| II. Shared contracts | ✅ | `CoverageKind`, the labels and the refusal sentence live once in `@effy/shared-types` and are generated into the Kotlin contract. |
| III. One backend; which service, which gateway | ✅ | **Service: `admin`, on the staff gateway — because back-office delivery configuration.** Customer-facing changes extend `storefront`, `commerce`, `customer` on the shared gateway. No new service. |
| III. A rule has one implementation | ✅ strengthened | Coverage decided by one SQL function; the distance formula moves from TypeScript to SQL and exists once. |
| IV. Auth isolation | ✅ | Staff routes on the staff gateway behind its only authorizer; role from the `admin.staff` record. |
| V. Design | ✅ | A table with filters and panels; no cards. Tokens only. Uber Eats / eBay reference: a serviceable-area list keyed by postcode with suburb search. |
| VI. Layered architecture, raw SQL, no ORM | ✅ | handler → service → repository in `admin/src/delivery/`; no DI framework. |
| VII. Observability | ✅ | Existing `ServiceabilityChecks` metric gains the `coverage` dimension (three bounded values). No new alarm: the unplanned-work alarm already covers R6's failure. |
| Real-world identifiers | ✅ | None introduced. |
| Live updates, no polling | ✅ | Kind `coverage`, ops channel, announced after commit. |
| Operator runs live changes | ✅ | Migration, deploys and apply are handed over in [quickstart.md](quickstart.md). |

**Post-design re-check**: unchanged. No violation; Complexity Tracking records two trade-offs.

## Project Structure

### Documentation (this feature)

```text
specs/076-effy-delivery-coverage/
├── plan.md
├── research.md            # F1, R1–R12
├── data-model.md
├── quickstart.md          # proofs P1–P16, operator steps, walks V1–V12
├── contracts/routes.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_effy_delivery_coverage.sql        NEW

packages/shared-types/src/
├── delivery.ts                 # CoverageKind, COVERAGE_LABEL, COVERAGE_REFUSAL_*; quote + serviceability gain `coverage`
├── delivery-admin.ts           # coverage DTOs in; zone / ring-create / exception DTOs out
├── address (customer contract) # AddressDTO gains `coverage`
└── live.ts                     # + "coverage"
packages/shared-types/contract/{schema.json,Dto.kt}   # regenerated

apis/edge-api/shared/src/delivery/
├── coverage.ts            NEW  # coverageForPostcode, COURIER_ORDERING_AVAILABLE
├── zone.ts                     # serviceableForPostcode / zoneForPostcode rebuilt on coverage.ts (+ R5 bridges)
├── quote.ts                    # carries `coverage`; "courier" is not purchasable yet (distinct error)
├── coverage.container.test.ts  NEW   # P1–P8, P15
└── coverage.guard.test.ts      NEW   # P10–P12

apis/edge-api/admin/
├── serverless.yml              # −11 functions, +13
├── src/delivery/
│   ├── coverage.repository.ts  NEW   # list, add, remove, distance, groups, courier, places, check; audit in-transaction
│   ├── coverage.service.ts     NEW   # validation, the no-driver confirmation, the courier lock
│   ├── coverage.service.test.ts / coverage.container.test.ts   NEW   # P9, P13, P14
│   ├── repository.ts / service.ts / types.ts   # zone, ring-create, suggest, exception code removed;
│   │                                           #   settings PUT recomputes distances (P6)
│   └── suggest.ts, suggest.test.ts             # DELETED (formula now SQL)
└── src/functions/
    ├── delivery-coverage-*.ts  NEW ×13
    └── delivery-{rings-v1-post,zones-*,zone-postcode-*,zone-suggest-ring-*,exception-*,postcode-check-*}.ts   DELETED

apis/edge-api/storefront/src/functions/serviceability-v1-get.ts   # + coverage; cache 5 min
apis/edge-api/commerce/src/checkout/{quote,respond,service}.ts     # + coverage; refusal from the shared constant
apis/edge-api/customer/src/addresses/{model,…}.ts                  # each address + coverage

infra/envs/dev/live.tf          # live_kinds + "coverage"

apps/back-office/src/features/delivery/
├── DeliveryScreen.tsx          # Zones + Rings tabs → Coverage
├── coverage/                   NEW
│   ├── CoverageTable.tsx, CoverageFilters.tsx
│   ├── AddPlacesDialog.tsx, DistanceDialog.tsx, PostcodeChecker.tsx
│   ├── GroupsPanel.tsx, CourierPanel.tsx
│   └── *.test.tsx
├── components/{NewRingDialog,NewZoneDialog,AddPostcodeDialog,SameDayExceptionsDialog}.tsx   DELETED
├── access.ts, queries.ts, repo.ts, errorText.ts
└── ../live/routes.ts           # coverage → query keys

apps/customer-web/
├── app/checkout/{CheckoutFlow,AddressPicker}.tsx     # label + the one refusal sentence
├── app/(account)/account/…addresses                  # label per saved address
└── app/(shop)/…delivery location                     # reads `coverage`

apps/customer-mobile/shared/src/commonMain/…/features/{checkout,account/addresses,catalog}/   # same

docs/delivery-console-guide.md · docs/api/path-assignment.md (no change expected) · FEATURE-HISTORY.md ·
CLAUDE.md · docs/prd/2026-10-delivery-model-v2-backlog.md
```

**Structure Decision**: no new service, package or directory under `apis/edge-api/`. Coverage code
sits beside the delivery code it replaces, in new `coverage.*` files so the removal of zone/ring code
is a deletion rather than an edit in place.

## Build order

1. **Shared words**: `CoverageKind`, labels, refusal constants, DTOs; regenerate the Kotlin contract.
2. **Migration**: columns, FK change, functions, backfill-or-raise, grants, comments.
3. **Shared library**: `coverage.ts`; rebuild `zone.ts` on it with the three bridges; container proofs
   P1–P8, P15 — **P1 and P7 before anything else is touched**: they are the release-safety net.
4. **Customer-facing reads**: storefront, customer addresses, commerce quote and refusal; P16.
5. **Admin**: repository, service, 13 handlers, serverless; remove the 11; settings recompute; P9, P13, P14.
6. **Guards**: P10–P12.
7. **Live**: kind in shared-types, announce after commit, `live.tf`, change-map guard.
8. **Back-office**: Coverage section; delete the four dialogs.
9. **Customer web, then mobile**: labels and the sentence.
10. **Documents, SIGNOFF, FEATURE-HISTORY**; hand over the operator steps.

## Risks

| Risk | What limits it |
|---|---|
| The migration silently changes who is served | P1 compares every postcode before and after; the migration prints what it removes (disabled zones only). |
| A listed postcode ends up without a distance | The column is NOT NULL and the backfill raises, naming the postcodes, instead of guessing. |
| A fee changes at release | P7. Pre-076 groups keep their tier; only postcodes added afterwards are tiered by distance. |
| A new postcode cannot be priced | `coverage_ring_for_km` always resolves a tier while one exists; P8 quotes a far postcode. |
| An ungrouped postcode is sold and nobody can deliver it (R6) | Driver count on the screen; confirmation at zero; the existing unplanned-work alarm. Removed by E8. |
| Someone turns courier delivery on before it can be ordered | The route refuses (P9); E5 flips one constant. |
| A released mobile build meets the new shape | Additive fields only; `serviced` keeps its meaning. |
| Old back-office tab calls removed routes between deploys | Deploy `admin` and build back-office together (quickstart). |

## Complexity Tracking

No constitution violation. Two trade-offs worth recording:

| Trade-off | Why | Simpler alternative rejected because |
|---|---|---|
| Tables keep the names `delivery_zone` / `delivery_zone_postcode` while meaning "group" / "the list" | Thirteen files in five services read them until E3/E5/E8; renaming now touches all of them for no behaviour | New, well-named tables filled by a copy: two lists of where Effy delivers, able to disagree (R1). Renamed at E9. |
| Three `COALESCE` bridges keep ring pricing and same-day flags alive behind removed controls | The live checkout must keep selling until E5 (spec assumption 2) | Removing the old rules now: breaks checkout. Keeping the old controls: contradicts FR-030 and lets a shop setting change what a customer is offered. Each bridge names the epic that deletes it. |
