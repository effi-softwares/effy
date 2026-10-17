# Map 1 — The customer-facing delivery engine (who delivers, when, for how much → paid)

Scope: everything from "does Effy deliver to this postcode?" to the moment an order is paid. Read from
code and migrations on branch `dev` (HEAD f9118e04), 2026-10-18. Paths are relative to
`/Users/janith/Projects/effy`. `ES` = `apis/edge-api/shared/src` (the `@effy/edge-shared` package).

Nothing here was run against a database; container tests were not run. Claims are from reading source.

---

## 0. The one-paragraph picture

A customer address's **postcode** is looked up by one SQL function, `public.coverage_for_postcode`, that
answers `effy | courier | none`. **effy**: the order is priced once by `effyFee` (base + distance band of
the postcode's stored km + weight band of the whole basket + a premium for the chosen window, rounded
up, clamped, zeroed at the free-delivery amount, plus a small-order fee). The customer picks **one
window for the whole order** from today + the next N delivery days (a timed window, a day with no time
via the "Any time" window, or "as soon as possible"). **courier**: one flat+weight fee, an estimate
string, nothing to choose. The client calls `POST /commerce/v1/checkout/quote`, then
`POST /commerce/v1/checkout/intent`, which **re-quotes from scratch**, refuses on mismatch (409), writes a
pending order, **holds a place** in the window under the slot's row lock, and creates a Stripe intent
for the card amount. At payment (`finalizeSucceeded`, via webhook or `/checkout/confirm`) the hold
becomes a confirmed booking, one `shop_fulfillment` row is created per shop that owns a product in the
cart, and the delivery type gets its first history row.

**There is no shop selection.** The fulfilling shop of a line is simply `product.shop_id` (§6).

---

## 1. Coverage — where Effy delivers

### What it does
Decides, per normalised 4‑digit AU postcode and instant, who delivers: Effy (postcode is on the list),
courier (not on the list, courier delivery on and sellable), or none.

### Key files
- `ES/delivery/coverage.ts:41` `coverageForPostcode(q, postcode, now)` — the only TS wrapper; one
  `SELECT … FROM public.coverage_for_postcode($1,$2)`. Returns `{kind, reason, distanceKm, groupId, groupName}`.
- `ES/delivery/coverage.ts:68` `courierReachesPostcode` — used by the quote for the "listed postcode,
  no window left" fallback only.
- `ES/delivery/coverage.ts:94` `loadCourierSettings` — default courier service's estimate + id,
  `courier_collection_default`, `courier_when_no_windows`.
- `ES/delivery/zone.ts:10` `normalizePostcode` (`/^[0-9]{4}$/` after trim; malformed = 400, never "not served").
- `ES/delivery/zone.ts:22` `serviceableForPostcode` — **no production caller** (see Observations).
- `ES/delivery/locality.ts:18` `searchLocalities` — address typeahead (digits → postcode prefix, else
  name prefix), alphabetical, deliberately not ordered by serviceability.
- `customer/src/addresses/model.ts:39` — address book computes `coverage` per address inline via
  `(SELECT c.kind FROM public.coverage_for_postcode(btrim(postal_code)) c)` (worked out, never stored).
- `storefront/src/functions/serviceability-v1-get.ts` — public serviceability + basket "offer".
- Admin: `admin/src/delivery/coverage.service.ts` / `coverage.repository.ts` (548 lines).

### SQL (current definitions)
- `public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now())` —
  `db/migrations/20261009011552_order_delivery_type.sql:141`. If the postcode is in
  `delivery_zone_postcode` → `('effy','listed', distance_km, group_id, group_name)` (group only if
  `delivery_zone.status='active'`). Otherwise asks `courier_reaches_postcode` and maps
  `courier_offered → 'courier'`, else `'none'` with the reason.
- `public.courier_reaches_postcode(p_postcode, p_at)` — same file `:108`. Order of checks:
  postcode must exist in `public.locality` (else `unknown_postcode`) → `courier_delivery_state` →
  `courier_excluded_postcode` → state.
- `public.courier_delivery_state(p_at)` — redefined in `20261009051347_courier_fulfilment.sql:~140`:
  `courier_off` (settings flag false) → `courier_not_ready` (no active default `courier_service` OR no
  active `delivery_fee_plan` of kind courier) → `courier_pending` (if `delivery_model_v2_at` false —
  now always true) → `courier_offered`.
- `public.haversine_km`, `public.coverage_computed_distance_km(postcode)` —
  `20261008114600_effy_delivery_coverage.sql:17,32`: distance from hub (settings lat/lng) to the
  postcode's most-addressed locality centroid, rounded to 2dp.

### Data model
| table | key columns | notes |
|---|---|---|
| `delivery_zone_postcode` | `postcode` UNIQUE, `zone_id` NULL→`delivery_zone` ON DELETE SET NULL, `distance_km numeric(7,2) NOT NULL` (0–5000), `distance_source` computed\|manual, `distance_review bool`, `added_by`, `updated_at` | **This IS the list** (047 name kept). |
| `delivery_zone` | `id, code, name, status active\|disabled, updated_by` | Optional **group**; scopes driver clearances; ring/hub_distance/sameday columns dropped (077, 083). |
| `courier_excluded_postcode` | `postcode PK`, reason… | Courier can't go there. |
| `locality` | `name, state, postcode, latitude, longitude, address_count` | G-NAF derived; loaded by `make load-localities`. |
| `delivery_settings` (singleton id=1) | `hub_latitude, hub_longitude, courier_offered, courier_when_no_windows, courier_collection_default` … | see §9 for every column. |

### Business rules
- On the list ⇒ Effy, full stop. Group status, courier exclusions, shops are not consulted.
- Off the list ⇒ courier only if locality knows the postcode, courier is on, not excluded, a courier
  fee table is active and a default courier service exists.
- Distance is **per postcode** (centroid of the postcode's most-addressed locality), stored at listing
  time. A hub move recomputes all `computed` distances in the same transaction and flags `manual` ones
  for review (`admin/src/delivery/repository.ts:upsertSettings`).
- Adding a postcode requires a locality row (`unknown_postcode` 422) and a distance (computed, or
  manual entry; else `distance_required` 422) — `coverage.service.ts:169-198`.
- Removing a group ungroups its postcodes (FK SET NULL); never removes coverage.
- Customer gets one refusal sentence: `COVERAGE_REFUSAL_SENTENCE` in
  `packages/shared-types/src/delivery.ts`, 422 `COVERAGE_REFUSAL_CODE` from `commerce/src/checkout/respond.ts:72`.

### Routes
| method | path | service/gateway |
|---|---|---|
| GET | `/storefront/v1/serviceability?postcode=` | storefront / shared; `Cache-Control max-age=300` (`storefront/src/lib/cache.ts:22`) |
| GET | `/storefront/v1/localities?q=` | storefront / shared; max-age 86400 |
| GET/POST/PATCH/DELETE | `/customer/v1/addresses[/{id}]` | customer (coverage per address computed in SQL) |
| GET | `/admin/v1/delivery/coverage`, `/coverage/places`, `/coverage/check` | admin / staff |
| POST/PATCH | `/admin/v1/delivery/coverage/postcodes`; DELETE `/coverage/postcodes/{postcode}` | admin / staff |
| POST/PATCH/DELETE | `/admin/v1/delivery/coverage/groups[/{groupId}]` | admin / staff |
| PUT | `/admin/v1/delivery/coverage/courier` (offered / when-no-windows / collection default) | admin / staff |
| POST/DELETE | `/admin/v1/delivery/coverage/courier/exclusions[/{postcode}]` | admin / staff |
| GET | `/fleet/v1/coverage` | fleet / staff — ⚠ a DIFFERENT concept: driver-clearance gaps per group (062), `fleet/src/coverage/repository.ts` |

(`/admin/v1/deliverability*` is email deliverability — unrelated.)

### Guards
`ES/delivery/coverage.guard.test.ts` — P10 the refusal sentence written once (TS + Kotlin
`CoverageWords.kt`), P11 a customer contract carries no reason/group/distance, P12 only allow-listed
files read `delivery_zone_postcode`, and the answer is read via the one function/wrapper.

---

## 2. Fee engine — how much

### What it does
One fee per **order** (never per shop), integer cents, pure function. Two kinds of plan: `effy` and
`courier`; exactly one active per kind.

### Key files
- `ES/delivery/engine.ts` (278 lines, pure, no I/O):
  - `:127 basketValueCents(itemSubtotal, discount)` = max(0, subtotal − promo). Points NOT subtracted.
  - `:135 distanceBandFor` — smallest `upperKm ≥ km` (boundary takes the lower band) else open band; none → `UnpricedDistanceError`.
  - `:151 weightBandFor` — smallest `upperGrams ≥ g` else the heaviest band ("open top"); no bands → `UnpricedWeightError`.
  - `:185 effyFee` — `raw = base + distance + weight + premium`; `settle` = ceil to step, clamp
    [floor, cap]; free if `basket ≥ freeOver` (whole fee incl. surcharge → 0); small-order fee added if
    `basket < smallOrderUnder` (outside rounding and cap).
  - `:232 courierFee` — `base + weight`, round/clamp, courier plan's own `freeOver`; no distance, no
    premium, no small-order fee.
  - `:270 feeLines` — customer lines `delivery`, `window_surcharge` (= clamped − clampedWithoutPremium,
    i.e. what the window actually added after the cap), `small_order`, `free_delivery` (negative). Always
    sum to `totalCents`.
- `ES/delivery/plan.ts` — `Plan` shape; `loadActivePlan(q, kind)` (throws `NoActivePlanError`),
  `loadPlan(id)`, `withBands` (3 queries; slot premiums only for **active** slots);
  `windowPremiumCents(plan, slotId, isToday)` = (today ? `today_premium_amount` : 0) + per-slot premium;
  `slotId === null ⇒ 0`.
- `ES/delivery/quote.ts:138 priceEffyOrder`, `:165 priceCourierOrder` — wrap the engine; convert
  `Unpriced*` into `ListedPostcodeUnpricedError` / `CourierNotPurchasableError` (fail loud → metric
  `DeliveryQuoteFailures`, never free delivery).
- `ES/delivery/fee-wire.ts` — `feeDTO` (customer: lines + total), `storedBreakdown` (v1 JSON stored in
  `order.delivery_fee_breakdown`: plan id/name, inputs km/grams/basket/slotId/windowIsToday, every part,
  lines), `offerDTO` (free-over / small-order amounts for the cart before an address exists).
- Admin: `admin/src/delivery/pricing.service.ts` (309), `pricing.repository.ts` (233).

### Data model
| table | columns |
|---|---|
| `delivery_fee_plan` | `id, name UNIQUE, kind effy\|courier, is_active, rounding_step (def 0.50), floor_amount, cap_amount, base_amount, free_over_amount NULL, small_order_under_amount NULL, small_order_fee_amount NULL, today_premium_amount (def 0), created_by, activated_by, activated_at, updated_by, updated_at` |
| `delivery_distance_band` | `plan_id, upper_km NULL(=open), add_amount`; UNIQUE(plan,upper_km); one open band per plan |
| `delivery_weight_band` | `plan_id, upper_grams, add_amount` |
| `delivery_slot_premium` | `(plan_id, slot_id) PK, add_amount > 0` — premium belongs to the plan |

CHECKs (`20261008135721_delivery_fee_engine_v2.sql`, 047): cap/floor on step grid, cap ≥ floor,
small-order pair both-or-neither, `small_order_under < free_over`, small fee and today premium on step
grid, courier shape (no small-order, no today premium), one active per kind (partial unique index).
`same_day_factor`/`standard_factor` dropped in 083.

### Plan lifecycle
State derived: draft (never activated) → active → retired (activated_at set, not active). Activated
plans are immutable; a retired plan is copied, never reactivated. **Only path live:**
`public.delivery_plan_activate(plan, actor, confirm_zero_floor)` — advisory lock per kind, refuses
`plan_not_found | plan_already_active | plan_retired | plan_incomplete (DETAIL = blocking gaps) |
zero_floor_unconfirmed`, deactivates old then activates new in one tx. `public.delivery_plan_gaps(plan)`
codes: `distance_bands_missing`, `distance_open_band_missing`, `distance_not_monotonic`,
`weight_bands_missing`, `weight_not_monotonic` (blocking); `premium_on_disabled_slot`, `floor_is_zero`
(advisory).

### Routes (admin, staff gateway)
`GET/POST /admin/v1/delivery/plans`, `PUT /plans/{planId}` (replace draft),
`POST /plans/{planId}/activate`, `POST /plans/simulate` (same `effyFee`/`courierFee`, plan by id).

### Guards
`ES/delivery/fee.guard.test.ts` — P20 no shop contract/query carries delivery money; a customer route
reads only `delivery_fee_breakdown->'lines'`; P21 nothing reads a ring/tier or a method multiplier; P22
only `engine.ts` adds a base to a band, and checkout + simulator price through `effyFee`/`courierFee`.
`engine.test.ts`, `fee.container.test.ts`, `fee.goose.container.test.ts`.

---

## 3. Windows, days, capacity, ASAP — when

### What it does
Lays out today + the next `effy_lookahead_days` **delivery** days, judges each active window per day,
and exposes timed windows, the day's "Any time" window, and an ASAP option.

### Key files
- `ES/delivery/slots.ts:87 judgeWindow(now, date, slot, booked, runs, bufferMin, turnaroundMin)` —
  **the one window rule**. Open iff: (1) `now ≤ cutoff` on that date; (2) **today only**: some active
  collection run satisfies `now ≤ run − prepBuffer` AND `run + turnaround ≤ window start` (effective
  cutoff = min(slot cutoff, last such orderBy)); else `uncollectable`; (3) `capacity === null || booked
  < capacity` else `full`. Reason precedence cutoff > uncollectable > full. Later days are always
  "collectable".
- `ES/delivery/slots.ts:41 clockOn`, `:47 clockOnDate` — the one place a wall clock (Australia/Melbourne)
  becomes an instant (`lib/collection-deadline.ts:84 instantAtLocalTime`). Guarded.
- `ES/delivery/slots.ts:150 loadSlotSettings` (defaults if no row: hold 10, turnaround 60, lookahead 3,
  ASAP "usually within 2–3 days"), `:204 loadSlots` (active, by start), `:221 lockSlot` (`FOR UPDATE` —
  the capacity guarantee), `:241/253 slotLoad / slotLoadByDate` (read view `delivery_slot_load` only),
  `:266 ownLiveHoldsByDate` (customer's own unexpired holds on pending orders, subtracted in the quote),
  `:316 nonDeliveryDates`.
- `ES/delivery/windows.ts:37 effyDays(now, lookahead, noWeekdays, noDates)` — today always first (flagged
  `nonDelivery` if excluded), then the next `lookahead` non-excluded days (scan bounded at 60; arithmetic
  at noon UTC for DST safety). `:92 openWindows` — per day: timed windows sorted, `closedReason`
  (`not_delivery_day|full|closed`), `anyTime` (open Any‑time window, never in `windows[]`).
  `:125 windowsUnavailable` → `null` if any day has a timed window **or an open Any-time window**; else
  `no_windows` (timed windows exist) or `none_defined`. `:132 windowKey = slotId|date`.
- `ES/delivery/schedule.ts:35 collectionSchedule` (active runs + `sameday_prep_buffer_min`),
  `:7 melbourneDate`, `:21 lastOrderCutoff` (only referenced by a cross-language contract test now).
- Admin windows: `fleet/src/slots/{service,repository,sql}.ts`; days: `fleet/src/deliverydays/*`.

### Data model
| table/view | columns / rule |
|---|---|
| `delivery_slot` | `id, start_time, end_time, cutoff_time` (Melbourne wall clock), `capacity int NULL (NULL = unlimited, default)`, `status active\|disabled`, `any_time bool`, `updated_by`. CHECK end>start, cutoff≤start, capacity≥1; UNIQUE(start,end); exactly one `any_time` row (unique partial index) and it must be active (`delivery_slot_any_time_active_ck`). |
| `delivery_slot_booking` | `slot_id, delivery_date, order_id UNIQUE, state held\|confirmed\|released, held_until, window_start, window_end (instants), over_capacity` |
| view `delivery_slot_load` | per (slot,date): `booked` = confirmed + held with `held_until > now()`; `over_capacity` count. The one definition of "a booking counts". |
| `delivery_non_delivery_date` | `day PK, label, created_by` |
| `delivery_collection_run` | `run_time time UNIQUE, label, status` — daily, no weekday dimension |
| `order_package_delivery` | `order_id, shop_id` UNIQUE pair, `method same_day\|standard`, `promised_from/to date`, `slot_id, window_start, window_end` (all-or-none) |

### Business rules
- **One window for the whole order.** `same_day` on a package = window today, `standard` = a later day
  (customer words, not routing — except on courier packages, where `standard` is routing).
- **Any time window (085)**: created by migration `20261013130000_any_time_window_always.sql` with hours
  spanning existing windows (default 09:00–21:00), cutoff = earliest cutoff, no capacity. Customers may
  pick it only for a **later** day (`delivery-choice.ts:63`), and it is never sent for today
  (`commerce/src/checkout/quote.ts:80`). Its fee is `baseFee` (no window or today premium) — `ES/delivery/quote.ts:276`.
- **ASAP**: `resolveAsap` (`commerce/src/checkout/delivery-choice.ts:79`) binds the first calendar day
  (today included) whose Any-time window is open; customer is told `asap_estimate`, never the day; fee
  = `baseFee`. Because the Any-time window starts at the earliest window's start and today requires
  `run + turnaround ≤ start`, ASAP almost always lands on the next delivery day (acknowledged in
  FEATURE-HISTORY 085).
- **Hold**: at the payment-intent call, `held_until = now + slot_hold_min` (default 10). Confirmed at
  payment; a lapsed hold whose slot filled meanwhile is honoured and flagged `over_capacity`
  (`ES/payments/finalize.ts:85 confirmSlotBooking`).
- **Never substituted**: a gone window is a 409 refusal; the customer re-chooses.
- `delivery_promise` on the order: `window | day | asap` (NULL = courier or pre‑085, read as `window`).
  Two writers: checkout `captureDelivery` and `override.ts` (guarded).

### Configuration knobs (all `delivery_settings`, id=1)
| column | default | edited by |
|---|---|---|
| `effy_lookahead_days` | 3 (1–14) | `PUT /fleet/v1/delivery-days` |
| `standard_no_delivery_weekdays smallint[]` | `{}` (never all 7) | same |
| `slot_hold_min` | 10 (svc 1–60) | same |
| `sameday_hub_turnaround_min` | 60 (svc 0–480) | same |
| `asap_estimate` | "usually within 2–3 days", NOT NULL | same |
| `sameday_prep_buffer_min` | 60 | `PUT /admin/v1/delivery/settings` |
| `hub_latitude/longitude` | required | same (moves recompute distances) |
| collection runs | none | `/admin/v1/delivery/collection-runs` (GET/POST/DELETE) |
| per-slot start/end/cutoff/capacity/status | — | `GET/POST /fleet/v1/delivery-slots`, `PATCH /{slotId}` |
| non-delivery dates | — | `POST /fleet/v1/delivery-days/dates`, `DELETE /dates/{day}` |

### Guards
`ES/delivery/windows.guard.test.ts` — the switch column has one writer and nothing asks which model is
on; only `slots.ts` turns a clock into an instant; readiness defined once. `windows.test.ts`,
`slots.test.ts`, `windows.container.test.ts`, `fleet/src/slots/slots.container.test.ts`.

---

## 4. The quote (shared) — composing coverage, fee and windows

`ES/delivery/quote.ts:223 quote(q, customerId, postcode, pkgs, now, basketCents)`:
1. `coverageForPostcode` → `courier` ⇒ `quoteCourier(..., "out_of_coverage")`; `none` ⇒ `{serviced:false}`.
2. `effy`: load active effy plan; km from coverage (null ⇒ `ListedPostcodeUnpricedError`).
3. collection schedule, slot settings, calendar (`effyDays`), slots, load by date minus the customer's
   own live holds, `openWindows`.
4. If `windowsUnavailable` and `courier_when_no_windows` and `courierReachesPostcode` ⇒ courier quote
   with reason `no_window`.
5. `baseFee` (no window); a fee per open timed window per day (`windowKey`); Any-time ⇒ `baseFee`;
   `asap = {estimate, fee: baseFee}` if any day has an open Any-time window.
6. Returns `{coverage:"effy", zoneId, shopIds, baseFee, freeDeliveryRemainingCents, effyWindows}`.

`quoteCourier` (`:181`): active courier plan (else `CourierNotPurchasableError`), default service +
estimate (else same), `priceCourierOrder`, `collection = courier_collection_default`.

The basket is weighed whole: `grams = Σ pkgs.grams` where `pkgs` are per-shop sums of
`product.weight_grams × quantity` (`commerce/src/checkout/quote.ts:49 packagesFromLines`).

---

## 5. Checkout flow in `commerce` (quote → intent → paid)

### Routes (shared gateway, customer JWT)
| method | path | handler |
|---|---|---|
| POST | `/commerce/v1/checkout/quote` `{addressId}` | `commerce/src/functions/checkout-quote-v1-post.ts` → `checkout/quote.ts:134 quoteForCheckout` |
| POST | `/commerce/v1/checkout/intent` | `functions/checkout-intent-v1-post.ts` → `checkout/service.ts:261 createIntent` |
| POST | `/commerce/v1/checkout/confirm` `{orderId}` | `functions/checkout-confirm-v1-post.ts` → `service.ts:512 confirm` |
| POST | `/commerce/v1/stripe/webhook` | `webhook/handler.ts` |

### Quote response (`checkout/quote.ts:96 toQuoteDTO`)
- `{postcode, serviced:false, coverage:"none"}` or
- courier: `{coverage:"courier", expiresAt (+30 min, informational), freeDeliveryRemainingAmount, courier:{estimate, fee:{lines,totalAmount}, reason}}`
- effy: `{coverage:"effy", …, effyWindows:{days:[{date, section:"same_day"|"standard", windows:[{slotId,date,startAt,endAt,cutoffAt,surchargeAmount,fee}], closedReason, anyTime (never today)}], unavailable, asap:{estimate,fee}|null}}`
- plus `points` when usable > 0. No package list, no capacity, no shop, no distance.
- Emits `EffyWindowsNoneDefined` on the read.

### Intent request (validated in the handler)
`addressId`, `billingAddressId`, `wantsProviderMethodList?`, `pointsToUse?` (int ≥ 0),
`shownDeliveryAmount?` ("6.00"), `deliveryWindow?: {slotId uuid, date yyyy-mm-dd}`,
`deliveryPromise?: "asap"`, `deliveryType?: "effy"|"courier"`, `deliveryInstructions`.

### `createIntent` steps (`commerce/src/checkout/service.ts:261-506`)
1. Cart lines (`store.cartLines`: availability-filtered, quantity capped at `stock_on_hand` when tracked,
   storage class from product attribute), address snapshot, empty-cart refusal.
2. Cart minimum (`cart-policy` `meetsMinimum` on **item subtotal before discount**) → `BelowMinimumError`.
3. Promo discount re-computed; `quote(...)` re-run from scratch with `basketValueCents`.
4. `!serviced` ⇒ 422 coverage refusal. Delivery-type check: courier quote requires
   `deliveryType:"courier"`; an effy quote refuses `"courier"` ⇒ 409 `delivery_type_changed`. (An
   absent type is accepted for effy — old clients.)
5. Resolve the choice: `resolveCourier` (packages `standard`, no day/slot, no hold) or
   `resolveEffyChoice` (`delivery-choice.ts:101`): both window+asap or neither ⇒ `slot_required`;
   `no_windows_available`, `date_unavailable`, `slot_unavailable`.
6. `shownDeliveryAmount` ≠ fee total ⇒ 409 `delivery_fee_changed` (nothing written).
7. Points validation (`PointsExceedTotal`, card remainder < 50¢).
8. `mayReusePendingOrder` (asks Stripe about the open order's intent; settles/fails it if final).
9. `store.upsertPendingOrder` (**tx A**): order row amounts + `delivery_fee_amount` +
   `delivery_fee_breakdown`, lines replaced (`order_item` with `shop_id`, customer and shop prices).
10. `store.holdPoints` (**tx B**).
11. `store.captureDelivery` (**tx C**, `checkout/store.ts:374`): delete the order's own booking; if a
    hold: `lockSlot` → re-run `judgeWindow` against `slotLoad` for the date → insert `held` booking;
    write `delivery_quote` (captured: shopIds + every window fee offered) and `delivery_quote_expires_at`,
    `delivery_type`, `delivery_type_reason`, `courier_estimate`, `courier_service_id`, `courier_collection`,
    `delivery_promise`, `asap_estimate`; replace `order_package_delivery` rows. `SlotUnavailableError` ⇒ 409 `slot_unavailable`.
12. Billing snapshot, delivery instructions (separate statements).
13. Points-only ⇒ cancel any old intent, `placePointsOnly`, `settlePaid` immediately.
14. Else ensure Stripe customer, `createPaymentIntent` (idempotency key = sha256(order, cardCents,
    providerCustomer)), optional customer session, `upsertPayment`.
Response: `orderId, orderNumber, clientSecret, grandTotalAmount, deliveryFee{lines,total}, points split,
slotHeldUntil?, deliveryType?, billingDetails, payOverTimeAvailable`.

On `DeliveryChoiceError` / `DeliveryFeeChangedError` the handler re-quotes and returns the fresh quote
in the 409 body (`respond.ts:27-55`).

### Paid transition (`ES/payments/finalize.ts:126 finalizeSucceeded`, one tx)
Guard `UPDATE order SET status='paid' WHERE status='pending_payment'` → `shop_fulfillment` per
`order_item.shop_id` → copy `order_package_delivery.method` to `shop_fulfillment.delivery_method` →
`recordDeliveryType` first history row → `confirmSlotBooking` (locks slot, `over_capacity` for late
payers) → spend held points → lock + decrement stock (ordered by product id) → shortfall flags → outbox
events/notifications/receipt → payment succeeded → promo redemption → empty cart.
Reached from the webhook (event row + effects in one tx), `/checkout/confirm`, or `mayReusePendingOrder`.

### Metrics
`DeliveryQuotes{outcome}`, `DeliveryQuoteFailures`, `EffyWindowsNoneDefined`, `DeliveryTypeChanged`,
`StandardDateRefused`, `SlotBookings{outcome: held|confirmed|refused_*}`, `DeliveryFeeChanged`,
`FreeDeliveryOrders`, `StockBlocked`, `PointsOnlyOrders`.

### Guards
`commerce/src/checkout/checkout.guard.test.ts` — no package list in the quote DTO, fee is a string,
refusal is 409 with code + fresh quote, intent reads no amount from the request except the compared
`shownDeliveryAmount`, no `setup_future_usage`, webhook event insert first.

---

## 6. Order → package → shop_fulfillment split (shop "selection")

**There is no fulfilment-shop selection or allocation logic.** Verified:
- `public.product.shop_id NOT NULL` (`20260716092105_product_catalog.sql:88`) — "Shop-owned catalog
  item … eBay seller-listing model". A product row belongs to exactly one shop.
- `cartLines` takes `p.shop_id` straight from the product (`commerce/src/checkout/store.ts:166`).
- `packagesFromLines` groups lines by `shopId` (`commerce/src/checkout/quote.ts:49`); the quote's
  `shopIds` is `distinctShops(pkgs)` in first-appearance order.
- One `order_package_delivery` row per (order, shop) at intent; one `shop_fulfillment` per (order, shop)
  at payment (`finalize.ts` step 2). Stock is per product (= per shop); a short shelf caps the paid
  quantity at intent and flags a shortfall at payment — never re-routes to another shop.
- Grep for `allocat|chooseShop|pickShop` finds nothing in delivery/checkout.

"Hidden fulfilment" is therefore a **presentation** rule (the customer DTOs never name a shop or count
packages; guards `admin/src/shops/hidden-fulfilment.guard.test.ts`, `scripts/mobile-guard.sh`), not a
routing engine. If two shops list the same physical item they are two products; the customer sees
whichever the catalogue shows.

---

## 7. Delivery type, courier services, collection mode, consignments, legacy

### Delivery type (079)
- `order.delivery_type effy|courier`, `delivery_type_reason in_coverage|out_of_coverage|no_window|staff_change`,
  `courier_estimate` (exactly when courier) — CHECKs in `20261009011552_order_delivery_type.sql`.
- `order_delivery_type_change` (append-only; one first row per order via partial unique index;
  `effy_shopper` has no UPDATE/DELETE).
- `ES/delivery/delivery-type.ts` — `deliveredBySql(o, method, slot)` and `fulfilmentDeliveredBySql` (both
  call `public.package_delivered_by(type, method, slot_id)` = `COALESCE(type, same_day OR slot ⇒ effy
  else courier)`); `recordDeliveryType` (first row at payment; idempotent) and `changeDeliveryType`
  (staff move; locks order row) — **the one writer**.
- Guard `delivery-type.guard.test.ts`: history table named only by writer/reader; type set only at
  checkout pending order + the writer; `delivery_promise` two writers; nothing decides "who delivers"
  from the window; the old "courier offered" constant is gone.

### Courier services and collection (080)
- `courier_service` (`courier_name, service_name, estimate_text, max_business_days, pickup_weekdays int[],
  pickup_cutoff time, collects_from_supplier, status active|retired, is_default` — exactly one default,
  must be active). Operator-entered, never seeded.
- `order.courier_service_id`, `order.courier_collection hub|supplier` (from
  `courier_collection_default` at checkout), `order_courier_collection_change` (append-only).
- `public.courier_parcel_collection(type, mode)` — supplier only for a courier order in supplier mode.
- `ES/delivery/courier-pickup.ts nextCourierPickup(from, weekdays, cutoff)` — when a hub parcel is due out.
- `ES/delivery/consignment.ts` (549 lines) — the one writer of `courier_consignment`,
  `courier_consignment_event`, `carrier_handoff`, mode changes (`bookConsignment`, `handOver`,
  `recordConsignmentStep`, `changeCourierCollection`, `setCourierRouting`). One live consignment per
  `shop_fulfillment`. Guard `consignment.guard.test.ts`.
- Admin routes: `GET/POST /admin/v1/delivery/courier-services`, `PUT /courier-services/{id}`; orders
  routes (staff): `PUT /orders/v1/fulfillments/{id}/consignment`, `POST …/consignment/events`,
  `POST …/consignment/label`, `PUT /orders/v1/orders/{orderId}/courier-collection`.

### Back-office move (081) and re-time (085) — `ES/delivery/override.ts` (832 lines)
- `previewMove`, `moveToCourier`, `moveToEffy`, `changeEffyWindow`; lock order: planner advisory lock
  (`PLANNER_PASS_LOCK`) → order row → slot (for Effy binds) → payment → points.
- Refusals (`guardMove`): `not_paid, no_delivery_type, already_*, delivered, handed_over,
  with_driver_after_failure, out_for_delivery, courier_not_ready, not_in_area, window_unavailable,
  changed (optimistic updatedAt), compensation_changed`.
- To courier: releases booking, packages → `standard` no window, routing via `setCourierRouting`,
  promise cleared, type change, compensation (`points_difference` default, `free_delivery_points`,
  `free_delivery_refund`, `refund_difference`, `none`) via points ledger / `recordRefundIn`, row in
  `delivery_override` (append-only).
- To Effy / re-time: `bindEffyWindow` re-runs the calendar + `judgeWindow` under `lockSlot`, upserts a
  **confirmed** booking, rewrites packages + `shop_fulfillment.delivery_method`. No money moves.
- Routes: `GET/POST /orders/v1/orders/{orderId}/delivery-move`, `POST /orders/v1/orders/{orderId}/delivery-window`.

### Legacy / cutover (083)
- `ES/delivery/legacy.ts` `LEGACY_OPEN_ORDER_SQL`, `legacyOpenOrders` — orders with no type still open.
  Used by `orders/src/orders/repository.ts:133` (filter) and the go-live service.
- `ES/delivery/readiness.ts goLiveReadiness` — used by go-live page/setter/sweep only.
- `public.delivery_model_v2_at` = `SELECT true` since `20261009150000_retire_delivery_model_v1.sql`.
- `admin/src/delivery/go-live.*`, routes `GET /admin/v1/delivery/go-live`, `PUT /go-live/switch`, and the
  scheduled `deliveryModelSwitchSweep` (rate 5 min, `admin/serverless.yml:1093`).
- `scripts/check-no-legacy-delivery.sh`, `check-shop-delivery-words.sh`, `check-driver-delivery-words.sh`.

---

## 8. Delivery tables — current shape (after all 82 migrations)

| table | purpose | introduced / reshaped |
|---|---|---|
| `delivery_settings` (id=1) | every delivery knob (see §9) | 047; +069, 072, 076, 078, 079, 080, 083, 085, 093 |
| `delivery_zone` | optional postcode group | 047 → 076 (group) → 077 (ring cols dropped) → 083 (sameday dropped) |
| `delivery_zone_postcode` | **the coverage list** + distance | 047 → 076 |
| `courier_excluded_postcode` | courier no-go list | 076 |
| `locality` | AU places + centroids | 030/047 |
| `delivery_collection_run` | daily shop→hub run times | 047 |
| `delivery_fee_plan`, `delivery_distance_band`, `delivery_weight_band`, `delivery_slot_premium` | pricing | 047 → 077 |
| `delivery_slot`, `delivery_slot_booking`, view `delivery_slot_load`, `delivery_non_delivery_date` | windows and capacity | 069 → 078 → 085 |
| `order_package_delivery` | per (order, shop): method, promised day, slot, window instants | 047 → 069 → 078 → 083 (fee dropped) |
| `order` delivery columns | `delivery_address jsonb, delivery_fee_amount, delivery_fee_breakdown jsonb, delivery_quote jsonb, delivery_quote_expires_at, delivery_type, delivery_type_reason, courier_estimate, courier_service_id, courier_collection, delivery_promise, asap_estimate, delivery_handover, delivery_note` | 047 … 085 |
| `shop_fulfillment.delivery_method`, `promised_ready_at` | copy of method; `promised_ready_at` deliberately never set | 047 |
| `order_delivery_type_change` | type history | 079 |
| `courier_service`, `order_courier_collection_change`, `courier_consignment`, `courier_consignment_event` | courier fulfilment | 080 |
| `delivery_override` | staff moves + compensation | 081 |
| `driver_zone_capability` | (driver, function, zone NULL=everywhere) clearances | 062 → 083 |

SQL functions: `coverage_for_postcode`, `courier_reaches_postcode`, `courier_delivery_state`,
`haversine_km`, `coverage_computed_distance_km`, `package_delivered_by`, `courier_parcel_collection`,
`delivery_plan_gaps`, `delivery_plan_is_complete`, `delivery_plan_activate`, `delivery_model_v2_at`
(constant true), `round_opens_at` (driver side, out of scope).

Churn: `delivery_zone`/`delivery_zone_postcode`/`order_package_delivery` were created (2026‑07‑21),
dropped (2026‑08‑02 `remove_delivery_zones_and_fees`), and recreated (2026‑08‑22); `delivery_ring*`,
`postcode_centroid`, `delivery_pricing_rule`, `delivery_price_band`, `shop_sameday_declaration/area`,
`delivery_area_decision`, `delivery_offering`, `shop_sameday_exception` all came and went.

---

## 9. `delivery_settings` — every column today, and who writes it

| column | default | writer |
|---|---|---|
| `hub_latitude`, `hub_longitude` | (required) | admin `PUT /delivery/settings` |
| `sameday_prep_buffer_min` | 60 | admin `PUT /delivery/settings` |
| `planning_lead_min`, `per_stop_allowance_min` | 45, 12 | driver-ops (063/072) |
| `slot_hold_min`, `sameday_hub_turnaround_min`, `standard_no_delivery_weekdays`, `effy_lookahead_days`, `asap_estimate` | 10, 60, {}, 3, "usually within 2–3 days" | fleet `PUT /delivery-days` |
| `load_overdue_min`, `checkin_overdue_min`, `vehicle_check_required` | 20, 30, false | fleet `PUT /delivery-days` (093) |
| `courier_offered`, `courier_when_no_windows`, `courier_collection_default` | false, false, 'hub' | admin `PUT /delivery/coverage/courier` |
| `delivery_model_v2_from`, `legacy_model_removed_at`, `legacy_orders_alert_days` | NULL, now(), 7 | go-live (record only) |
| `updated_by`, `updated_at` | | |

---

## 10. End-to-end invariants (what the code relies on)

1. One coverage decision: `public.coverage_for_postcode`, never stored. (guard P12)
2. One fee sum: `effyFee`/`courierFee`. (guard P22) One fee per order; package/fulfilment carry no fee.
3. One window rule: `judgeWindow`, used by quote, hold, staff moves.
4. One instant-maker: `clockOn`/`clockOnDate`.
5. One "booking counts": view `delivery_slot_load`.
6. Capacity serialised by `delivery_slot` row lock (`lockSlot`) at hold, confirm, staff bind.
7. One booking per order (`UNIQUE(order_id)`).
8. Who delivers: `package_delivered_by`; delivery-type history: one writer.
9. The amount is the platform's: intent re-quotes, client only *compares* `shownDeliveryAmount`.
10. A window is never substituted.
11. Customer never sees shop, package count, distance, group or capacity.

---

## 11. Observations

### A. Bugs, inconsistencies and fragile spots (with evidence)

1. **Superseded payment intents are not cancelled, and paying one is silently dropped.**
   `createIntent` makes a new intent whenever the card amount changes (idempotency key includes the
   amount, `service.ts:126,475`) and `upsertPayment` overwrites `payment.stripe_payment_intent_id`
   (`store.ts:440`). The old intent is only cancelled on the points-only path (`service.ts:436`). If a
   client confirms an old `clientSecret` (second tab, stale payment element), the webhook's
   `findOrderByIntent` returns null and the event is acked as "an intent that is not one of ours"
   (`webhook/handler.ts`, `if (!orderId) return "handled"`). Money captured, order stays pending, no
   alarm. Worth verifying against Stripe behaviour; at minimum cancel the previous intent when replacing it.

2. **`createIntent` is not atomic.** Order amounts/lines (tx A, `upsertPendingOrder`), points hold
   (tx B), delivery capture + slot hold (tx C), billing and instructions (separate statements). A
   `slot_unavailable` refusal in tx C leaves the order row with the *new* amounts, lines and
   `delivery_fee_breakdown` but the *previous* attempt's `delivery_type`/`delivery_promise`/packages/booking
   and the previous payment row/intent (old amount). The comment at `store.ts:368` ("a refusal here rolls
   back everything") is true only of tx C. Combined with (1) this can produce a paid order whose
   stored amounts differ from what the card paid.

3. **Lock-order inversion between hold and confirm.** `captureDelivery` locks `delivery_slot` then
   updates the `order` row (`store.ts:384→407`); `finalizeSucceeded` updates `order` first then locks the
   slot (`finalize.ts:128→97`); `override.ts` documents order → slot. A customer re-submitting the intent
   while the webhook for the same order lands can deadlock (Postgres aborts one; webhook retries). Rare
   but contrary to the "one lock order" the code claims elsewhere.

4. **The `none_defined` / "no windows" alarm and the courier-when-no-windows fallback are effectively
   unreachable.** `windowsUnavailable` returns `null` whenever any day has an open Any-time window
   (`windows.ts:126`). The Any-time window always exists, is always active and has **no capacity by
   default** (085 migration), and later days are always "collectable" — so with every timed window
   disabled, `unavailable` is still null, `EffyWindowsNoneDefined` never fires, and
   `courier_when_no_windows` never triggers. FEATURE-HISTORY 085 says the alarm "still means TIMED
   windows"; the code's early return contradicts that.

5. **ASAP rarely means today**, by construction: today needs `run + turnaround ≤ AnyTime.start`, and the
   migration sets start = earliest window start (e.g. 09:00). Acknowledged in FEATURE-HISTORY, but the
   wording "today included" in CLAUDE.md overstates it. Also ASAP picks one day at quote time; if that
   day's Any-time fills before the hold, the intent refuses (`slot_unavailable`) rather than trying the
   next day (`delivery-choice.ts:79-84`, `store.ts:393`).

6. **Re-timing into the window an order already holds counts its own booking** (`override.ts`
   `bindEffyWindow` → `slotLoad` includes the order's confirmed row). Known gap in FEATURE-HISTORY 085;
   checkout avoids it by deleting its own row first (`store.ts:378`), the staff path does not.

7. **Courier coverage depends on `public.locality` being complete.** `courier_reaches_postcode`
   returns `unknown_postcode` for any postcode not in `locality`, and adding a postcode to Effy's list
   also requires it. The committed dataset `db/reference/au-localities.csv` is an **18-line sample**
   (README: "not whole-of-Australia coverage"). Unless the full G-NAF file was loaded into dev by hand,
   courier delivery is refused almost everywhere. Not verifiable from the repo.

8. **Two "small basket" rules on different bases.** The cart minimum (`cart-policy`, refuses checkout)
   is judged on the item subtotal *before* promo (`service.ts:281`); the plan's small-order fee and
   free-delivery threshold are judged on the basket *after* promo (`basketValueCents`). Nothing ties the
   two together (e.g. a minimum above the small-order threshold makes the fee dead).

9. **The serviceability answer is CDN/browser-cacheable for 5 minutes** (`storefront/src/lib/cache.ts:22`)
   while staff edits are "live on save"; the address book and checkout read live. Brief disagreement is
   possible after a list change.

10. **Distance granularity is the postcode**, not the address (centroid of the most-addressed locality
    in the postcode). Large rural postcodes are priced on one point. Documented as a choice; worth
    knowing for the fee's distance bands.

### B. Dead or legacy code still around

- `ES/delivery/zone.ts:22 serviceableForPostcode` — no production caller.
- `ES/delivery/slots.ts:296 ownLiveHolds` (single-date) — superseded by `ownLiveHoldsByDate`, no caller.
- `ES/delivery/schedule.ts:21 lastOrderCutoff` — only a contract test references it; the comment at
  `lib/collection-deadline.ts:125` still says checkout uses it.
- `ES/delivery/plan.ts:5-12` — `METHOD_SAME_DAY/STANDARD` comment says they "stay until the checkout
  feature (E5) replaces same-day/standard"; E5 shipped; they are now the customer's words (fine) but the
  comment is stale.
- **Go-live machinery after the removal**: `delivery_model_v2_at` is `SELECT true`; `courier_delivery_state`
  still branches on it (`courier_pending` unreachable); `goLiveReadiness` (143 lines), the go-live
  page/route (refuses with 409 `removed`), and `deliveryModelSwitchSweep` still **run every 5 minutes**
  counting legacy orders that the removal migration guaranteed are zero, emitting metrics with alarms.
  `delivery_model_v2_from`, `legacy_orders_alert_days`, `legacy_model_removed_at` remain.
  `CourierReason` still carries `courier_pending`.
- **Write-only columns**: `order.delivery_quote` and `order.delivery_quote_expires_at` are written on
  every intent (`store.ts:408`) and read by no TS code (grep). `delivery_quote` holds every window fee
  offered (days × windows breakdowns) — sizeable JSON per order for no reader.
  `shop_fulfillment.promised_ready_at` is deliberately never set.
- Legacy names on live knobs: `standard_no_delivery_weekdays` (applies to all Effy days),
  `sameday_hub_turnaround_min`, `sameday_prep_buffer_min`, metric `StandardDateRefused`,
  `delivery_zone`/`delivery_zone_postcode` (a group and a list), `order_package_delivery.method`
  (customer word for Effy, routing word for courier).
- Docs: `docs/logistics-engine-architecture.md` and `docs/research/logistics/audit-00-current-system.md`
  self-declare as out of date (rings, `shop_sameday_exception`, Go core-api, "shops have no location",
  "no work model") — all superseded.

### C. Duplicated concepts

- **"Coverage" means two things**: postcode coverage (076, admin `/delivery/coverage`) and driver-
  clearance gaps (062, fleet `/fleet/v1/coverage`, `fleet/src/coverage/repository.ts`). Same word,
  different screens and services.
- **Settings are one row edited by three services**: admin (hub, prep buffer, collection runs; courier
  flags under `/coverage/courier`), fleet (days, hold, turnaround, lookahead, ASAP estimate, and 093's
  driver timings). `delivery_settings` now mixes customer-promise, pricing-adjacent, courier and
  driver-ops knobs.
- **Window calendar is assembled three times** with the same five reads (schedule, settings, calendar,
  slots, load): `quote()` (`quote.ts:243-256`), `override.ts windowsNow`, and `bindEffyWindow`; plus the
  fleet slots console. Each correctly calls the shared pure functions, but the I/O orchestration is
  copy-pasted; a `loadCalendar(q, now)` helper would remove it.
- **Hold vs judge** re-reads settings and schedule inside the lock (`store.ts:386-392`) — correct (fresh
  under lock) but a second load of what the quote just read.
- **Two "today" surcharges by design**: plan `today_premium_amount` + per-slot premium; plus the free
  threshold zeroes both. Clear in code; easy to misconfigure in the console.
- **`same_day`/`standard`** live on as both `order_package_delivery.method` and
  `shop_fulfillment.delivery_method` (a copy), plus `section` in the quote DTO, while who-delivers lives
  in `order.delivery_type` and `package_delivered_by`. Three representations of "when/who".

### D. Complexity hotspots / over-engineering

- `ES/delivery/override.ts` (832 lines) mixes move rules, compensation maths, refunds, points,
  driver-work removal, window binding, reads and DTO formatting. It is the largest file in the area and
  the riskiest to change.
- `ES/delivery/consignment.ts` (549) and `ES/payments/finalize.ts` (~380, 11 steps in one tx).
- `commerce/src/checkout/service.ts createIntent` — ~250 lines, 14 steps, 4+ transactions, 3 network
  calls to Stripe interleaved with DB writes.
- A quote is ~12 sequential round trips on the connection-limited `effy_shopper` pool
  (coverage, plan + 3 band reads, settings ×2, runs, non-delivery dates, slots, load, own holds,
  courier settings); the intent repeats it, re-reads settings under the lock, and a refusal triggers a
  *third* quote (`checkout-intent-v1-post.ts:95`).
- Heavy guard-test/invariant machinery (one-writer, one-reader, words, fixtures for Kotlin twins) —
  effective, but each concept now has a migration comment, a TS comment, a guard, a CLAUDE.md bullet
  and a FEATURE-HISTORY entry saying the same thing; comments in several files are already stale
  (see B).
- Schema churn: the delivery tables were created, dropped and recreated within a month, with eight
  intermediate tables since removed. Down migrations are mostly "refuse" or lossy.

### E. Missing or thin

- No allocation/sourcing: no multi-shop stock routing, no fallback shop, no substitution (by design of
  the product model, but worth stating plainly given "shops are hidden fulfilment nodes").
- No sweep of abandoned `pending_payment` orders (CLAUDE.md lists it as still ahead); holds lapse by
  time so capacity does not leak, but orders, points holds and stale intents accumulate.
- No customer notification for staff re-timing / moves beyond the order page (FEATURE-HISTORY 085).
- Collection runs have no weekday dimension; a non-delivery weekday is handled only on the customer
  calendar side.
- Capacity is per (window, date) only — no per-group/area or per-vehicle capacity in the customer
  promise.
- 085 is built but, per FEATURE-HISTORY, its second migration was not applied to dev and no container
  test ran; 079 and 083–085 are "not walked".
