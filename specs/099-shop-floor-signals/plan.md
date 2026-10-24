# Implementation Plan: Shop Floor Signals — Collection, Pick Order, Availability and Quality

**Branch**: `dev` (feature directory `099-shop-floor-signals`) | **Date**: 2026-10-24 | **Spec**: [spec.md](spec.md)

## Summary

Four facts the redesigned shop console drew as "Needs backend", supplied by the one backend and shown
where the canvas puts them:

- **Next collection** — derived on read in the `shop` service from the collection schedule, the
  planner's own run rule (`dueRun`, moved into `@effy/edge-shared` so the planner and the shop read
  one rule), and the run's round and stop. Today gets `nextCollection`; order rows, order detail and
  Today's live orders get `collection`. The fleet planner and driver duty announce `orders` to the
  affected shops (R1–R3).
- **Pick order** — every shop order line and pick-list line carries `storageClass` from the
  `order_item` snapshot; the console groups Ambient → Chilled → Frozen (R4).
- **Availability** — one new read, `GET /shop/v1/availability`; the switch is the existing variant
  state route (R5).
- **Quality** — five columns on `shop_sales_hour`, filled by the existing rollup job; Insights gains
  `quality` (R6).

Decisions: [research.md](research.md) R1–R7. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md). Walk: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript — edge-api `shop`, `fleet`, `driver`, `shared`; `@effy/shared-types`;
shop-web (React 19).

**Primary Dependencies**: none new.

**Storage**: PostgreSQL 16. One goose migration `<ts>_shop_floor_signals.sql` (five columns on
`shop_sales_hour`, 60-day backfill marking). No other schema change.

**Testing**: vitest unit tests (collection rule, run per portion, driver state, availability query
builder, quality formulas); container tests (collection read against real rounds; availability
filters and last-on-sale; rollup columns incl. reopened picking and withdrawn); shop-web component
tests (Next collection panel, grouped pick list, Availability, quality strip).

**Target Platform**: AWS Lambda behind the **shared** gateway (shop authorizer); shop-web PWA.

**Project Type**: web service + web app (monorepo).

**Performance Goals**: Today and the order list stay one read each; the collection derivation adds at
most two indexed queries per read (runs + this shop's rounds for the next two days). Availability
pages at 50 rows.

**Constraints**: a shop is told only "Effy driver" / "Courier" — never a window, fee, driver name or
position (FR-008); nothing refreshes on a timer (071); every new contract field required unless
genuinely absent.

**Scale/Scope**: 1 migration, 1 new route (shared gateway 163 → 164 of 300), 4 changed DTOs, 1 moved
shared function, 2 new announcement points, ~6 shop-web components.

## Constitution Check

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec.md → this plan → tasks.md; spec has no technology | Pass |
| II. Shared contracts | Every new shape in `@effy/shared-types`; `dueRun` lives once in `@effy/edge-shared` | Pass |
| III. One serverless backend | New route in the existing `shop` service on the shared gateway (55% → 55%); no new compute | Pass |
| IV. Auth isolation | Shop pool authorizer; shop scoping from the staff record as every shop route | Pass |
| V. Design | Back-office identity tokens only; panels, not cards; status words with icons | Pass |
| VI. Layering | Each part: handler → service → repository, raw SQL, explicit wiring | Pass |
| VII. Telemetry | `availability_viewed`, `availability_toggled`, `collection_panel_viewed` in the typed taxonomy; no PII | Pass |
| Live updates (071) | Uses `announce` after commit; client maps existing kinds; no polling | Pass |
| Gateway capacity (075) | +1 route; capacity test stays green | Pass |

No violations — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/099-shop-floor-signals/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
db/migrations/<ts>_shop_floor_signals.sql
packages/shared-types/src/
├── shop-insights.ts          # nextCollection, collection on live orders, quality
├── shop-order-console.ts     # collection on rows/detail, storageClass on lines
└── shop-availability.ts      # new
apis/edge-api/shared/src/lib/collection-deadline.ts   # dueRun moved here (+ tests)
apis/edge-api/fleet/src/planner/service.ts            # imports dueRun; announces shops after a pass
apis/edge-api/driver/src/functions/driver-duty-v1-post.ts  # announces shops on duty change
apis/edge-api/shop/
├── serverless.yml            # + availabilityV1
└── src/
    ├── collection/           # new: rule.ts (pure), repository.ts, service.ts
    ├── availability/         # new: repository.ts, service.ts, handler-support.ts
    ├── functions/availability-v1-get.ts
    ├── today/ · orders/ · pick-lists/   # add collection / storageClass
    └── insights/             # rollup.ts columns; repository/service quality
apps/shop-web/src/
├── features/today/NextCollection.tsx          # panel (Today)
├── features/fulfillment/components/…           # queue/rows/detail collection line; grouped pick list
├── features/catalog/AvailabilityScreen.tsx + route catalog.availability.tsx
└── features/insights/QualityStrip.tsx
```

**Structure Decision**: the monorepo's existing layout; the backend is the `shop` service (shop
audience, shared gateway), with announcement-only edits in `fleet` and `driver`.

## Deploy order (operator)

1. `make db-up ENV=dev` (the migration).
2. `make edge-deploy SERVICE=shop ENV=dev` (its Insights read needs the columns), then `SERVICE=fleet`,
   `SERVICE=driver`.
3. shop-web from `dev`.

## Complexity Tracking

None.
