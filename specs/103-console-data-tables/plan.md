# Implementation Plan: Console Lists That Work the Same Everywhere

**Branch**: `103-console-data-tables` (work is on `dev`) | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/103-console-data-tables/spec.md`; inventory and defects from
[docs/research/console-data-tables.md](../../docs/research/console-data-tables.md).

## Summary

Every console list (≈ 30 in back-office and shop-web) moves onto **one paging contract** on the backend and
**one data-table layer** on the client. Backend: a shared `list-query.ts` helper (validated params, whitelisted
sorts with an id tie-break, offset + exact total or keyset + capped count, view counts via `?views=only`) and
the `ListPage<T>` envelope in `@effy/shared-types`; one index-only migration. Client: TanStack Table **v9** in
server mode (`manual*`, `rowCount`, `getRowId`), TanStack Router search params as the list's state, TanStack
Query with kept-previous data and abort, a `ListPage` layout that fills the window, and column meta that
generates priorities, alignment, the phone layout and the column menu. Bounded sub-tables use the same table in
client mode. **No new routes, tables or columns.** Fixes the defects the inventory found (orders tie at a page
edge, lost views, silent caps at 1 000/200/500, N count requests, no list filling the screen).

## Technical Context

**Language/Version**: TypeScript 5 (Node 22 Lambdas; React 19 consoles)

**Primary Dependencies**: `@tanstack/react-table` **8.21 → 9.3** (R1); existing TanStack Router / Query /
Hotkeys; shadcn primitives in `@effy/design-system/ui`; Serverless Framework v3; `pg`

**Storage**: PostgreSQL 16 — no schema change; one migration of indexes (`CREATE INDEX CONCURRENTLY`)

**Testing**: vitest (web-kit, back-office, shop-web, edge services); container tests (testcontainers, the one
baseline + migrations) for every converted list's SQL; guard tests

**Target Platform**: back-office and shop-web (Vite SPAs, desktop/tablet/phone browsers); staff and shared gateways

**Project Type**: web consoles + serverless API (monorepo)

**Performance Goals**: SC-002 — 95 % of list interactions show their result < 1 s with 1 M orders / 100 k
products; ≤ 100 rows rendered per page

**Constraints**: zero new gateway routes (staff ≈ 203/300, R11); no timers (071); URL is the list state; access
scoping unchanged; one pinned major of each TanStack package across the three packages

**Scale/Scope**: 26 lists converted (kind A), ~17 bounded sub-tables (kind B), 5 capped sets; ~12 boards and
editors untouched (kind C)

## Constitution Check

*GATE: before Phase 0, re-checked after Phase 1.*

| Principle | Status |
|---|---|
| I — spec-first | ✅ spec (clarified 2026-10-28) → this plan → tasks |
| II — shared contracts | ✅ `ListPage`/`ListQuery` once in `@effy/shared-types`; `list-query.ts` once in `@effy/edge-shared`; `data-table` once in `@effy/web-kit` for both consoles — replaces 3 paging shapes and 7 pager/sort variants |
| III — one serverless backend, two gateways | ✅ changes only existing routes in `orders`, `catalog`, `admin`, `admin-promotions`, `fleet`, `inventory`(-staff), `shop`; **no new route**, view counts by query param (R11); capacity re-checked in T-001 |
| IV — auth isolation | ✅ scoping stays in each service's `WHERE` before client filters (contract rule 5); links carry no authority (FR-020) |
| V — design system; no cards; shadcn | ✅ shadcn table primitives + shadcn data-table structure; lists are tables in a bordered frame (a list frame, not a card layout); `ef-rtable` stays in `console.css` (used by both consoles); no new colours — tokens guards run |
| VI — layered, raw SQL, no ORM, no DI | ✅ handler → service → repository unchanged; the helper builds fragments, repositories keep their SQL; whitelisted sort maps |
| VI — server cache is the truth | ✅ TanStack Query; URL for view state; `localStorage` only for hidden columns (a device convenience, not server data) |
| VII — observability | ✅ `ListQueryDepthRefused` and `ListQueryParamIgnored` metrics through the shared metrics helper; PostHog `list_viewed {list, mode}` / `list_filtered {list}` events in the typed taxonomy (no search text, no ids) |
| 071 — no timers | ✅ live kinds invalidate list keys; `check-no-refresh-timers.sh` stays green |
| Technology standards | ✅ TanStack Table is in the locked suite; v9 is a version move, not a swap |
| Real-world identifiers | ✅ none introduced |
| Mode of work | ✅ operator runs the migration and deploys (quickstart §2–3) |

**Justified additions**: none. **Violations**: none.

**Post-design re-check**: unchanged — the design added no route, runtime, table or writer. The one compromise is
recorded in R3: on keyset ledgers a reload past page 1 returns to page 1 (a cursor in a link would be stale).

## Project Structure

### Documentation (this feature)

```text
specs/103-console-data-tables/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md
├── contracts/list-contract.md      # wire contract + per-endpoint params
├── contracts/data-table-ui.md      # client layer API + behaviour
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_console_list_indexes.sql           # indexes only (data-model.md)

packages/shared-types/src/list.ts                       # ListQuery, ListPage, ListViews (PagedDTO retired)
packages/web-kit/src/data-table/                        # NEW module (exports "@effy/web-kit/data-table")
├── DataTable.tsx  StaticTable.tsx  ListPage.tsx
├── ColumnHeader.tsx  Pagination.tsx  ColumnMenu.tsx  DateRangeFacet.tsx
├── list-search.ts  use-list-state.ts  list-query.ts  column-meta.ts  hidden-columns.ts
└── __tests__/
packages/web-kit/src/console/DataTable.tsx              # removed (replaced)
packages/web-kit/src/patterns/Toolbar.tsx               # Pager removed; SearchBox/Facet/ViewSelect kept
packages/web-kit/src/console/StaffShell.tsx             # <main> min-height (R7)

apis/edge-api/shared/src/lib/list-query.ts              # parse, orderBy, page/keyset clauses, counts, toListPage
apis/edge-api/shared/src/lib/list-query.test.ts
apis/edge-api/shared/src/lib/list-query.guard.test.ts   # whitelist sorts, id tie-break, bounded LIMIT
apis/edge-api/{orders,catalog,admin,fleet,inventory,shop}/src/**/repository.ts + service.ts   # per list

apps/back-office/src/features/<domain>/                 # each list screen + its route's validateSearch
apps/back-office/src/routes/*.tsx
apps/shop-web/src/features/{fulfillment,catalog,team}/  # shop lists; primitives' TableFrame/Th/Td/Tr removed
```

**Structure Decision**: the existing monorepo slices. The new client layer is a web-kit module beside
`console` and `patterns` because both consoles use it (CLAUDE.md "where a console style goes", rule 1);
backend logic goes in `@effy/edge-shared` because seven services use it (money/points/promotions precedent:
one implementation, many services).

## Delivery order (for /speckit-tasks)

1. **Foundation**: v9 upgrade (and the 3 existing call sites); `list.ts`; `list-query.ts` + guard; `data-table`
   module with behaviour tests; `ListPage` + shell height; index migration.
2. **Proof, offset**: back-office **Shops** (already page+total) end to end.
3. **Proof, keyset**: back-office **Orders** (tie fix, status/shop/date filters, sorts by total, URL state).
4. **Back-office lists by domain**: catalog (products, review queue, missing details, margin not set, imports,
   attribute library) → fleet (drivers, vehicles, exceptions) → admin (feedback, deliverability, coverage,
   promotions + codes/customers) → orders (courier parcels, customers browse + points) → shop detail (stock,
   history).
5. **Shop-web**: orders (selection), catalogue, availability (list → table), stock history.
6. **Kind B** sub-tables onto `StaticTable`; capped sets (R10) with the 409.
7. **Remove** the old `DataTable`, `Pager`, shop-web `SortTh`/`TableFrame`/`Th`/`Td`/`Tr`; a guard that fails a
   new raw `<Table>` in a `*ListScreen.tsx` outside the data-table module.
8. FEATURE-HISTORY entry; CLAUDE.md feature list line.

Each step leaves both consoles working: an unconverted list keeps its old code until its own step.

## Complexity Tracking

None — no constitution violations.
