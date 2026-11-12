# Implementation Plan: Hold Stock at Checkout

**Branch**: `dev` (no feature branch; the operator commits) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/114-checkout-stock-holds/spec.md`

## Summary

When a shopper presses Pay, the counted sizes in their order are held for them for a set time (15 minutes by
default; admins set 5-60 on Settings › Clean-ups). Other shoppers can buy only the shelf count minus live holds.
Holds end:
- **on their own**, when the time passes. A hold counts only while `held_until > now()`, so no sweep is needed;
- **at once**, when the order is paid, abandoned (113) or failed, or when the shopper's next Pay replaces them.

The shopper is never charged for a basket other than the one shown. The intent carries the lines the checkout
displayed, and any difference, before writing or under the size locks, is 409 `stock_changed`. A payment that arrives
after its hold ran out takes only what is not held for others, and anything missing is today's short-order path.

Shops and back-office see per size: In stock, In checkouts, Left to sell, updated live.

The approach follows the existing delivery-window hold:
- a row lock on the size serialises two shoppers;
- live holds are counted by time;
- the shopper's own holds are left out.

The rule stays in `lib/availability.ts` (054's one definition). One new shared module, `@effy/edge-shared/stock`
`holds.ts`, is the only writer of `stock_hold`. **No new routes**: the hold time reuses 113's Clean-ups settings route.

Details: [research.md](research.md) (R1-R14), [data-model.md](data-model.md),
[contracts/checkout-intent.md](contracts/checkout-intent.md), [contracts/stock-and-settings.md](contracts/stock-and-settings.md),
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**:
- TypeScript 5 on Node 22 (edge-api Lambdas, Serverless Framework v3);
- React 19 + TypeScript (back-office, shop-web, customer-web);
- Kotlin 2.4.0 / Compose Multiplatform 1.11.1 (customer app).

**Primary Dependencies**:
- `@effy/edge-shared`: `lib/availability.ts`, `payments/finalize.ts`, `live`, `lib/metrics`, the new `stock/holds.ts`;
- `@effy/shared-types`: `checkout.ts`, `inventory.ts`, `housekeeping.ts`, `live.ts`;
- `@effy/web-kit`: `data-table`, the tour, the activity log;
- TanStack Query (web).

**Storage**:
- PostgreSQL 16, raw SQL, one Goose migration `20261112120000_checkout_stock_holds.sql`;
- new table `stock_hold`;
- new column `housekeeping_settings.stock_hold_min`.

**Testing**:
- vitest unit and guard tests;
- container tests on the local Postgres recipe (`container-tests-local-postgres` memory);
- customer app host tests (`commonTest`), plus the Android and iOS compiles;
- Goose up / down / up.

**Target Platform**: AWS Lambda (ap-southeast-2) behind the shared and staff HTTP gateways; Amplify-hosted web; the
Android and iOS customer app.

**Project Type**: monorepo. One backend (edge-api services plus the shared library), three web apps, one mobile app
touched.

**Performance Goals**:
- The left-to-sell sum adds one indexed correlated sum per size to listings and the cart. `stock_hold` only ever holds
  unpaid orders' rows.
- Payment start gains one transaction locking the order's counted sizes (typically under 20 rows).
- SC-005: the shop sees a held change within 5 seconds, over the live channel.

**Constraints**:
- No new routes: the staff gateway is at 234/300, past the 75% warning.
- No new compute, and no clean-up job (expiry by time).
- `shownLines` is required, so the customer app and website must ship with commerce.
- Customer wording: one new sentence only, mirrored in Kotlin.

**Scale/Scope**:

| Area | Change |
|---|---|
| Migration | 1 |
| Shared library | 1 new module; changes to `availability.ts`, `stock-state.ts`, `finalize.ts`, `live/announce.ts` |
| Services | commerce (checkout, cart, saved, housekeeping job), orders (housekeeping settings), inventory and inventory-staff (stock reads), shop (product page and Availability stock), catalog (back-office product sizes), customer (closure abandon announces stock), storefront (rule call sites) |
| Screens | 3 console screens (shop-web Sizes and Availability, back-office Sizes) + Clean-ups; customer-web and customer app checkout refusal handling |
| Infra | 1 alarm |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Spec-driven | spec → plan → tasks. The spec has no technology. One spec line (the stock hold entity) was amended after R1, as the method allows | PASS |
| II. Monorepo, shared contracts | `shownLines`, `STOCK_CHANGED_*`, `ProductStockDTO.held` / `leftToSell`, `stockHoldMinutes` live in `@effy/shared-types`; Kotlin regenerated, plus a words fixture | PASS |
| III. Single serverless backend | All code in `apis/edge-api`. No new service, route, gateway or compute. Money logic stays in `@effy/edge-shared/payments` (finalize). Commerce stays on `effy_shopper` | PASS |
| IV. Auth isolation | Intent stays customer-pool; stock reads stay shop and staff; the settings route stays admin-only for writes. Shops see numbers only (FR-017) | PASS |
| V. Native-feel, consistent design | Console columns are added to the existing `DataTable` / sizes sections (no cards). Refusal reuses each client's existing review-step error. The customer app uses `EffySheet` rules (no dialog). The Clean-ups tour version is raised with the new step | PASS |
| VI. Layered architecture | handler → service (`createIntent`) → store / repository. The one writer is `stock/holds.ts` (guarded). The one read rule is `availability.ts` (guarded). Explicit wiring | PASS |
| VII. Observability | Metrics `StockHolds`, `StockHoldsEnded`, `StockHoldLate` in the fixed money namespace `Effy/Commerce`; Terraform alarm `StockHoldLateShort`. **Product events (PostHog)**: customer-web `checkout_stock_changed`, customer app `CheckoutStockChanged` (no properties; the auth subject only). No PII in metrics or events | PASS |
| Real-world identifiers | None introduced; the alarm uses the existing alerts topic | PASS |
| Live updates (071) | Hold changes announce `shop`/`ops` `stock` after commit; no timers | PASS |

**Post-design re-check (after Phase 1)**: still PASS.
- **Watch**: the change-map guard must see the new announcements in `checkout-intent-v1-post` and the unpaid-orders
  job.
- **Watch**: the availability guard's new stock-comparison check must not flag the operator reads (`inventory`,
  `catalog`, `shop`), which compare the shelf on purpose. They are named exemptions, as `availability-exempt:` comments
  are today.

## Project Structure

### Documentation (this feature)

```text
specs/114-checkout-stock-holds/
├── plan.md              # this file
├── research.md          # R1-R14
├── data-model.md        # stock_hold, stock_hold_min, contract changes
├── quickstart.md        # operator deploy, local checks, the walk
├── contracts/
│   ├── checkout-intent.md      # shownLines + 409 stock_changed
│   └── stock-and-settings.md   # held / leftToSell, the Clean-ups field
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261112120000_checkout_stock_holds.sql        # NEW

packages/shared-types/src/
├── checkout.ts             # + shownLines, STOCK_CHANGED_CODE, STOCK_CHANGED_MESSAGE
├── checkout-words.fixtures.json  # NEW: the sentence, for the Kotlin twin
├── inventory.ts            # ProductStockDTO + held, leftToSell
├── housekeeping.ts         # + stockHoldMinutes, STOCK_HOLD_LIMITS
└── (contracts regenerated: Dto.kt / CommerceDto.kt / schema)

apis/edge-api/shared/src/
├── stock/holds.ts                      # NEW: holdStock, releaseStockHolds, consumeStockHolds (one writer)
├── stock/index.ts                      # NEW: exports
├── stock/holds.container.test.ts       # NEW: SC-001 concurrency, expiry, own holds, late payment
├── stock/holds.guard.test.ts           # NEW: one writer, limited readers
├── lib/availability.ts                 # stockHeldSql, leftToSell, rule + optional customer exclusion
├── lib/availability.test.ts / availability.guard.test.ts   # truth table with held; no hand-written stock comparisons
├── payments/finalize.ts                # short = qty − left; consume holds; release on abandon/fail; ops stock announce
├── lib/stock-state.ts                  # StockFacts.held → ProductStockDTO.held / leftToSell
├── live/announce.ts                    # ops scope may carry "stock"
└── index.ts                            # export stock

apis/edge-api/commerce/src/
├── checkout/service.ts / store.ts      # shownLines check first; holdStock LAST (release on any later error); stock_changed; metrics; announcements
├── functions/checkout-intent-v1-post.ts# parse shownLines; 409 stock_changed
├── cart/service.ts / repository.ts     # left-to-sell cap, own holds excluded
├── saved/repository.ts                 # onto the one rule (was a second definition)
├── housekeeping/job.ts                 # announce stock after abandons that released holds
└── checkout/*.container.test.ts        # stock_changed, decline keeps holds, paid consumes

apis/edge-api/orders/src/housekeeping/  # service.ts (+ stockHoldMinutes), activity.ts (words), tests
apis/edge-api/inventory/src/stock/      # repository.ts / list.ts: held + leftToSell (shop and staff stacks)
apis/edge-api/shop/src/                # products/handler-support.ts, availability/repository.ts: select held for stockState
apis/edge-api/catalog/src/products/     # repository.ts / service.ts: stockHeld on back-office product sizes
apis/edge-api/customer/src/closure/     # service.ts: announce stock after abandonOrder released holds
apis/edge-api/storefront/src/           # catalog/, home/, lib/cards.ts: rule call sites (no customer exclusion)

apps/back-office/src/features/
├── products/ProductScreen.tsx          # sizes: In checkouts, Left to sell
├── settings/housekeeping/              # hold time field, words, test
├── live/routes.ts                      # stock → product keys (ShopStockPanel is a low-stock list: unchanged)
└── tours/tours.ts                      # HK step + version (from specs/107 inventory)

apps/shop-web/src/features/catalog/
├── VariantsSection.tsx                 # In checkouts, Left to sell
├── AvailabilityScreen.tsx              # same columns
(apps/shop-web/src/features/live/routes.ts  # stock also refreshes the product page)

apps/customer-web/app/checkout/CheckoutFlow.tsx   # send shownLines; handle 409 stock_changed

apps/customer-mobile/shared/src/commonMain/.../features/checkout/
├── data/HttpCheckoutRepository.kt      # send shownLines; decode stock_changed
├── domain/ (refusal type)              # StockChanged
└── presentation/ (ViewModel + words)   # back to review, the sentence, re-read
     + commonTest: words fixture test, ViewModel refusal test

infra/envs/dev/stock-holds.tf           # NEW: StockHoldLateShort alarm
specs/107-backoffice-guided-tours/spec.md  # HK inventory: the new step
docs (on completion): FEATURE-HISTORY.md, CLAUDE.md feature line, ORDER-FLOW-GAPS.md (054 A6 closed),
     docs/next-implementation-candidates.md (#16, plus F5's stale items #4/#6)
```

**Structure Decision**: the existing monorepo layout. Backend changes are in the shared library (the rule, the
writer, finalize) and the services that own each route. No new service or stack. Every surface that shows stock or
pays is touched: shop-web, back-office, customer-web and the customer app. The driver app is not touched.

## Deploy order (for tasks and the hand-off)

1. `db-up`, so the table and column exist before any code reads them.
2. `apply`: the alarm.
3. `SERVICE=commerce`, then `SERVICE=orders`, then `edge-deploy-all` (the shared rule, finalize and the operator
   reads).
4. back-office, shop-web, customer-web, the customer app.

Because `shownLines` is required, shoppers on a client older than 114 are refused at Pay (422) until that client is
updated. In dev this is a short window. Deploy commerce and push the web pipeline together.

## Complexity Tracking

No constitution violations. Nothing to justify.
