# Research: Checkout and Orders — Delivered by Effy vs Courier Delivery

**Feature**: 079 · **Date**: 2026-10-09 · Epic **E5** of `docs/prd/2026-10-delivery-model-v2-backlog.md`

## Findings from the code (F)

**F1 — The coverage answer ignores the model switch.** `public.coverage_for_postcode` answers
`courier` for every unlisted, known, non-excluded postcode the moment `delivery_settings.courier_offered`
is true. Nothing ties that to `delivery_model_v2_from`. Three TypeScript sites paper over it with the
constant `COURIER_ORDERING_AVAILABLE` (`shared/src/delivery/coverage.ts`): the admin switch
(`admin/src/delivery/coverage.service.ts`), the public serviceability route
(`storefront/src/functions/serviceability-v1-get.ts`) and — as a thrown invariant
(`CourierNotPurchasableError`) — the quote.

**F2 — The quote has one sellable shape.** `QuoteResult` is `{serviced:false}` or
`{serviced:true, coverage:"effy", …}`. `commerce/src/checkout/service.ts` chooses between
`resolveEffyWindow` and `resolveDeliveryChoice` by `quote.effyWindows`.

**F3 — Courier pricing exists and has no caller in checkout.** `courierFee` (`engine.ts`),
`courierValues` and `loadActivePlan(q, "courier")` (`plan.ts`) are used only by the admin simulator.
`FeeBreakdown.kind` already carries `"courier"`, so `storedBreakdown` / `feeDTO` need nothing.

**F4 — A courier parcel already has a working physical path, under the name `standard`.** A
`standard` package with no window is collected with every run (`fleet/src/planner/sql.ts` treats it as
collect-only), checked in at the hub (`driver/src/work/complete.ts`), listed for carrier handover
(`orders/src/handoff`, `orders/src/orders/repository.ts`) and becomes **With carrier** in
`packageStatus` (`handedToCarrier`). `packageStatus` never yields "Out for delivery" without a delivery
round, and delivery rounds gather `same_day` only.

**F5 — "Who delivers this package" is a convention in four places.** Since 078, "`standard` with a
window is Effy's" is spelled `opd.slot_id IS NULL` in `orders/src/orders/repository.ts` (three times),
`orders/src/handoff/repository.ts` and `orders/src/orders/promise.ts`
(`method === "standard" && windowEnd === null`), plus `orders/src/orders/service.ts`.

**F6 — Shops are sent the customer's word.** `sf.delivery_method` (`same_day | standard | null`) goes
out as `deliveryMethod` from `shop/src/orders`, `shop/src/today` and `shop/src/pick-lists`, with a
`method` filter on the shop order list; `apps/shop-web` (six files) and `apps/shop-mobile`
(`OrderModels.kt`) print it. `shop/src/insights` does not read the method at all.

**F7 — Customers are told the method per package.** `ArrivalEstimateDTO.method` feeds the web
`ArrivalPanel`, the mobile `ReceiptScreen` and the receipt email's `methodLabel`
(`notifications/src/receipts/sender.ts`). A courier package recorded as `standard` would read
"Standard delivery — We'll confirm your delivery date".

**F8 — An order becomes placed in one function.** `finalize` (`shared/src/payments/finalize.ts`)
flips `pending_payment → paid` behind an idempotent guard and fans out fulfilments. The pending order is
re-written on every intent (`captureDelivery`), which also deletes the order's slot booking first.

**F9 — Append-only has a precedent.** 074's ledger: one writing module, `REVOKE UPDATE, DELETE`
from `effy_shopper`, and a guard test that fails a second writer. 077 withdrew an immutability trigger
(058's trigger guard); triggers are not available for this.

**F10 — The push "Out for delivery" is raised by a delivery round starting.** A courier order never
has one, so it never receives it; no notification copy names a window or a driver for a courier order.

**F11 — The legacy checkout still uses the same-day bridge and the per-package compatibility fee.**
`sameDayForShops` and `compatibilityFees` are called only on the switch-off path, which is the *live*
checkout until E9.

## Decisions (R)

### R1 — "A courier delivers here" is true only when a courier order can be placed
- **Decision**: one new SQL function `public.courier_reaches_postcode(p_postcode, p_at)` — true iff the
  new model is on at `p_at` (`public.delivery_model_v2_at`), `courier_offered`, the postcode is known and
  not excluded, a courier fee table is active, and an estimate text is set.
  `public.coverage_for_postcode` gains `p_at timestamptz DEFAULT now()` and calls it for an unlisted
  postcode. `COURIER_ORDERING_AVAILABLE` and its three readers are **deleted** — that is what "E5 flips
  it" becomes. Staff reasons gain `courier_pending` (switched on, waiting for the new model) and
  `courier_not_ready` (on, but no fee table or no estimate).
- **Rationale**: FR-010 and the one-answer rule (076 FR-020). With the condition inside the one
  function, the address book, the storefront check, the staff checker and the checkout cannot disagree,
  and the operator may arm courier delivery *before* the cutover — it takes effect with the switch and
  not a moment earlier (FR-035). A TypeScript constant could only say "the code exists".
- **The switch still has one TypeScript reader**: the SQL function calls the SQL function; 078's guard
  scans `.ts` and stays as written. `coverageForPostcode(q, postcode, now)` passes the caller's clock so
  the quote and coverage judge the switch at the same instant.
- **Alternatives**: flip the constant and trust the admin service (the switch can be nulled again in
  dev, leaving every address screen promising a courier — rejected); a second switch for courier
  (two switches to reconcile at E9 — rejected).

### R2 — The order's delivery type is a column; legacy orders are read through one function
- **Decision**: `order.delivery_type` (`effy | courier`, NULL = placed before the feature),
  `order.delivery_type_reason`, `order.courier_estimate` (the text as sold). One SQL function
  `public.package_delivered_by(delivery_type, method, slot_id) RETURNS text` gives `effy | courier` for
  **any** package: the order's type when it has one; otherwise `same_day` or a window → `effy`,
  anything else → `courier`. Every reader in F5 and F6 calls it; the `slot_id IS NULL` convention
  disappears from application SQL (guard).
- **No backfill** (deviation from backlog E5-T01): FR-021 forbids an invented type or history on an
  old order, and a 069 same-day order cannot be told from a 078 dev-walk order. The function gives the
  same answer a backfill would.
- **Alternatives**: a `courier` method value on the package (widens two CHECKs and the Kotlin enums
  decoded by installed apps; unwound at E9 — rejected, as in 078 R6).

### R3 — A courier package is recorded as `standard`, no window, no day
- **Decision**: `order_package_delivery.method = 'standard'`, `slot_id`/`window_*`/`promised_*` NULL;
  `shop_fulfillment.delivery_method = 'standard'` (copied by `finalize`, unchanged).
- **Rationale**: F4 — every dispatch reader already moves that shape to the hub and on to a carrier, so
  a courier order is deliverable the day the switch goes on, with no planner change (E6 then adds
  pickup-from-supplier). The customer never reads the package's method for a courier order (R6).
- **On-time**: a courier order has no promise to be on time against; `promise.ts` returns no verdict
  and no "handover due" for it (the handover list still shows it, undated). E6 owns courier timing.

### R4 — The quote grows a courier shape; the client says which type it showed
- **Decision**: `QuoteResult` gains `{serviced:true, coverage:"courier", fee, estimate, reason:
  "out_of_coverage"|"no_window", freeDeliveryRemainingCents}`. The DTO gains `courier?: {estimate, fee,
  reason}` — present exactly when `coverage === "courier"`. The intent gains `deliveryType?: "effy" |
  "courier"`; a courier quote **requires** `deliveryType: "courier"`, and a type that differs from the
  server's answer is refused `409 delivery_type_changed` with a fresh quote, before anything is written
  (FR-005). `shownDeliveryAmount` (077) keeps guarding the total.
- **Rationale**: the same pattern as 077's shown total — the server refuses to charge for a screen the
  customer was not looking at. A client built before 079 cannot send the field, so it cannot place a
  courier order it could not have drawn.
- **Switch off**: coverage never answers `courier` (R1), so the legacy branch is untouched and 078's
  byte-identical proof (P9) keeps holding.

### R5 — No-window fallback
- **Decision**: `delivery_settings.courier_when_no_windows boolean NOT NULL DEFAULT false`. In the v2
  quote, when `effyWindows.unavailable` is set, the setting is on and
  `courier_reaches_postcode` is true, the quote is the courier shape with `reason: "no_window"`.
  The client shows 078's no-windows sentence, then the courier offer. With the setting off, 078's
  behaviour is unchanged.
- **Reach for a listed postcode**: the same function as R1 — one definition of "a courier can be
  booked there". A listed postcode that is on the courier exclusion list gets no fallback.
- **Not a customer choice**: when any window is open the courier shape is never returned (FR-003).

### R6 — One sentence for "how is this order delivered", written once
- **Decision**: `packages/shared-types/src/delivery-type.ts` — `DeliveryType`, `DELIVERY_TYPE_WORDS`
  and `deliverySummary({deliveryType, courierEstimate, arrivals}, now)` → `{ heading, lines[] }`:
  - courier → heading "Courier delivery"; line "Delivered by a courier partner. Usually arrives in
    {estimate} — an estimate, not a guaranteed date."
  - effy or legacy → one line per distinct arrival: "Same-day delivery · Today, 4 pm – 6 pm" /
    "Standard delivery · Thu 9 Oct, 4 pm – 6 pm" (the existing `distinctArrivals` + `formatArrival`).
  Rendered by customer-web, the receipt email sender and — through a Kotlin twin pinned to
  `delivery-type.fixtures.json` — customer-mobile (the `effy-windows` / `CoverageWords.kt` pattern).
  `OrderDTO` and the order list item gain `delivery?: {type, courierEstimate}` (absent on a legacy
  order). `arrivalEstimates` is **empty** for a courier order, so a client built before 079 prints no
  arrival rather than "Standard delivery".
- **Rationale**: FR-022/023, SC-005. Seven surfaces with their own wording is the defect 052 and 069
  each deleted once.

### R7 — The type's history has one writer
- **Decision**: `public.order_delivery_type_change` (order, from, to, reason, actor kind + sub, note,
  at). Written only by `@effy/edge-shared/delivery`'s `recordDeliveryType(tx, …)`: called by `finalize`
  for the first entry (`from = NULL`, actor `checkout`, idempotent on a partial unique index), and by
  E7 later for a staff change (which also updates the order's columns in the same call). `REVOKE
  UPDATE, DELETE` from every service role; a guard test fails any other statement that names the table
  or sets `delivery_type`.
- **Pending orders**: `captureDelivery` writes the three order columns on every intent (the customer
  may change address between attempts); history starts only when the order is placed (F8).
- **Live**: placement already announces the order; a change announces through `announceOrder` inside
  the writer's caller (E7). No new kind.

### R8 — Shops are told who takes the package
- **Decision**: shop DTOs gain `deliveredBy: "effy_driver" | "courier"` from R2's function; the shop
  order list gains a `deliveredBy` filter. `deliveryMethod` and the `method` filter stay on the wire,
  deprecated, for installed shop apps, and are removed at E9. shop-web and shop-mobile print only the
  new field; a guard fails the words "same-day"/"standard" in shop UI source.
- **Ungated**: the label is true of every package, old or new, so it ships on release (spec US8).

### R9 — Back-office
- **Decision**: no new route. `GET /orders/v1/orders` gains `deliveryType=effy|courier|legacy`;
  list rows and detail gain `deliveryType`, and detail gains `deliveryTypeReason`, `courierEstimate`
  and `deliveryTypeHistory[]`. `PUT /admin/v1/delivery/coverage/courier` accepts `estimateText` and
  `whenNoWindows` beside `offered`; `GET …/coverage` returns them and what blocks switching on.
  Clearing the estimate or deactivating the courier table while courier is on is refused (409) — switch
  courier off first.
- **Gateway**: staff, unchanged counts (shared 158, staff 146 of 300).

### R10 — What is NOT removed here (moved to E9)
- **Decision**: the same-day bridge (`delivery_zone.sameday_eligible`, `shop_sameday_exception`,
  `sameDayForShops`), the per-package compatibility `feeAmount` and the "N of your M deliveries"
  sentence stay until the legacy checkout is deleted.
- **Rationale**: F11 — they are read only by the checkout customers are using today. The new path has
  not consulted any of them since 078 (FR-036/037 hold there already). Deleting them now changes the
  live checkout and breaks 078's P9. Backlog E9 gains the three items.

### R11 — Address change
- **Decision**: clients drop the chosen window and the shown total whenever the selected address id or
  its postcode changes, and re-quote; the picker returns with nothing selected. Server side, the next
  intent replaces the pending order's delivery rows and deletes its booking (F8); a hold left behind by
  an abandoned checkout lapses on its own (≤ `slot_hold_min`). No release route is added — the quote
  runs read-only as `effy_shopper`. **The spec's FR-017 was tightened to say exactly this.**

### R12 — Screens
- **Checkout (web, mobile)**: the delivery step has a heading — "Delivered by Effy" above 078's two
  sections, or "Courier delivery" above two lines of text and the fee. No picker, no card, no icon
  tile. Reference: Uber Eats "Standard / Schedule" block for Effy; eBay's "Estimated delivery" line
  ("Estimated between …", explicitly not guaranteed) for courier.
- **Shop**: a text label in the existing method position; `--brand` for Effy driver is *not* used —
  both are neutral (`muted`) badges, since neither is a status.
- **Back-office**: a "Delivery" column in the orders table, a filter in the existing filter row, and a
  "Delivery type" detail section with the history as a plain list.

### R13 — Telemetry
- **CloudWatch** (commerce): `DeliveryQuotes {outcome}` gains `courier` and `courier_fallback`;
  `OrdersPlaced {deliveryType}`; `DeliveryTypeChanged` (the 409); `DeliveryQuoteFailures` keeps the
  invariant (coverage says courier and it cannot be priced). No new alarm: the existing
  `DeliveryQuoteFailures` alarm covers it.
- **PostHog**: `checkout_delivery_type_shown {type, reason}`; 078's `checkout_window_selected`
  unchanged. No PII, no postcode.

### R14 — Not done here
- Courier consignments, pickup from supplier, tracking, per-service estimates, driver-app wording (E6).
  Staff changing the type, compensation (E7). Planner for later-day windows (E8). The switch's setter,
  removals in R10, dropping `delivery_method` / `opd.method` (E9).
