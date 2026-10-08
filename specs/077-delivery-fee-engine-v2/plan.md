# Implementation Plan: Delivery Fee Engine v2

**Branch**: `dev` (feature directory `077-delivery-fee-engine-v2`) | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/077-delivery-fee-engine-v2/spec.md`

## Summary

One delivery fee per order, built from parts a person can read back — distance band, weight band,
basket value, window — plus a simpler table for courier delivery. Third slice of the delivery model v2
programme (`docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E3). It removes the first of 076's
three bridges: pricing by distance tier.

The approach, in eight decisions (reasoning in [research.md](research.md)):

1. **Evolve `delivery_fee_plan` in place**, additively, so the running checkout keeps selling between
   the migration and the deploy; the tier tables are dropped by a second migration afterwards (R1, R10).
2. **One formula in the pure engine** — `effyFee()` / `courierFee()` return the fee and its breakdown.
   Checkout and the simulator call the same function (R3).
3. **One fee per order.** The per-package fee stops being written; nothing downstream read it (F3, R4).
4. **Two surcharges that belong to the plan**: a *today* premium — the operator's "same-day is a bit
   dearer" — and an optional per-window premium (R5).
5. **The breakdown is stored on the order**, and the customer's lines are derived from it once (R7).
6. **The amount charged is the amount shown**: the client sends what it displayed; a difference is a
   409 with a fresh quote (R8).
7. **Courier pricing is a plan of another kind** — same table, same routes, charged to nobody yet (R9).
8. **Activation is one SQL function** that checks completeness, names every gap, and swaps the active
   plan in one statement (R11, R12).

⚠ **Three things the operator must know up front**
- **The same-day amount is asked for, not derived** (R10). The migration refuses to run without it.
- **Some postcodes' fees will move** (F2): those whose old tier did not match their own distance. A
  read-only pre-flight lists them before anything changes.
- **The shop console shows the customer's delivery charge today** (F1). This plan removes that row.
  Whether shops should see the customer's order **total** is a separate product call — raised, not
  decided.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose 3.27); TypeScript on Node 22 (Lambda, arm64); React 19
(back-office and shop-web Vite SPAs, customer-web Next.js 16); Kotlin 2.4 / CMP 1.11 (customer-mobile);
MJML + Handlebars (email-kit).

**Primary Dependencies**: none added.

**Storage**: two forward-only migrations — (1) columns on `delivery_fee_plan`, two new tables
(`delivery_distance_band`, `delivery_slot_premium`), one column on `order`, three SQL functions, one
a carry-over that raises rather than guesses; (2) drops the tier tables and
columns. See [data-model.md](data-model.md).

**Testing**: Vitest table tests on the pure engine (P1–P6, P18); container tests on the real
migrations (P7–P10, P13–P17, P19); guard tests (P20–P22); admin service and handler tests (P11, P12,
P23, P24); React component tests; a shared quote fixture rendered by web and by Kotlin `commonTest`
(P25). Proofs in [quickstart.md](quickstart.md), each broken once.

**Target Platform**: services `admin` (staff gateway) and `orders` (staff gateway, one field);
`commerce`, `storefront`, `shop`, `notifications` (shared gateway / workers); apps back-office,
customer-web, customer-mobile, shop-web; `packages/email-kit`; `infra/envs/dev/live.tf`.

**Project Type**: monorepo (backend services + web + mobile).

**Performance Goals**: a quote reads the active plan in four indexed queries (plan, distance bands,
weight bands, premiums) — one more than today — and prices in memory. It now prices once per order
plus once per open slot instead of twice per package. No new round trip for any client.

**Constraints**: no basket unpriced at any moment of the release (SC-011); no fee free by accident
(SC-002); placed orders never change (FR-036); no customer DTO carries a distance, band, weight or
plan (FR-032); no shop DTO carries a delivery amount (FR-038); no polling (071); no card layouts; the
operator runs migrations, deploys and Terraform.

**Scale/Scope**: 2 migrations; 3 SQL functions; 2 admin routes added, 1 removed (staff gateway
145 → 146 of 300; shared unchanged at 158); 4 customer responses gain fields; 1 shop response loses
one; 1 back-office section rebuilt (Pricing) plus a simulator and an order-detail panel; 2 customer
surfaces; 1 email template; 1 live kind.

## Constitution Check

*Constitution v3.2.0. Evaluated before research and again after design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | The spec carries no technology. Three gaps found while planning (the cart before an address, postcodes whose tier moves, the shop's Shipping row) went **back into the spec** as assumptions. |
| II. Shared contracts | ✅ | Fee lines, their labels, the offer and the plan DTOs live once in `@effy/shared-types` and are generated into the Kotlin contract. Labels and the three shared sentences are written in one file, mirrored in the mobile app's `DeliveryFeeWords.kt` and held to it by a test (the 076 `CoverageWords.kt` pattern). |
| III. One backend; which service, which gateway | ✅ | **Service: `admin`, on the staff gateway — because back-office delivery configuration.** Staff order detail extends `orders` (staff gateway). Customer-facing changes extend `commerce` and `storefront` on the shared gateway. No new service. |
| III. A rule has one implementation | ✅ strengthened | The fee is added up in `engine.ts` only (guard P22); the simulator is the same call. Completeness is one SQL function. |
| III. Money logic lives once | ✅ | No refund or charge path is added; the card amount still comes from the intent's existing arithmetic. Points untouched. |
| IV. Auth isolation | ✅ | Staff routes behind the staff gateway's only authorizer; role from the `admin.staff` record. |
| V. Design | ✅ | Plan editor = sectioned page with two band tables; simulator = a form and a steps list; no cards, tokens only. Reference: Uber Eats' fee lines (delivery fee, small-order fee, priority fee) under one total. |
| VI. Layered architecture, raw SQL, no ORM | ✅ | handler → service → repository in `admin/src/delivery/`; the engine stays pure. |
| VII. Observability | ✅ | `DeliveryQuoteFailures` (existing alarm) keeps guarding "listed postcode unpriced"; two bounded metrics and one PostHog event added (R15). |
| Real-world identifiers | ✅ | None introduced. The one unknown business value is asked for and the migration fails without it. |
| Live updates, no polling | ✅ | Kind `pricing`, ops channel, announced after commit. |
| Operator runs live changes | ✅ | Both migrations, deploys and apply are handed over in [quickstart.md](quickstart.md). |

**Post-design re-check**: unchanged. No violation; Complexity Tracking records three trade-offs.

## Project Structure

### Documentation (this feature)

```text
specs/077-delivery-fee-engine-v2/
├── plan.md
├── research.md            # F1–F3, R1–R19
├── data-model.md
├── quickstart.md          # proofs P1–P26, operator steps, walks V1–V17
├── contracts/routes.md
├── preflight.sql          # written during implementation (quickstart step 1)
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_delivery_fee_engine_v2.sql        NEW   # additive + carry-over
db/migrations/<ts>_drop_delivery_rings.sql           NEW   # after the deploy

packages/shared-types/src/
├── delivery.ts                 # DeliveryFeeDTO, lines + labels, DeliveryOfferDTO; quote + slot + serviceability gain fields
├── delivery-admin.ts           # FeePlanDTO v2, FeePlanInput, PlanGapDTO, simulation DTOs; Ring* types out
├── checkout.ts                 # intent: shownDeliveryAmount in, deliveryFee out; refusal code
├── order.ts, order-admin.ts    # deliveryFee lines (customer); deliveryFeeBreakdown (staff)
├── shop-order-console.ts       # money.deliveryFee REMOVED
└── live.ts                     # + "pricing"
packages/shared-types/contract/{schema.json,Dto.kt,commerce-schema.json,CommerceDto.kt}   # regenerated

apis/edge-api/shared/src/delivery/
├── engine.ts                   # effyFee, courierFee, feeLines, basketValueCents, bandAdd; fee()/factor removed
├── engine.test.ts              # P1–P6, P18
├── plan.ts                     # loadActivePlan(kind), loadPlan(id); distance bands, premiums; ring + factor code removed
├── quote.ts                    # one order-level quote: standardFee + a fee per open slot; ListedPostcodeUnpricedError
├── zone.ts                     # ring bridge removed; same-day bridge stays (E5)
├── quote.test.ts, reads.container.test.ts, fee.container.test.ts (NEW)   # P3, P10, P15–P17
└── fee.guard.test.ts           NEW   # P20–P22

apis/edge-api/commerce/src/checkout/
├── quote.ts                    # toQuoteDTO: fees, surcharges, remaining-to-free, compatibility options (R4)
├── delivery-choice.ts          # resolves ONE fee for the order; packages keep method/day/window only
├── service.ts                  # basket value, shownDeliveryAmount check, breakdown onto the order, metrics
├── store.ts                    # writes delivery_fee_breakdown; per-package fee NULL
└── checkout.container.test.ts  # P13, P14, P26
apis/edge-api/commerce/src/orders/{repository,service}.ts          # deliveryFee lines on the customer order
apis/edge-api/shared/src/payments/finalize.ts                      # stops copying the per-package fee
apis/edge-api/storefront/src/functions/serviceability-v1-get.ts    # + offer
apis/edge-api/notifications/src/receipts/{repository,sender}.ts    # lines into the receipt + email
apis/edge-api/orders/src/orders/{repository,service}.ts            # deliveryFeeBreakdown on staff detail
apis/edge-api/shop/src/orders/{repository,types}.ts                # deliveryFee removed

apis/edge-api/admin/
├── serverless.yml              # +2 functions, −1
├── src/delivery/
│   ├── pricing.repository.ts   NEW   # plans v2, gaps, activate (SQL function), audit in-transaction
│   ├── pricing.service.ts      NEW   # validation, simulate (calls the engine), role rules
│   ├── pricing.service.test.ts / pricing.container.test.ts   NEW   # P7–P9, P11, P12, P23, P24
│   ├── coverage.service.ts     # courier switch: + courier_plan_missing (P19)
│   └── repository.ts / service.ts / types.ts   # plan + ring code removed
└── src/functions/
    ├── delivery-plans-{list,create}-v1-*.ts, delivery-plan-activate-v1-post.ts   # v2 shape
    ├── delivery-plan-update-v1-put.ts, delivery-plans-simulate-v1-post.ts        NEW
    └── delivery-rings-list-v1-get.ts                                             DELETED

packages/email-kit/src/{catalog.ts,components/rows.mjml,text/order-confirmation.txt.hbs,fixtures/*}   # fee lines

infra/envs/dev/live.tf          # live_kinds + "pricing"
Makefile                        # + db-up-one (apply ONE pending migration)

apps/back-office/src/features/delivery/
├── DeliveryScreen.tsx          # Pricing section
├── pricing/                    NEW
│   ├── PlansTable.tsx, PlanEditor.tsx (sections: amounts · distance bands · weight bands · basket rules · surcharges)
│   ├── BandsTable.tsx, GapList.tsx, ActivateDialog.tsx
│   ├── FeeSimulator.tsx, gapText.ts
│   └── *.test.tsx
├── components/NewPlanDialog.tsx        DELETED
├── access.ts, queries.ts, repo.ts, errorText.ts
└── ../live/routes.ts           # pricing → query keys
apps/back-office/src/features/orders/OrderDetailScreen.tsx + components/FeeBreakdown.tsx (NEW)

apps/customer-web/
├── components/delivery/DeliveryFeeLines.tsx, FreeDeliveryHint.tsx   NEW
├── lib/delivery-choice.ts                 # reads the order-level fee; per-package summing removed
├── app/checkout/{CheckoutFlow,DeliveryOptions,PaymentStep}.tsx   # lines, per-window surcharge, fee-changed refusal
├── app/(shop)/…cart                       # hint + small-order line from `offer`
└── components/receipt/ReceiptDocument.tsx # lines

apps/customer-mobile/shared/src/commonMain/…/features/checkout/
├── domain/Checkout.kt, data/CheckoutMappers.kt
├── presentation/{CheckoutScreen,CheckoutViewModel,ReceiptScreen}.kt
└── …/features/cart                        # hint + small-order line

apps/shop-web/src/features/fulfillment/components/ItemsAndFulfilment.tsx   # Shipping row removed

docs/delivery-console-guide.md · docs/api/path-assignment.md (no change expected) · FEATURE-HISTORY.md ·
CLAUDE.md · docs/prd/2026-10-delivery-model-v2-backlog.md
```

**Structure Decision**: no new service, package or directory under `apis/edge-api/`. Pricing code in
`admin` goes into new `pricing.*` files so the removal of ring-priced plan code is a deletion rather
than an edit in place (the 076 pattern).

## Build order

1. **Shared words**: fee line kinds and labels, DTOs, gap codes; regenerate the Kotlin contract.
2. **Engine**: `effyFee`, `courierFee`, `feeLines`, `basketValueCents`; P1–P6, P18 **before anything
   reads them**.
3. **Migration 1**: columns, tables, functions, carry-over-or-raise, grants; P7–P9, P15. (An immutability trigger was planned and withdrawn — see data-model.md.)
4. **Shared library**: `plan.ts`, `quote.ts`, `zone.ts` (ring bridge out); P3, P10, P16, P17 — **P16 is
   the release-safety net** and is written against a copy of the pre-migration fixtures.
5. **Commerce**: quote DTO, one-fee choice, intent check, breakdown onto the order; finalize; P13, P14, P26.
6. **Readers**: customer order, receipt + email, staff order detail, storefront offer; shop removal.
7. **Admin**: repository, service, five handlers, serverless; courier-switch refusal; P11, P12, P19, P23, P24.
8. **Guards**: P20–P22. **Migration 2** written last, once P21 is green — test harnesses apply every
   migration file, so writing it earlier breaks every package that still reads a tier.
9. **Live**: kind in shared-types, announce after commit, `live.tf`, change-map guard.
10. **Back-office**: Pricing section, simulator, order fee panel; delete `NewPlanDialog`.
11. **Customer web, then mobile**: lines, hint, per-window surcharge, fee-changed refusal; P25.
12. **Shop-web**: remove the Shipping row.
13. **`preflight.sql`, documents, SIGNOFF, FEATURE-HISTORY**; hand over the operator steps.

## Risks

| Risk | What limits it |
|---|---|
| A basket is unpriced between migrate and deploy | Migration 1 is additive: the running code still finds its ring prices. The tier tables go only in migration 2, after the deploy. |
| The carried-over plan prices differently | P15 (bands equal ring prices) and P16 (same fee where the tier matches the distance). The pre-flight lists every postcode that moves, before anything changes. |
| Delivery becomes free by accident | $0 only through the free amount; a $0 floor needs explicit confirmation; an unpriced postcode raises and alarms instead of returning 0. |
| The same-day amount is guessed | It is not: the migration raises without `EFFY_TODAY_PREMIUM`. |
| Two plans active, or none | One SQL function swaps them under a lock; the partial unique index is the second guard; P8. |
| A customer is charged an amount they did not see | `shownDeliveryAmount` → 409 with a fresh quote; P13. |
| A mobile build from before 077 shows a wrong total | The compatibility option fees never sum to less than the charge (R4, P26); it can show slightly more when a cheaper window is chosen. |
| An old back-office tab calls the removed rings route or posts the old plan shape | Deploy `admin` and build back-office together (quickstart); the create route refuses the old shape with `invalid_plan`. |
| A window premium survives its window | A disabled slot's premium never applies; a deleted slot cascades; the plan screen marks it. |
| Goose substitution mangles `$$` bodies | It is switched on for the one statement that reads the variable (R19); P15 runs the real file through the real `goose` binary, not the test harness's own SQL slicing. |

## Complexity Tracking

No constitution violation. Three trade-offs worth recording:

| Trade-off | Why | Simpler alternative rejected because |
|---|---|---|
| Two migrations for one feature | The running service reads the tier tables until it is redeployed | One migration that drops them: checkout fails between migrate and deploy. Leaving them for E9: 076 named E3 as the epic that removes this bridge, and a guard cannot hold "nobody reads tiers" while the tables invite it. |
| `packages[].options[].feeAmount` kept, carrying a split that means nothing | A customer app built before 077 sums those fields | Removing them now: an older build shows $0 delivery and the customer is charged more than they saw. Removed by E5, which replaces the quote shape anyway. |
| Courier plans share `delivery_fee_plan` with a `kind` and a CHECK forbidding half its columns | One lifecycle, one editor, the same three routes | A separate `courier_fee_plan` family: twice the routes and handlers on a counted gateway for a table nobody is charged from until E5. |
