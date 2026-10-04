# Implementation Plan: Product Approval & Effy Margin

**Branch**: `067-product-approval-margin` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/067-product-approval-margin/spec.md`

## Summary

A shop submits new products and proposes changes to live ones; an Effy admin approves or sends
them back, and sets the margin that turns a shop price into a customer price.

Three design decisions keep this large slice from touching most of the platform:

1. **`product.price_amount` stays the CUSTOMER price.** It is read in 33 places on the hot path and
   by five cold-path services, every one of which means "what the customer pays". The shop's price
   gets a new column; approval writes `price_amount = shop price + margin`. No storefront, cart,
   saved-item, checkout-pricing or receipt read changes (research R1).
2. **A never-approved product is still a `draft`.** The one availability rule already refuses
   everything but `active`. A database CHECK makes `active` unreachable without an approval, so
   "not purchasable, not searchable, not viewable" holds with no hot-path change (research R2).
3. **A pending change lives beside the live row, never in it.** The live `product` row and its
   attributes and media are always the last approved version, so every existing read keeps
   returning it. The proposal sits in its own tables until decided (research R3).

What does change on the hot path is narrow: the order line records the shop price beside the
customer price, and the per-shop fan-out records a shop-price subtotal. Shop-facing money (order
view, Insights) switches to those.

## Technical Context

**Language/Version**: TypeScript on Node 22 (`apis/edge-api/{catalog,shop,notifications,shared}`,
`packages/shared-types`, `apps/shop-web`, `apps/back-office`); Go (`apis/core-api`); Kotlin 2.4 /
Compose Multiplatform (`apps/shop-mobile`)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL 16, raw SQL, one forward-only Goose migration with a backfill. S3 (existing
media bucket) for proposed images.

**Testing**: Vitest (unit + container against the real migrations), `go test` (unit + container),
Kotlin `commonTest`, `shop-contract:check`, source guards.

**Target Platform**: Lambda (new `edge-catalog`, `edge-shop`, `edge-notifications`); Fargate
(`core-api`); shop-web, back-office; shop-mobile (Android + iOS).

**Project Type**: monorepo — two backend paths, two web consoles, one mobile app.

**Performance Goals**: no added query on any customer read. Review queue first page under 1 s at
10,000 products. A stock adjustment is untouched and stays as fast as today (SC-005).

**Constraints**: a shop never receives a margin figure (FR-039); a product in review is unreachable
by customers by any route (FR-003); a placed order never changes (FR-045); the day-one catalogue is
identical (SC-012); `edge-admin` cannot take more routes (434/500 CloudFormation resources).

**Scale/Scope**: 1 migration; 1 new cold-path service (~9 routes); ~6 changed and ~4 new shop
routes; 3 contract files; hot path: 2 statements; 2 new notification types; back-office review
feature; shop-web and shop-mobile product screens.

### Unknowns

All resolved in [research.md](research.md), except one measured at the start of implementation:
`edge-shop`'s CloudFormation resource count (R5).

## Constitution Check

| Principle | Verdict | Note |
|---|---|---|
| I. Spec-driven | PASS | Spec has no tech. Research sends nothing back to it. |
| II. Shared contracts | PASS | Margin arithmetic has ONE home (`@effy/edge-shared`); the hot path never computes a margin, it reads the result. DTOs in `shared-types`; shop Kotlin generated. `price_amount` keeps one meaning platform-wide. |
| III. Dual-path discipline | PASS | Review, decisions and shop catalogue writes are operator/admin CRUD → cold path. The hot path gains no route; it snapshots one more value where it already writes the order line. |
| IV. Auth isolation | PASS | New service attaches to the shared gateway with the existing back-office authorizer. Shop routes stay behind the shop authorizer. Decide = `admin`/`manager` from `admin.staff`; read = any active staff. |
| V. Design | PASS | No new token. Review queue is a table; before/after is detail rows. Review state uses the closed status mapping (waiting → warning, sent back → destructive, live → success). |
| VI. Layered architecture | PASS | handler → service → repository; rows mapped to DTOs. |
| VII. Observability | PASS | Events and one alarm declared below. No product names or prices in telemetry. |

**Gate result**: no violations. One recorded structural choice, not a violation: a new cold-path
service, on the measured constraint 053, 054 and 056 each hit (Complexity Tracking).

### Telemetry declared (Principle VII)

| Signal | Where | Properties | Purpose |
|---|---|---|---|
| `product_submitted_for_review` | shop-web, shop-mobile | `kind` (`new` \| `change`) | Shop adoption |
| `product_review_decided` | back-office | `kind`, `decision` (`approved` \| `sent_back`), `marginKind` (`percent` \| `amount` \| `none`) | Reviewer throughput. ⚠ Never the margin value |
| `ProductReviewOldestWaitingHours` | CloudWatch, from a scheduled measure in `edge-catalog` | — | Alarm when the oldest item exceeds a configurable age: an unwatched queue stops shops selling, silently |

## Project Structure

### Documentation (this feature)

```text
specs/067-product-approval-margin/
├── plan.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── review-admin.md          # back-office routes
│   ├── shop-products.md         # changed shop routes + DTO
│   └── order-money.md           # the two prices on an order
└── checklists/requirements.md
```

### Source code

```text
db/migrations/
└── <ts>_product_approval_margin.sql     # columns + backfill + CHECK; product_change(+media);
                                         # order_item / shop_fulfillment shop-price columns;
                                         # notification type widening

packages/shared-types/src/
├── product-review.ts                    # NEW — ReviewState, MarginInput, review item + decision DTOs
├── catalog.ts / shop.ts                 # shop ProductDetail gains reviewState, shopPrice, customerPrice, pendingChange
└── shop-order-console.ts                # shop order money documented as shop price
# + regenerated: contract-shop/

apis/edge-api/shared/src/
├── lib/margin.ts                        # NEW — the ONE margin calculation (+ tests)
└── product-margin.guard.test.ts         # NEW — edge-shop never selects margin columns

apis/edge-api/catalog/                   # NEW SERVICE — back-office authorizer
├── serverless.yml
└── src/review/{sql,repository,service,authz,handler-support}.ts
    src/functions/                       # queue list · item detail · approve · send-back · set-margin ·
                                         # margin-not-set list · scheduled queue-age measure

apis/edge-api/shop/src/products/
├── service.ts / repository.ts           # update → pending change when approved; submit / withdraw;
                                         # status rules; DTO prices
├── change.ts                            # NEW — propose / update / withdraw a pending change, diff
└── media.ts                             # uploads for an approved product go to the pending change

apis/edge-api/shop/src/{orders,insights}/   # shop-facing money reads shop price
apis/edge-api/notifications/src/         # two new types + copy

apis/core-api/internal/features/checkout/store.go   # snapshot shop price on the order line; fan-out shop subtotal

apps/back-office/src/features/product-review/       # NEW — queue, item, before/after, decide, margin
apps/shop-web/src/features/catalog/                 # state chips, submit/withdraw, pending-change view, two prices
apps/shop-mobile/shared/src/commonMain/.../features/catalog/   # the same
```

**Structure decision**: one new service, `apis/edge-api/catalog`, for the back-office half. The
shop half stays in `edge-shop` beside the product code it changes, so there is one product
repository for shop writes, not two.

## Phase plan

1. **Foundation** — migration with backfill; margin calculation + tests; contracts; the status
   CHECK; scaffold `edge-catalog`. Proves SC-012: the catalogue and prices are identical after
   the migration.
2. **US1 + US2 new products** — shop submit / withdraw; review queue and item; approve with margin;
   send back with reason.
3. **US3 changes to live products** — shop edits become a pending change (details, attributes,
   images); before/after; approve applies atomically; send back leaves the live row untouched.
4. **US4 never waits** — prove stock and off-sale paths create no review item and disturb none.
5. **US5 margin** — set/change on live products; "margin not set" list; price-change reopens margin.
6. **US7 two prices on an order** — hot path snapshot; shop order view and Insights on shop prices.
7. **US6 shop surfaces** — shop-web and shop-mobile states, prices, pending-change view.
8. **US8 + notifications** — audit rows; two notification types; queue-age alarm.
9. **Polish** — guards, telemetry, parity registers, quickstart walk.

## Risks

| Risk | Mitigation |
|---|---|
| A read somewhere treats `price_amount` as the shop's price | It never was: every existing reader means "what the customer pays". The backfill sets `shop_price_amount = price_amount`, and a container test asserts every pre-existing price is unchanged (SC-012). |
| The status CHECK rejects existing rows | The backfill sets `approved_at` for every non-draft product in the SAME migration, before the CHECK is added; a container test loads the real migrations over seeded pre-067 rows. |
| A shop reads a margin through a DTO or a query | Shop DTOs carry `shopPriceAmount` and `customerPriceAmount` only; a guard fails naming any `edge-shop` file that references `margin_kind` / `margin_value` (FR-039). |
| A pending image leaks to customers | Proposed images live in their own table and only enter `product_media` inside the approval transaction; storefront media reads are unchanged. |
| Approval applies half a change | One transaction: product row, attributes, media, change row, audit row. Container test kills it midway and asserts nothing moved. |
| Admin approves a proposal the shop edited meanwhile | Decisions carry the item's version; a mismatch is refused. ⚠ Version is compared as the database's own text, never a JS `Date` (056: millisecond truncation made every edit fail). |
| Enum widening (`notification_request.type`) misses a reader | Reader audit in research R9, as 053/056/057/059 each learned. Deploy `notifications` BEFORE the producer. |
| Shop Insights figures jump | Backfilled shop prices equal customer prices, so history is unchanged; figures diverge only for orders on products with a margin, which is the point. Container test recomputes a pre-067 day and asserts identical output. |
| `edge-shop` is near the CloudFormation limit | Measured first (T-setup). If the 4 new routes do not fit, they move into `edge-catalog` behind the shop authorizer (per-route authorizers, as `edge-inventory` already does). |
| Old `edge-shop` running between `db-up` and its deploy lets a shop set a draft `active` | The CHECK refuses it (a 5xx for that one action, briefly). Deploy `edge-shop` immediately after `db-up`; stated in quickstart. |

## Complexity Tracking

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| A new cold-path service `edge-catalog` | `edge-admin` packages to 434/500 CloudFormation resources with `versionFunctions: false` already spent; ~9 routes ≈ 45 resources do not fit | Adding to `edge-admin` fails the deploy. Adding to `edge-shop` would put approve/margin routes in the service whose authorizer is the shop pool — one mis-wired route lets a shop approve itself. |
