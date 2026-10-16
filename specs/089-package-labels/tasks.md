# Tasks: Package Labels

**Input**: Design documents from `specs/089-package-labels/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R8), data-model.md, contracts/package-code.md, quickstart.md (P1–P7)

**Tests**: included — quickstart.md P1–P7 pin every behaviour.

**Paths**: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `SW` = `apps/shop-web/src/features/fulfillment`.

---

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261016150000_package_code.sql`: `public.new_package_code()` (30-char alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ`, random via `gen_random_bytes`, retry while taken); add `shop_fulfillment.package_code text`, backfill every row, then NOT NULL, UNIQUE, CHECK `^[2-9A-HJKMNP-TV-Z]{6}$`, DEFAULT `public.new_package_code()`; Down drops them (data-model.md)
- [X] T002 [P] Create `ST/package-code.ts` (`PACKAGE_CODE_ALPHABET`, `PACKAGE_TOKEN_PREFIX`, `packageToken`, `parsePackageToken`), export from `ST/index.ts`; test `ST/package-code.test.ts` including a pin that the alphabet equals the migration CHECK's character class (contracts/package-code.md, quickstart P2)
- [X] T003 [P] Add `qrcode-generator` (exact pinned version) to `apps/shop-web/package.json`; `pnpm install`

---

## Phase 2: Foundational

- [X] T004 Container test in `EA/shared/src/payments/package-code.container.test.ts`: a paid order filled by two shops gets two different valid codes; rows inserted before the column get one from the backfill path; a code never changes on update (quickstart P1)

**Checkpoint**: every package has a permanent code.

---

## Phase 3: User Story 1 — Every package has its own code (P1) 🎯 MVP

**Goal**: the code is visible beside the package wherever staff and shops look.
**Independent test**: one order, two shops → two codes, the same in shop console and back-office.

- [X] T005 [US1] Add `packageCode` to `AdminOrderPackageDTO` in `ST/order-admin.ts`; select `sf.package_code` in `EA/orders/src/orders/repository.ts` and map it in `EA/orders/src/orders/service.ts`; extend the orders test that builds a package
- [X] T006 [US1] Show the code beside each package in `apps/back-office/src/features/orders/OrderDetailScreen.tsx` (monospace, copyable text); component test beside it

---

## Phase 4: User Story 2 — A shop prints a label for each package (P1)

**Goal**: "Print labels" produces correct labels on three layouts.
**Independent test**: quickstart walk 1–4.

### Backend

- [X] T007 [US2] Add `label` (`packageCode`, `position`, `packageCount`, `suburb`, `cold`) to `ShopOrderDetailDTO` in `ST/shop-order-console.ts` (contracts/package-code.md); compute it in `EA/shop/src/orders/repository.ts` (window over the order's fulfilments by `created_at, id`; city from the address; storage attribute → frozen | chilled | null) and map in `EA/shop/src/orders/service.ts`
- [X] T008 [P] [US2] Extend `EA/shop/src/orders/repository.container.test.ts`: position/count across two shops; cold class; suburb; the detail carries no window, day or estimate (quickstart P5)

### Console

- [X] T009 [P] [US2] Create `SW/labels/code128.ts`: Code Set B encoder (start B 104, checksum mod 103, stop) returning module widths and an SVG string; test `SW/labels/code128.test.ts` against known encodings (quickstart P3)
- [X] T010 [US2] Create `SW/labels/labels.ts`: `renderLabel(doc)` (QR via `qrcode-generator` level M as SVG, Code 128 SVG, code in large type, `EF-… · package n of m`, EFFY/COURIER from `deliveredBy`, suburb, cold mark) and `printLabels(docs, layout)` writing one standalone document into a new window with `@page` sizes for `roll62` (62×100 mm), `label4x6`, `a4sheet` (3×7, 63.5×38.1 mm); everything escaped; print-only colours with the pick-list exemption note
- [X] T011 [P] [US2] Test `SW/labels/labels.test.ts`: every required element present and the shop name, recipient name, street and any `$` amount absent, on all three layouts (quickstart P4)
- [X] T012 [US2] Add "Print labels" beside "Print pick list" in `SW/OrderDetailScreen.tsx` with a layout choice remembered in `localStorage` (try/catch); show the package code in the header; capture analytics `labels_printed` (layout, count) through the shop taxonomy; update `SW/OrderDetailScreen.test.tsx`

---

## Phase 5: User Story 3 — The driver's phone knows every code (P2)

**Goal**: driver reads carry codes; installed app unaffected.
**Independent test**: read a stop and a drop → codes match labels.

- [X] T013 [US3] Add optional `packageCode` to `CollectionPackage` and `DropPackageRef`, and `packageCodes` to collection-run stops and delivery-run drops in `ST/driver.ts`; regenerate `packages/shared-types/contract-driver/DriverDto.kt`
- [X] T014 [US3] Select `sf.package_code` in `EA/driver/src/work/sql.ts` (`ROUND_PACKAGES` and the drop's package read) and carry it through `EA/driver/src/work/service.ts` (collection run/stop, delivery run) and `EA/driver/src/work/delivery.ts` (drop)
- [X] T015 [P] [US3] Driver container test (extend `EA/driver/src/work/manifest.container.test.ts` or the drop-progress test): stop, run and drop carry the package's code (quickstart P7)
- [X] T016 [P] [US3] Driver-mobile host test decoding a drop/run fixture with and without the new fields in `apps/driver-mobile/shared/src/commonTest/.../features/delivery/`

---

## Phase 6: Polish

- [X] T017 Run `scripts/check-shop-delivery-words.sh`, `pnpm --filter @effy/shared-types driver-contract:check` equivalent (regenerate, no diff), shop-web/back-office token and lint checks
- [X] T018 Run the suites in quickstart.md (shared-types, shop, orders, driver, shared containers; shop-web, back-office; driver-mobile host tests + `assembleDebug`)
- [X] T019 Record 089 in `FEATURE-HISTORY.md` and the `CLAUDE.md` feature list; mark H1–H3 in `docs/driver-app-backlog.md`

---

## Dependencies & order

- T001 → everything that reads the column. T002, T003 independent.
- US1 (T005–T006), US2 (T007–T012) and US3 (T013–T016) are independent after Phase 2.
- Within US2: T007 before T012; T009–T011 alongside.

## Parallel opportunities

- T002 ∥ T003; after Phase 2, the three stories in parallel; T009 ∥ T008 ∥ T011.

## Implementation strategy

MVP = Setup + Foundational + US1 + US2 (codes exist and shops can label bags). US3 is small and ships
with it so scanning (H4+) starts with codes already on the phone.
