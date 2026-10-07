# Implementation Plan: Simple Order Status & Driver Assignment in Orders

**Branch**: `dev` (feature directory `073-order-dispatch-control`) | **Date**: 2026-10-07 (revised, simplified) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/073-order-dispatch-control/spec.md`

## Summary

Three small things, on operator direction that simpler is better:

1. **One status, nine words, everywhere** — worked out from what actually happened, shared by
   back-office, shop console and driver app, live. Fixes the reported defect: a collected package now
   says **With driver**, and hub check-in moves it to **At hub** on every screen (R1–R3).
2. **Who has it, and how** — a Driver column, and on each package one line: "Collect: Ada · opens
   1:15 pm · Auto-assigned — fewest packages today". Stored as one line on the assignment (R4).
3. **Two manual actions** — **Assign to…** (also how a package is moved) and **Unassign**, with a
   driver list sorted Fine / Concern / Can't take it, and a one-line confirmation after everything
   (R5, R6).

And two removals that make the planner simpler to understand: the **round lock** and the
**planning-passes list** (R7).

## Technical Context

**Language/Version**: TypeScript on Node 22 (Lambda, arm64); React 19 (back-office, shop-web);
Kotlin 2.4 / CMP 1.11 (driver app history only); SQL (PostgreSQL 16, Goose).

**Primary Dependencies**: none added. Design-system `tabs`, `table`, `badge`, `sheet`,
`dropdown-menu`, `sonner`.

**Storage**: one additive migration — two nullable columns on `round_package`. No new table.

**Testing**: Vitest unit (`packageStatus`, `reasonSeverity`); container tests S2–S6, M1–M5 on the real
migrations; guard S7 (one word map); component tests; Kotlin `commonTest`.

**Target Platform**: `orders`, `shop`, `driver`, `fleet` services; back-office, shop-web; driver app.

**Project Type**: monorepo.

**Performance Goals**: order list stays one request; changes on open screens within a few seconds.

**Constraints**: planner rules unchanged except removing the lock; no new service, table or
dependency; customer view unchanged; collected goods never move; no polling; operator runs deploys.

**Scale/Scope**: 1 migration; 1 shared status module; 3 new fleet routes, 2 removed; status fields on
orders, shop and driver reads; ~5 back-office components; shop-web label consolidation.

### Unknowns

None. See [research.md](research.md) F1, R1–R8.

## Constitution Check

Checked against constitution **v3.1.0**.

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec revised first (simplification), then this plan. |
| II. Shared contracts | ✅ | One status union + words in `@effy/shared-types`; one derivation in `@effy/edge-shared`; removes four app-local label maps. |
| III. Single serverless backend | ✅ | No new service. Assignment → `fleet`; order reads → `orders`; shop reads → `shop`; history → `driver`. |
| IV. Auth isolation | ✅ | Manual routes on the back-office pool, admin/manager only; shop reads carry no driver name. |
| V. Design | ✅ | Tabs, tables, rows, a side sheet; pills always with words; no cards or tiles. |
| VI. Layered | ✅ | Pure derivation over facts the repository reads; manual placement reuses the planner's placement code. |
| VII. Observability | ✅ | `dispatch.manual` log line; existing planner metrics unchanged. |
| Identifiers / standards | ✅ | None introduced; raw SQL, Goose, no ORM. |

**Gate**: passes. Re-checked after design: unchanged.

## Project Structure

### Documentation

```text
specs/073-order-dispatch-control/
├── plan.md · research.md · data-model.md · quickstart.md · contracts/routes.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
db/migrations/<ts>_assignment_note.sql

packages/shared-types/src/package-status.ts            # NEW — PackageStatus, STATUS_WORD
apis/edge-api/shared/src/status/                       # NEW — packageStatus(), facts SQL, reasonSeverity()

apis/edge-api/orders/src/orders/                       # status, drivers, assignments on list/detail
apis/edge-api/shop/src/{orders,fulfillments}/          # status (no driver names)
apis/edge-api/driver/src/work/{delivery,announce}.ts   # history status; hub check-in → shops
apis/edge-api/driver/src/functions/driver-hub-checkin-v1-post.ts
apis/edge-api/fleet/src/planner/{assign,repository}.ts # assigned_note; placePackage(); lock checks removed
apis/edge-api/fleet/src/assignments/                   # NEW — drivers list, assign, unassign
apis/edge-api/fleet/src/functions/                     # 3 new handlers; lock handlers removed

apps/back-office/src/
├── routes/orders.tsx, routes/dispatch.tsx (redirects), components/layout/nav.ts
├── features/orders/{OrdersLayout,OrdersListScreen,OrderDetailScreen}.tsx
├── features/orders/components/{PackageRows,AssignSheet}.tsx
└── features/assignments/   # the Dispatch feature, moved and trimmed (no lock, no passes list)

apps/shop-web/src/features/fulfillment/   # STATUS_WORD replaces three label maps
apps/driver-mobile/…/features/history/    # status words on history rows
```

### Build order

| Phase | Delivers | Spec |
|---|---|---|
| 1 | Status everywhere + hub check-in tells shops | US1 — ships alone |
| 2 | Driver column, assignments on the order, how-assigned line, Assignments tab, lock and passes list removed | US2 |
| 3 | Assign to… / Unassign with the Fine/Concern/Can't list and one-line confirmations | US3 |

## Complexity Tracking

No violation. The plan removes more concepts (lock, passes list, four label maps) than it adds (one
status list, two actions).
