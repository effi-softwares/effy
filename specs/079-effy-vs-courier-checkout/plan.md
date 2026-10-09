# Implementation Plan: Checkout and Orders — Delivered by Effy vs Courier Delivery

**Branch**: `dev` (feature directory `079-effy-vs-courier-checkout`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/079-effy-vs-courier-checkout/spec.md`

## Summary

Every order gets one delivery type, decided from the address: **Delivered by Effy** (078's window
picker, Effy's fee) or **Courier delivery** (no picker, the business's estimate, the courier fee). The
order records its type, why, and a permanent history. Customers read one wording everywhere; shops
read "Effy driver" / "Courier"; back-office filters by type. Fifth slice of the delivery model v2
programme (backlog epic E5). **Built switched off**: it rides 078's switch and goes on at the cutover.

The approach, in seven decisions (reasoning in [research.md](research.md)):

1. **"A courier delivers here" becomes true only when a courier order can be placed** — the condition
   (model on, courier on, known and not excluded, a fee table active, an estimate set) moves *into*
   `public.coverage_for_postcode`. The `COURIER_ORDERING_AVAILABLE` constant and its three readers are
   deleted (R1).
2. **The type is a column on the order; old orders are read through one function** —
   `public.package_delivered_by(type, method, slot)`. No backfill. 078's "`standard` + window = Effy"
   convention leaves application SQL (R2).
3. **A courier package is stored as `standard` with no window or day** — the shape every dispatch
   reader already carries to the hub and hands to a carrier, so a courier order is deliverable with no
   planner change (R3).
4. **The quote grows a courier shape and the client says which type it showed** — a mismatch is refused
   before anything is written, like 077's shown total (R4).
5. **One function says how an order is delivered** — `deliverySummary` in `@effy/shared-types`, with a
   Kotlin twin on shared fixtures; web, mobile and the receipt email all print it (R6).
6. **The history has one writer** — `recordDeliveryType`, called by payment finalisation now and by E7
   later; the table is append-only by privilege (R7).
7. **No new route, no new service, no Terraform.**

⚠ **Four things the operator must know up front**
- **Nothing a customer sees changes on release.** With the switch NULL the checkout is today's and an
  out-of-area address is refused as today — even if courier delivery has been switched on.
- **Shops' words change on release**: "Effy driver" / "Courier" replace "same-day" / "standard" on
  shop web and the shop app at once (true of every package, old or new).
- **Courier can be armed before the cutover** (estimate + fee table + switch); it reads "starts with
  the new delivery model" until then.
- **Three removals the backlog gave E5 move to E9** — the same-day bridge, the per-package
  compatibility fee, and the "N of your M deliveries" sentence — because today's live checkout still
  reads them (R10). The spec was corrected to say so.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose 3.27); TypeScript on Node 22 (Lambda, arm64); React 19
(customer-web Next.js 16; shop-web and back-office Vite SPAs); Kotlin 2.4 / CMP 1.11 (customer-mobile,
shop-mobile).

**Primary Dependencies**: none added.

**Storage**: one forward-only, additive migration — three `order` columns, one append-only table, two
`delivery_settings` columns, two new SQL functions, `coverage_for_postcode` replaced with an optional
second argument. See [data-model.md](data-model.md).

**Testing**: container tests on the real migration (P1–P12, P14, P17, P19, P20); Vitest unit and
fixture tests (P15, P16); two guards (P13, P18); React component tests (P21); Kotlin host tests (P16,
P22). Marked proofs are broken once — [quickstart.md](quickstart.md).

**Target Platform**: `commerce`, `storefront`, `shop` (shared gateway); `orders`, `admin` (staff
gateway); `notifications` (worker); `shared` library. customer-web, customer-mobile, shop-web,
shop-mobile, back-office.

**Project Type**: monorepo (backend services + web + mobile).

**Performance Goals**: a courier quote is cheaper than an Effy one (one coverage call, one plan read,
one in-memory sum; no slot reads). The Effy quote is unchanged except the fallback, which adds one
function call only when no window is open. Order lists add one indexed column.

**Constraints**: switch off ⇒ the 077/078 quote byte for byte (P3); no customer contract carries a
distance, a courier name, a shop count or a reason; no shop contract carries a window, day, estimate or
money; no polling; no cards; the operator runs the migration and deploys.

**Scale/Scope**: 1 migration; 0 routes added (shared 158, staff 146 of 300); ~9 routes change shape
additively across 5 services; 5 client apps touched (driver-mobile is not); 2 guards; 0 alarms.

## Constitution Check

*Constitution v3.2.0. Evaluated before research and again after design.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Two gaps found while planning went **back into the spec**: FR-017 (a hold is given up at the next payment attempt or lapses — there is no release moment in between) and FR-037 (the per-supplier figures leave with today's checkout, at the cutover). |
| II. Shared contracts | ✅ | `DeliveryType`, `deliverySummary`, the words and every DTO change live once in `@effy/shared-types`; Kotlin contracts regenerated; Kotlin word twins pinned to one fixture file. |
| III. One backend; which service, which gateway | ✅ | No new service or route. Customer quote/intent/orders → `commerce`, serviceability → `storefront`, shop reads → `shop` (all **shared** gateway). Back-office order filter/detail → `orders`, courier settings → `admin` (both **staff** gateway). |
| III. A rule has one implementation | ✅ strengthened | Coverage (incl. "can a courier order be placed") in one SQL function; "who takes this package" in one SQL function replacing four copies of a convention; one history writer; one customer sentence. |
| III. Money logic lives once | ✅ | The courier fee is `courierFee` (077's engine, `fee.guard`); refunds untouched. |
| IV. Auth isolation | ✅ | Staff changes behind the staff gateway's authorizer; mutate = admin/manager; shop DTOs keep 047's delivery isolation. |
| V. Design | ✅ | Text, a table column, a filter and a list — no cards. Tokens only; both shop labels are neutral badges. References: Uber Eats delivery block; eBay "estimated delivery" (R12). |
| VI. Layered architecture, raw SQL, no ORM | ✅ | Pure resolver in `delivery-choice.ts`; SQL in stores/repositories; one shared writer taking the caller's transaction. |
| VII. Observability | ✅ | `DeliveryQuotes` outcomes, `OrdersPlaced {deliveryType}`, `DeliveryTypeChanged`; PostHog `checkout_delivery_type_shown`. No PII. No new alarm needed (R13). |
| Real-world identifiers | ✅ | None. The estimate text is entered by the operator; no courier company is named anywhere. |
| Live updates, no polling | ✅ | Placement already announces; nothing new changes an order here. `change-map.guard` unaffected (no new mutating route). |
| Operator runs live changes | ✅ | Migration and deploys handed over in quickstart. |

**Post-design re-check**: unchanged. No violation; Complexity Tracking records three trade-offs.

## Project Structure

### Documentation (this feature)

```text
specs/079-effy-vs-courier-checkout/
├── plan.md
├── research.md            # F1–F11, R1–R14
├── data-model.md
├── quickstart.md          # proofs P1–P23, operator steps, walks V1–V11
├── contracts/routes.md
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_order_delivery_type.sql        NEW   # order columns, history table, settings, 3 functions, grants

packages/shared-types/src/
├── delivery-type.ts                 NEW   # DeliveryType, reasons, DELIVERY_TYPE_WORDS, deliverySummary
├── delivery-type.fixtures.json      NEW
├── delivery-type.test.ts            NEW   # P16
├── delivery.ts                      # quote: courier; refusal code; drop the "cannot be purchased" notes
├── checkout.ts                      # intent: deliveryType (request + response)
├── order.ts                         # OrderDTO / list item: delivery
├── shop-order-console.ts, shop-order.ts   # deliveredBy, DELIVERED_BY_WORDS; deliveryMethod deprecated
├── order-admin.ts                   # deliveryType (+ filter), reason, estimate, history, per-package deliveredBy
└── delivery-admin.ts                # CourierReachDTO; CoverageReason +2
packages/shared-types/contract*/     # regenerated (customer commerce + shop)

apis/edge-api/shared/src/
├── delivery/coverage.ts             # coverageForPostcode(q, postcode, now); COURIER_ORDERING_AVAILABLE deleted
├── delivery/zone.ts                 # serviceableForPostcode: effy or courier
├── delivery/quote.ts                # courier variant; priceCourierOrder; fallback; CourierNotPurchasableError → invariant only
├── delivery/delivery-type.ts        NEW   # recordDeliveryType(tx, …) — the one writer; DELIVERED_BY sql fragment
├── delivery/delivery-type.guard.test.ts NEW   # P13
├── delivery/coverage.container.test.ts    # P1, P2
├── payments/finalize.ts             # first history entry (P8)
└── status/status.test.ts            # P15 (rows only; no code change expected)

apis/edge-api/commerce/src/
├── checkout/quote.ts                # toQuoteDTO: courier; capturedQuote
├── checkout/delivery-choice.ts      # resolveCourier(); DeliveryChoiceError("delivery_type_changed")
├── checkout/service.ts              # type check before anything is written; metrics; passes type to the store
├── checkout/store.ts                # captureDelivery writes delivery_type / reason / courier_estimate
├── orders/{repository,service}.ts   # delivery on list + detail; arrivals [] for courier
└── checkout/checkout.container.test.ts    # P3–P7, P10
apis/edge-api/storefront/src/functions/serviceability-v1-get.ts   # constant removed; answer is the function's
apis/edge-api/orders/src/
├── orders/{repository,service,promise,assignments}.ts   # package_delivered_by; filter; detail fields + history
└── handoff/repository.ts            # package_delivered_by
apis/edge-api/shop/src/
├── orders/{repository,types}.ts, today/{repository,types}.ts, pick-lists/repository.ts   # deliveredBy (+ filter)
└── delivery-isolation.contract.test.ts
apis/edge-api/admin/src/delivery/
├── coverage.{service,repository}.ts # estimate, fallback, blockedBy, pending; constant removed
└── pricing.service.ts               # refuse deactivating the courier table while offered
apis/edge-api/notifications/src/receipts/{repository,sender}.ts   # deliverySummary; kept estimate

apps/customer-web/
├── app/checkout/{CheckoutFlow,DeliveryOptions}.tsx, CourierDelivery.tsx (NEW)   # heading, courier block, address reset, 409
├── lib/delivery-choice.ts, lib/telemetry.ts
├── components/receipt/ArrivalPanel.tsx, order list + detail pages   # deliverySummary
apps/customer-mobile/shared/src/commonMain/…/features/checkout/
├── domain/Checkout.kt, data/CheckoutMappers.kt
├── presentation/{CheckoutScreen,CheckoutViewModel,ReceiptScreen,OrdersScreen}.kt, DeliveryTypeWords.kt (NEW)
└── …/core/observability/AnalyticsEvent.kt
apps/shop-web/src/features/{fulfillment,today}/…      # deliveredBy labels, filter, print
apps/shop-mobile/shared/src/commonMain/…/features/orders/domain/OrderModels.kt (+ screens)
apps/back-office/src/features/
├── orders/{model.ts,components/PackageRows.tsx,…}    # Delivery column, filter, detail section + history
└── delivery/components/CoveragePanel.tsx, errorText.ts   # estimate, fallback, blockedBy, pending

scripts/check-shop-delivery-words.sh   NEW   # P18
docs/order-console-guide.md · docs/delivery-console-guide.md · FEATURE-HISTORY.md · CLAUDE.md · docs/prd/…backlog.md
```

**Structure Decision**: no new service, package or directory under `apis/edge-api/`. The type's writer
and its SQL fragment sit in `shared/src/delivery/delivery-type.ts` so E7 imports one function.
`apps/driver-mobile` and the planner are not touched.

## Build order

1. **Shared types and words**; fixtures; regenerate Kotlin contracts (P16 TS half).
2. **Migration**; then `coverage.ts` and P1–P3 **before** the constant is deleted; then delete it and
   fix its three readers.
3. **`package_delivered_by` readers** in `orders` (P11, P12) — behaviour-neutral for every existing
   order, so it can be proven against today's suites first.
4. **Shared quote**: courier variant, fallback; **commerce**: DTO, resolver, type check, store,
   metrics (P4–P7, P10). The legacy branch is not edited.
5. **History writer** + `finalize` (P8, P13, P14).
6. **Customer order reads + receipt email** (P9); status rows (P15).
7. **Shop** service and DTOs (P17); **orders** list filter and detail (P19); **admin** courier
   settings (P20).
8. **Clients**: customer-web, customer-mobile (P21, P22, P16 Kotlin half); shop-web, shop-mobile
   (P18); back-office.
9. **Docs**: console guides, FEATURE-HISTORY, CLAUDE.md, backlog (E5 ticks, E9 additions); hand over
   operator steps.

## Risks

| Risk | What limits it |
|---|---|
| Courier is promised where it cannot be sold | The promise and the sale read one function (R1); P3. |
| Release changes the live checkout | Legacy branch untouched; coverage cannot answer courier with the switch off; wire contract test unchanged (P3). |
| A customer pays the courier fee for a screen that showed Effy (or the reverse) | `deliveryType` must match (P6) and the shown total must match (077). |
| A window from another address is charged or held | Clients reset on address change (P21, P22); the intent replaces rows and deletes the booking (P7); a stray hold lapses. |
| An Effy later-day parcel is handed to a carrier, or a courier parcel is not | One function decides (P11, P12); guard against the old convention (P13). |
| An installed app built before 079 meets a courier order | It cannot place one (no `deliveryType`); an existing courier order shows no arrival line rather than a wrong one (`arrivalEstimates: []`). New builds ship before the cutover (E9 checklist). |
| Installed shop apps still print "same-day"/"standard" | `deliveryMethod` stays on the wire so they keep working; the shop build ships with this feature. Listed in operator steps. |
| The estimate reads as a promise | One sentence, written once, says "an estimate, not a guaranteed date" (R6). |
| History is edited | Privileges revoked; one writer; guard (P13, P14). |
| The two red `shop` container tests from 078's sign-off mask a regression here | They are named in tasks as pre-existing; shop changes are proven by new tests, and the two are investigated before the shop work starts. |

## Complexity Tracking

No constitution violation. Three trade-offs worth recording:

| Trade-off | Why | Simpler alternative rejected because |
|---|---|---|
| A courier package is stored as `standard` | Every dispatch reader already moves that shape hub → carrier; installed apps decode the method enum | A `courier` method value: two CHECKs widened, crashes in installed Kotlin decoders, unwound again at E9. |
| Legacy orders are derived, not backfilled | FR-021: no invented type or history; a 069 order cannot be told from a 078 dev walk | Backfill + nullable-free column: writes a decision nobody made onto real orders. |
| The same-day bridge, compatibility fee and split sentence survive this feature | Today's live checkout reads them until the switch | Delete now (as the backlog said): changes what customers are offered today and breaks 078's switch-off proof. |
