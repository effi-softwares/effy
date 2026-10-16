# Tasks: Scan Versus Manual Visibility

**Paths**: `EA` = `apis/edge-api`, `BO` = `apps/back-office/src/features`, `ST` = `packages/shared-types/src`.

## Phase 1: Setup
- [X] T001 Add the three additive fields and `HandoverStep` to `ST/order-admin.ts`, `ST/dispatch.ts`, `ST/shop.ts` (contracts/staff-reads.md)

## Phase 2: US1 — hand-overs on the order (P1) 🎯 MVP
- [X] T002 [US1] Read hand-overs per package in `EA/orders/src/orders/repository.ts` and map `handovers` in `service.ts`; container test (P1)
- [X] T003 [US1] Render them under each package in `BO/orders/components/PackageRows.tsx`; extend `PackageRows.test.tsx` (P4)

## Phase 3: US2 — counts on a round (P2)
- [X] T004 [US2] Count by method per stop in `EA/fleet/src/dispatch/sql.ts` (`ROUND_DETAIL_STOPS`) and map in `service.ts` `readRound`; container test (P2)
- [X] T005 [US2] Show the counts per stop in `BO/dispatch/RoundDetailScreen.tsx`

## Phase 4: US3 — labels that didn't scan, per shop (P2)
- [X] T006 [US3] 30-day counts in `EA/admin/src/shops/repository.ts` (`getShopDetail`) and `handler-support.ts`; container test (P3)
- [X] T007 [US3] Show them on `BO/shops/ShopDetailScreen.tsx`

## Phase 5: Polish
- [X] T008 Type checks and suites (orders, fleet, admin, back-office); record 091 in `FEATURE-HISTORY.md`, `CLAUDE.md`, backlog H12
