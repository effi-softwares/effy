# Implementation Plan: Data Lifecycle

**Branch**: `113-data-lifecycle` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/113-data-lifecycle/spec.md`

## Summary

Three clean-ups that run by themselves, a page where staff can watch them, and the rules for what a deleted customer
leaves behind.

**Unpaid orders** (R1–R4):
- A new `unpaidOrders` function in `commerce` runs every 15 minutes. It closes orders still awaiting payment after the
  abandon time (default 24 hours, admin-set 1 hour to 7 days) through one entry point, `abandonOrder`
  (`@effy/edge-shared/payments`).
- It cancels the payment at the provider first, then frees the points, codes and delivery place under the new status
  `abandoned`.
- **A defect found in planning is fixed on the way.** Today a declined card marks the order failed at once. A retry that
  then succeeds is charged with no order placed. A decline now leaves the order unpaid, and a success that arrives for an
  ended order is refunded automatically.
- "Placed" gets one definition (`placed_at IS NOT NULL`), so the new status can't be counted as an order anywhere.

**Closure** (R5, R6):
- An unpaid order no longer blocks deleting the account; closing abandons it.
- Restore is refused once the promised date has passed.

**Erasure** (R7, R8):
- A new `accountErasure` function in `customer` runs hourly and erases each due account whole:
  1. provider customer;
  2. Cognito user;
  3. one transaction that forfeits points, deletes personal data, scrubs retained orders to suburb and postcode, and leaves
     a tombstone customer row.
- A container test erases a seeded customer and scans every text column in the database for their details.
- Barred accounts leave a keyed fingerprint, and the deletion screen's security line is rewritten to say exactly that.

**Phone registrations** (R11): the daily purge removes registrations unconfirmed for 270 days. shop-web gains the
re-register on start that both apps already do.

**Seeing it work** (R9, R10):
- An append-only `housekeeping_run` with one writer.
- Back-office Settings › Business › **Clean-ups**: three jobs, the abandon time, the activity drawer and tour HK.
- Error alarms, staleness alarms, and an alarm when money moves because of a race.

## Technical Context

**Language/Version**: TypeScript 5.9 (Node 22 Lambdas, React 19 back-office and shop-web, Next.js 16 customer-web),
Kotlin 2.4 (customer and driver apps), PostgreSQL 16 SQL, Terraform.

**Primary Dependencies**: existing only.
- `@effy/edge-shared`: `payments` (gateway, finalize, refunds), `points` (`forfeit`), `lib/db`, `lib/devices`,
  `activity`, `live`, `lib/metrics`.
- The Stripe SDK through the existing gateway, which gains `deleteCustomer`.
- The Cognito SDK, which gains `AdminDeleteUser`.
- `@effy/shared-types` and the quicktype generators.
- `@effy/web-kit` (patterns, activity-log, tour, settings layout) and the design-system shadcn components.

**No new package.**

**Storage**: one additive migration, `20261112090000_data_lifecycle.sql`, with a full Down (see
[data-model.md](data-model.md)):
- `order` status `abandoned` and an index;
- refund kind `unplaced`;
- customer `erased` state, nullable email, `erased_at` and `matches_erased_barred_on`;
- closure `erased_at`;
- new tables `erased_barred_fingerprint`, `housekeeping_run`, `housekeeping_settings` and
  `housekeeping_settings_change`.

**Testing**:
- vitest unit tests, plus container tests on the local Postgres recipe:
  - `abandonOrder` / `finalizeAbandoned` / `refundUnplaced` against a fake gateway;
  - the webhook's decline, retry and late success;
  - the clean-up's abandon time and batching;
  - erasure, with the **full-database scan** (SC-002), the forfeit, restore before and after the date, a retry after a
    failed external step, the fingerprint, and re-registration;
  - closure without the unpaid-order block;
  - the purge's 270-day prune;
  - the clean-ups routes and activity.
- guards:
  - `placed-order.guard` and `housekeeping.guard` (new);
  - the payments writer guard (`abandoned` only in `finalize.ts`);
  - `background-alarms`, `activity`, the change map, `live.contract`, gateway capacity;
  - `deletion-copy`;
  - back-office tours, skeletons and the settings index.
- Kotlin host tests for the closure refusals and the removed blocker kind, and a re-register-on-start test in each app.
- The quickstart walk.

**Target Platform**:
- `commerce`: the clean-up, the webhook and the customer order list;
- `customer`: erasure, closure and restore;
- `notifications`: purge;
- `orders`: three staff routes, the customer reads and the placed-order readers;
- every service through the shared library (`PLACED_ORDER_SQL`, payments);
- back-office, customer-web, shop-web, the customer app and the driver app (a test only);
- Terraform: alarms and one secret.

**Project Type**: a monorepo of serverless services, three web apps, two KMP apps and shared packages.

**Performance Goals**:
- the unpaid clean-up handles 50 orders a run (each with one provider call, 8 s timeout) inside 120 s;
- erasure handles 25 accounts an hour, about 600 a day, far above dev's and launch volumes;
- the 270-day prune deletes in 1,000-row batches;
- the clean-ups page reads in under 1 s (three latest-run lookups on `(job, started_at DESC)`).

**Constraints**:
- **Money lives once**: abandoning, the late refund and finalisation are all in `@effy/edge-shared/payments`.
- **One writer per fact**: order status through `finalize.ts`; runs through `recordRun`; settings through the `orders`
  service; erasure through `eraseCustomer`.
- **No personal data in logs, metrics or `housekeeping_run`.** Problems are class names or fixed words.
- **The disclosure must stay true** (034 SC-010): `RETAINED` is rewritten with the code that makes it true.
- **No compatibility fields**: `order_awaiting_payment` and `resolvableByShopper` are removed from both clients.
- No timers in clients (live kind `housekeeping`); every console page has a tour and its own skeleton; shadcn only in the
  consoles; the customer app has no dialogs; never edit a committed migration; zone only through `OPERATING_TZ`.
- **Real-world identifiers**: the secret's name is derived from `var.env`. No address, domain or account id is introduced.

**Scale/Scope**:
- 1 migration;
- shared:
  - `payments/abandon.ts` (new);
  - `finalize.ts` (`finalizeAbandoned`);
  - `refunds` (`refundUnplaced`);
  - `gateway.ts` (`deleteCustomer`);
  - `lib/placed-order.ts` and `lib/housekeeping.ts` (new);
  - live kind;
  - the readers in R4;
- commerce: `src/housekeeping/{handler,job}.ts`, the webhook, the order list and `serverless.yml`;
- customer: `src/erasure/{handler,job,repository,fingerprint}.ts`, the closure service, repo and copy, the registration
  check, and `serverless.yml` (IAM and secrets);
- notifications: purge, two steps;
- orders: `src/housekeeping/{service,repository,activity}.ts`, 3 functions, the customer reads and the `serverless.yml`
  routes;
- shared-types: `housekeeping.ts` plus a test, `customer.ts`, `live.ts`, `activity-log.ts`, regenerated contracts;
- back-office about 6 files (screen, repo, queries, words, tour, route) plus the customer page note and the order
  "Deleted customer" fallback;
- customer-web about 2 (closure refusals, blocker kind); customer app about 3; shop-web 1 (re-register); driver app 1
  (test);
- infra: `background-functions.tf` (two alarms), a new `housekeeping.tf` (stale and late-refund alarms, the fingerprint
  secret and its SSM ARN);
- Makefile: none (no new stack).

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | spec → plan → tasks. Planning found four things, and each was written back to the spec before this plan: the decline defect (FR-006a), no bar reason exists (FR-016), restore after the date (FR-009), and the tour words (HK). FR-008 is marked already built. ✓ |
| II Shared contracts | Job keys, counts and words are in `@effy/shared-types` `housekeeping.ts`, held to the migration CHECK by a test. The closure DTO changes are regenerated for the customer app. `ERASED_CUSTOMER_WORD` is one word. ✓ |
| III One serverless backend | Two scheduled Lambdas in existing services (`commerce`, `customer`) and one step in an existing one (`notifications`). Three routes in `orders` on the staff gateway: **231 → 234 of 300 (78%)**, past 75% as 112 recorded, with 112's R2 plan unchanged. No new service, queue or always-on compute. ✓ |
| IV Auth isolation | Staff routes sit behind the back-office authorizer, with roles from `admin.staff` (admin-only write). Customer routes are unchanged in scope. The customer pool's admin IAM gains `AdminDeleteUser`, scoped to that pool's ARN and attached to the `customer` service only. ✓ |
| V Native feel / design | The Clean-ups page is a settings page: `StaticTable` and detail rows, no metric cards, shadcn, the 104 drawer, tour HK and its own skeleton. Customer surfaces gain only refusal words, through the existing kits (the app's `EffySheet`). ✓ |
| VI Layered architecture | Handler → job / service → repository and shared SQL in every service. Money in `payments`. React Query in back-office. ViewModels in the app. ✓ |
| VII Observability | Metrics per job (R12); error, staleness and late-refund alarms in Terraform to the alerts topic; no PII in logs or runs. ✓ |
| Real-world identifiers | None introduced. The secret is named from `var.env` and its value is random. ✓ |
| Gateway capacity | Staff 234/300 (78%). Below the 90% stop line, and nothing merged. ✓ (recorded) |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/113-data-lifecycle/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R12
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── housekeeping-api.md
│   └── jobs.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261112090000_data_lifecycle.sql

packages/shared-types/src/
├── housekeeping.ts (+ .test.ts)          # jobs, counts, words, DTOs
├── customer.ts                           # ERASED_CUSTOMER_WORD, closure DTO changes, staff fields
├── live.ts / activity-log.ts             # housekeeping kind / log

apis/edge-api/shared/src/
├── payments/abandon.ts (+ container test)
├── payments/finalize.ts                  # finalizeAbandoned
├── payments/refunds/                     # refundUnplaced
├── payments/gateway.ts                   # deleteCustomer
├── lib/placed-order.ts (+ guard)
├── lib/housekeeping.ts (+ guard)         # recordRun
└── promotions/candidates.ts, points/reconcile.ts   # PLACED_ORDER_SQL

apis/edge-api/commerce/
├── src/housekeeping/{handler,job}.ts (+ container test)
├── src/webhook/handler.ts                # decline keeps the order unpaid; late success → refundUnplaced
├── src/orders/repository.ts              # placed or awaiting payment only
└── serverless.yml                        # unpaidOrders, every 15 minutes

apis/edge-api/customer/
├── src/erasure/{handler,job,repository,fingerprint}.ts (+ container test with the full scan)
├── src/closure/{service,repo}.ts         # no unpaid blocker; abandon on request; restore before the date only; RETAINED
├── src/customer/repo.ts                  # fingerprint match at registration
└── serverless.yml                        # accountErasure hourly; AdminDeleteUser; provider and fingerprint secrets

apis/edge-api/notifications/src/purge/    # 270-day prune, run purge
apis/edge-api/orders/
├── src/housekeeping/{service,repository,activity}.ts (+ tests)
├── src/functions/housekeeping-v1-{get,put,activity}.ts
├── src/customers/repository.ts, src/orders/repository.ts   # placed-order, erased fallbacks
└── serverless.yml                        # 3 staff routes

apps/back-office/src/features/settings/housekeeping/        # screen, repo, queries, words
apps/back-office/src/features/{tours,customers,orders}/     # HK tour; "Being deleted"; "Deleted customer"
apps/customer-web/app/account/...                           # closure refusals; blocker kind removed
apps/customer-mobile/shared/.../features/account/...        # same
apps/shop-web/src/features/notifications/useNotifications.ts  # re-register on start

infra/envs/dev/background-functions.tf, infra/envs/dev/housekeeping.tf
```

**Structure Decision**: every change lands in the service that owns the fact (R1). The shared library gains the money
step and the two cross-service definitions: "placed" and "a run".

## Complexity Tracking

None.
