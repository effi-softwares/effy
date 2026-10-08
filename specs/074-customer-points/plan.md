# Implementation Plan: Customer Points (store credit)

**Branch**: `dev` (feature directory `074-customer-points`) | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/074-customer-points/spec.md`

## Summary

A points balance per customer that staff (and, later, platform flows) credit, that the customer
spends at checkout, that comes back as points on a refund, and that expires. First of the delivery
model v2 programme (`docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E1); spec 080 (courier
override compensation) is its first automatic creditor.

The approach, in five decisions (full reasoning in [research.md](research.md)):

1. **An append-only ledger** — entries + FIFO allocations, a per-customer lock row, and **one SQL
   function** for the usable balance. No stored balance (R1). Expiry is derived from `expires_at`;
   a daily sweep only writes the history line (R2).
2. **Held at the payment-intent call, spent inside the paid transaction** — exactly 069's slot-hold
   pattern, including the late payer (R3).
3. **Points are a means of payment** — the order total is unchanged; the card pays total − points;
   a points-only order skips the provider entirely (R4).
4. **Refunds split by cumulative proportion** — 055's machine unchanged; only the card part reaches
   the provider; points return when the card part is accepted (R5).
5. **One shared module, `@effy/edge-shared/points`**, is the only writer; `customer`, `commerce`,
   `orders` and the paid step call it (R6).

## Technical Context

**Language/Version**: TypeScript on Node 22 (Lambda, arm64); React 19 (back-office Vite SPA,
customer-web Next.js 16); Kotlin 2.4 / CMP 1.11 (customer-mobile); SQL (PostgreSQL 16, Goose).

**Primary Dependencies**: none added. Existing: `stripe` (via `@effy/edge-shared/payments` only),
`@effy/email-kit` (MJML), TanStack Query/Form/Table, design-system primitives (`table`, `dialog`,
`sheet`, `switch`, `badge`, `sonner`).

**Storage**: one forward-only migration — 7 new tables (`points_settings`, `points_settings_change`,
`points_account`, `points_entry`, `points_allocation`, `points_hold`, `points_expiry_notice`), one SQL
function (`points_usable`), new columns on `order` and `refund`, two notification types. See
[data-model.md](data-model.md).

**Testing**: Vitest unit (`splitRefund`, reason vocabulary, FIFO allocation planning); container tests
on the real migrations (P2–P12, P15–P16 in [quickstart.md](quickstart.md)); guards P13 (append-only),
P14 (customer update builders); React component tests; Kotlin `commonTest` for the ViewModels.

**Target Platform**: services `customer`, `commerce`, `orders`, `shop` (refund split only),
`notifications`; apps back-office, customer-web, customer-mobile.

**Project Type**: monorepo (backend services + web + mobile).

**Performance Goals**: a credit visible to the customer within 10 s (SC-003) — met by the live channel;
balance read is one indexed query per customer (lots + allocations + holds, a customer holds tens of
lots, not thousands).

**Constraints**: balance never negative; history never edited; money logic only in
`@effy/edge-shared/payments`, points logic only in `@effy/edge-shared/points`; no polling (071);
shops never see points (FR-027); operator runs migration, deploys and Terraform.

**Scale/Scope**: 1 migration; 1 new shared module (~10 functions); 3 customer routes changed/added,
3 commerce routes changed, 7 orders routes added (+ 1 changed); 2 scheduled functions; 2 email
templates; 1 back-office screen + 2 panels; 1 web page + checkout control; 1 mobile screen + checkout
control.

### Unknowns

None. Every Technical Context item was resolved in [research.md](research.md) R1–R13.

## Constitution Check

Checked against constitution **v3.1.0**.

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec → this plan → tasks. Spec's Assumptions carry the unconfirmed defaults. |
| II. Shared contracts | ✅ | New `packages/shared-types/src/points.ts`; fields on `checkout.ts`, `order.ts`, `order-admin.ts`, `refund.ts`, `live.ts`; Kotlin mirrors in `contract/` and `mobile-kit/common/live/LiveKind.kt` (the existing drift test covers the kind list). |
| III. Single serverless backend | ✅ | No new service. **Service: `customer`** — customer audience, account domain (balance, history, closure warning, sweeps). **Service: `commerce`** — owns checkout and payment. **Service: `orders`** — back-office audience; customer care beside the order console and refunds. **`shop`** changes only by importing the updated refund split. One implementation of every rule in `@effy/edge-shared/points` and `/payments`. |
| IV. Auth isolation | ✅ | Customer routes on the customer pool, back-office on the admin pool. CSA limit, debit and settings gates decided from `admin.staff`, never the claim. No customer route exposes notes or staff identity. |
| V. Design | ✅ | Tables, detail rows, a side sheet for credit/debit, a switch at checkout. **No cards** — the balance is a heading line, not a metric card. Tokens only. Mobile native list + bottom sheet. |
| VI. Layered | ✅ | Handler → service → repository in each service; the shared module is the repository + rules for points; wire DTOs mapped explicitly; ViewModel → UseCase → Repository on mobile. |
| VII. Observability | ✅ | PostHog: `points_viewed`, `checkout_points_toggled`, `checkout_paid_with_points`. Metrics: `PointsCredited`, `PointsSpent`, `PointsReturned`, `PointsExpired`, `PointsOnlyOrders`, `PointsBalanceRefusals`, `PointsHoldShortfall` (alarm), `PointsInvariantViolations` (alarm). Push via the notifications path. |
| Real-world identifiers | ✅ | None introduced. Emails go to the customer's own snapshotted address; reply-to is the existing approved `hello@effyshopping.com` configuration. |
| Technology standards | ✅ | Raw SQL, Goose, no ORM, no new library. |

**Gate**: passes. **Re-checked after Phase 1 design**: unchanged — the design adds one deliberate
widening of a 071 guard (R7), recorded below because it touches a guard, not a principle.

## Project Structure

### Documentation (this feature)

```text
specs/074-customer-points/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/routes.md
├── checklists/requirements.md
└── tasks.md                      # /speckit-tasks
```

### Source Code

```text
db/migrations/<ts>_customer_points.sql                     # tables, columns, points_usable(), notification types

packages/shared-types/src/
├── points.ts                                              # NEW — balance, history entry, reasons, settings DTOs
├── checkout.ts · order.ts · order-admin.ts · refund.ts    # points fields
├── live.ts                                                # + "points"
└── contract/CommerceDto.kt (+ customer DTOs)              # Kotlin mirrors
packages/mobile-kit/common/live/LiveKind.kt                # + POINTS
packages/email-kit/src/templates/
├── points-credited.mjml · points-expiring.mjml            # NEW
└── order-refunded.mjml                                    # "N points returned" line
packages/legal-content/                                    # points terms (legal review before go-live)

apis/edge-api/shared/src/
├── points/                                                # NEW — @effy/edge-shared/points
│   ├── index.ts · ledger.ts (credit/debit/hold/release/spendHeld/returnForRefund/expireDue/forfeit)
│   ├── usable.ts · split.ts (pure) · vocabulary.ts · announce.ts · settings.ts
│   └── *.test.ts · *.container.test.ts · points-append-only.guard.test.ts
├── payments/finalize.ts                                   # step: spend the held points; NOT_APPLIED unchanged
├── payments/refunds/{repository,service}.ts               # ceiling = card + points; split; card-free refunds; markSubmitted returns points
├── live/announce.ts · live/customer-announce.guard.test.ts  # kind widened; ALLOWED + points/announce.ts
└── package.json                                           # exports "./points"

apis/edge-api/commerce/src/checkout/{service,store,quote,respond}.ts   # pointsToUse, hold, points-only placement, refusals
apis/edge-api/commerce/src/orders/                          # payment block on order reads
apis/edge-api/customer/src/points/                          # NEW — balance + history (handler → service → repo)
apis/edge-api/customer/src/functions/
├── customer-points-v1-get.ts · customer-points-history-v1-get.ts       # NEW
├── points-expiry-scheduled.ts · points-reconcile-scheduled.ts          # NEW (daily / hourly)
└── customer-closure-v1-get.ts                              # + pointsHeld
apis/edge-api/orders/src/customers/                         # NEW — lookup, detail, credit, debit, settings
apis/edge-api/orders/src/functions/customers-*-v1-*.ts · points-settings-v1-{get,put}.ts   # NEW
apis/edge-api/orders/src/orders/                            # payment block + refund split on order detail
apis/edge-api/notifications/src/worker/{copy,email-sender}.ts           # points_credited, points_expiring
infra/envs/dev/commerce-alarms.tf                           # 2 alarms

apps/back-office/src/
├── routes/customers.tsx · components/layout/nav.ts         # NEW route "Customers"
├── features/customers/                                     # NEW — search, customer detail, points history table, credit/debit sheet, settings panel
└── features/orders/components/{RefundsSection,RefundPanel}.tsx · OrderDetailScreen.tsx   # payment + split lines; "Credit points" from an order
apps/customer-web/app/
├── (account)/account/{tabs.ts,PointsTab.tsx (NEW)}           # a "points" account tab, beside payment methods
├── checkout/PaymentStep.tsx · checkout/_components/PointsControl.tsx (NEW) · CheckoutFlow.tsx
├── (account)/orders/ · components/receipt/                 # payment lines
└── delete-account/                                         # points warning
apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/
├── features/points/{domain,data,presentation}/             # NEW — PointsScreen + ViewModel
├── features/checkout/                                      # points control, paidWithPoints path
├── features/account/presentation/{AccountScreens,DeleteAccountScreen}.kt   # entry + warning
└── app/AppContainer.kt                                     # wiring
```

**Structure Decision**: the monorepo's existing layout; one new shared module and one new back-office
feature folder, everything else extends existing slices.

### Build order

| Phase | Delivers | Spec | Ships alone? |
|---|---|---|---|
| 1 | Migration; `@effy/edge-shared/points` (ledger, usable, vocabulary, settings); guards | foundation | — |
| 2 | Back-office Customers: search, detail, credit (with CSA limit), debit, history, settings; customer balance + history routes; web + mobile points pages; `points_credited` email/push; live `points` | US1, US5, US6 | ✅ staff can compensate; customers see it |
| 3 | Checkout: quote block, `pointsToUse`, hold, refusals, points-only placement, finalize spend, late-payer shortfall; web + mobile checkout control; payment lines on order + receipt | US2 | ✅ |
| 4 | Refund split (staff, shop-manager, cancellation, reconciler); back-office refund lines; `order-refunded` email line | US3 | ✅ — must ship **with or before** phase 3 reaching customers |
| 5 | Expiry sweep, warnings, reconciliation job + alarms; closure warning | US4, FR-024 | ✅ |

⚠ Phases 3 and 4 deploy **together** to production: an order paid with points must never meet a
refund service that does not know about points (it would refund the whole total to the card).

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Widening the 071 customer-update guard (`kind: "orders" \| "points"`, a fourth allowed builder) | A credit must reach the customer's open app within 10 s (SC-003) without polling (071). | Folding points into kind `orders` would make every points change re-read the customer's orders, and an `orders` update for a goodwill credit with no order is a lie about what changed. The guard's purpose (no shop leaks to a customer) is untouched: points rules involve no shop. |
| A new back-office "Customers" screen | Staff must find a customer to credit (US1); there is no customer view in back-office today. | Crediting only from an order's detail would make a goodwill credit for a customer with no order (or a phone call about an account) impossible, and the debit/correction flow has no order at all. The screen is minimal: search, detail rows, history table. |
