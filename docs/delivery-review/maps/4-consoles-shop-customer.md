# Map 4 — Delivery/dispatch UI outside the driver app

Scope: back-office (ops/dispatch), shop-web + shop-mobile (fulfilment), customer-web + customer-mobile
(delivery choice, tracking). Read-only survey, 2026-10-18, branch `dev` @ f9118e04.
All paths relative to `/Users/janith/Projects/effy`.

---

## 1. Back-office (`apps/back-office`, Vite SPA, staff gateway)

### 1.1 Navigation and where delivery lives
`apps/back-office/src/components/layout/nav.ts` — left nav: Dashboard · Shops · Orders · Customers ·
Catalog · Product review · Promotions · **Delivery** · **Drivers** · **Vehicles** · **Exceptions** ·
**Deliverability** · Feedback · Admin. No role gate on any delivery item; mutations are admin/manager
in-screen and server-side (csa = read-only).

- There is **no "Dispatch" nav item**. `routes/dispatch.tsx` redirects `/dispatch` →
  `/orders/assignments` (073 moved it into Orders as a tab).
- **"Deliverability" is EMAIL deliverability** (bounced mail addresses; `/admin/v1/deliverability`,
  `features/deliverability/*`), not delivery. It sits right under "Exceptions" in a delivery cluster.
- **Dashboard (`routes/app.tsx:107` `DashboardScreen`) is a placeholder**: four metric cards all "—"
  ("Illustrative until wired", incl. "Delivery events (24h)") and a "Shops by region" bar chart of
  `SAMPLE_SHOPS` ("Sample data — not live operations"). It is the landing page and shows nothing real.
- Live updates: `features/live/routes.ts` maps live kinds → query keys (`orders`, `dispatch` →
  dispatch+drivers+exceptions, `slots`, `coverage`, `pricing`, …). No timers.

### 1.2 Delivery (configuration) — `/delivery`
`features/delivery/DeliveryScreen.tsx` — 7 URL-addressed tabs:
**Coverage · Pricing · Collection runs · Delivery windows · Delivery days · Settings · Go-live**.
Routes (all `features/delivery/repo.ts`): `/admin/v1/delivery/*` (coverage, plans, settings,
collection-runs, courier, courier-services, go-live) and `/fleet/v1/delivery-slots`, `/fleet/v1/delivery-days`.

| Tab | Files | What an ops person sees / does |
|---|---|---|
| Coverage | `coverage/CoveragePanel.tsx`, `AddPlacesDialog.tsx`, `DistanceDialog.tsx`, `GroupsPanel.tsx`, `PostcodeChecker.tsx`, `CourierPanel.tsx`, `CourierServicesPanel.tsx` | Flat postcode list (postcode/places, group, distance from hub worked-out vs by hand, "Review" tag). Add places by suburb name (pulls in every place sharing the postcode); hand-enter distance; remove postcode; groups (create/rename/remove/move rows; "N drivers can deliver here" warning). "Check a postcode or place" explainer for CSAs. Courier: switch "Offer courier delivery" (locked until fee table + default service), exclusions with reason, "offer courier when no window" switch, default collection mode (via hub / supplier pickup). Courier services CRUD (name, customer timeframe, late threshold, pickup days + cutoff, collects-from-suppliers, default). |
| Pricing | `pricing/PricingPanel.tsx`, `PlanEditor.tsx`, `ActivateDialog.tsx`, `FeeSimulator.tsx`, `GapList.tsx`, `gapText.ts`, `planDraft.ts` | Effy + courier fee plans: drafts / one active / retired. Editor: amounts, distance bands, weight bands, basket rules (free-delivery, small-order), window surcharges incl. "Delivery today". Plain-word gap list; Activate retires predecessor atomically ($0 floor needs confirmation). Simulator: postcode × weight × basket × window → customer lines + build steps. |
| Collection runs | `DeliveryScreen.tsx:SchedulePanel` | List of HH:MM run times + label; add / remove. No days-of-week, no per-shop runs, no capacity. |
| Delivery windows | `components/SlotsPanel.tsx` | Windows table: Window, Order by, Delivery limit, **Booked today + one column per lookahead day**, Status; create/edit dialog (start, end, cutoff, optional capacity). No delete (switch off). The "any time" window lives here too (hours/limit only). File header still says "Same-day delivery slots (069 US5)". |
| Delivery days | `components/DeliveryDaysPanel.tsx` | "Days offered after today" (lookahead), the **ASAP estimate** ("'Standard' delivery tile — the timeframe customers are shown"), no-delivery weekdays, hub turnaround, hold minutes, **driver-ops thresholds** ("Tell dispatch when a van isn't loaded after…", "…collected parcels aren't checked in after…"), **"Drivers check their vehicle before taking work"** toggle (093), closed dates (warns how many placed orders carry that date; does not change them). |
| Settings | `DeliveryScreen.tsx:SettingsPanel` | Hub latitude/longitude typed as raw decimals (no map/geocoder), "Shop prep buffer (minutes)" (wire field still `samedayPrepBufferMin`). Moving hub reports recalculated / flagged distances. |
| Go-live | `golive/GoLivePanel.tsx`, `SwitchControl.tsx`, `ReadinessTable.tsx`, `LegacyOrders.tsx` | The 083 switch: readiness checklist, schedule/turn back, legacy orders still open, history. Since removal the server answers 409 `removed` for everything — the tab is now a historical record but still a top-level tab. |

### 1.3 Orders — `/orders`, `/orders/assignments`, `/orders/handover`
`features/orders/OrdersTabs.tsx` — three link-tabs: **Orders · Assignments · Courier**.

**Order list** — `features/orders/OrdersListScreen.tsx` → `GET /orders/v1/orders`.
Columns: Order, Customer (email), Placed, Status, Delivery (Effy/Courier/—), Driver, **Customer sees**
(Confirmed/Packing/On the way/Delivered), **Next step**, Total. Filters: work queue (All, Needs a driver,
Needs a refund decision, Courier problem, Needs handover, Awaiting arrival), delivery type + promise
(window/day/asap, legacy). Search by order ref or email. No filter by date/window/area/driver.

**Order detail** — `features/orders/OrderDetailScreen.tsx` → `GET /orders/v1/orders/{id}`. Sections:
- Customer.
- **Delivery type** (`components/DeliveryTypeSection.tsx`): Delivered by, Why, "Customer was told"
  (courier estimate / ASAP sentence), "Sold as" (window/day/asap). Buttons (admin/manager, only while
  `order.status === "paid"`): **Change day or time…** (`ChangeDeliveryWindowDialog.tsx` →
  `POST /orders/v1/orders/{id}/delivery-window`), **Send by courier…** (`SendByCourierDialog.tsx`,
  preview `GET …/delivery-move?to=courier`, confirm `POST …/delivery-move` with compensation choice),
  **Deliver by Effy…** (`DeliverByEffyDialog.tsx`). Move history (`DeliveryHistory.tsx`), courier
  collection mode switch (`CourierCollection.tsx` → `PUT …/courier-collection`), delivery-type history
  table whose actor column prints the raw **Cognito sub** in mono (`DeliveryTypeSection.tsx` ~l.111).
- **Packages** (`components/PackageRows.tsx`): per package: shop, `PackageStatusPill` (nine words),
  089 package code, 091 hand-over list (scan/typed/manual), **Collect** and **Deliver** assignment lines
  (`AssignmentLine.tsx`) with **Assign to… / Unassign** (`features/assign/AssignmentActions.tsx`,
  `AssignSheet.tsx` → `GET /fleet/v1/dispatch/packages/{id}/drivers?stage=`, `POST …/assign|unassign`;
  drivers grouped Can take it / with a concern / Can't take it + reason). Promised, Hand over by, Handed
  over (carrier/ref form), Arrived + "Recorded: By an Effy driver, with proof / By back-office /
  Reported by the carrier". Courier consignment block (`ConsignmentBlock.tsx`: book, label upload,
  progress events In transit/Delivered/Failed/Lost/Damaged/Returned, Resolved, Cancel booking).
- Items, Payment, **"How the delivery fee was built"** (`FeeBreakdown.tsx`), Delivering to +
  `DeliveryInstructions.tsx` (handover preference + note), Billing, **Refunds** (`RefundsSection.tsx`,
  `RefundPanel.tsx` — items or goodwill, decline customer request), History.
- ⚠ The proof **photo is never viewable**: "with proof" is text only; no link to the image (presigned
  read exists server-side). `RefundsSection.tsx:105` placeholder even says "e.g. the delivery photo
  shows all six cartons".

**Assignments (the dispatch board)** — `features/dispatch/DispatchDayScreen.tsx` →
`GET /fleet/v1/dispatch/day`, `GET /fleet/v1/dispatch/windows?date=`. Top to bottom:
1. Failed-deliveries line (088): "N still with drivers · N back at the hub, waiting for a decision" → link to Exceptions.
2. **Needs a driver** (`components/UnassignedPanel.tsx`): package rows — order number, shop, reason
   sentence (`model.ts REASON_TEXT`: not on duty, licence expired, no vehicle, not cleared, no
   refrigeration, over capacity, cannot meet deadline, vehicle check due/unsafe), "At the shop · next
   collection 2 pm" / "At the hub · deliver by …", area, "Late for its run", Assign to….
3. **Delivery windows** (`components/WindowsByDay.tsx`): day buttons (today + days on sale); per window a
   table: order number, status pill, area, "Late for its run" / "Needs cold storage"; caption says who
   holds the round or "Planned on the day".
4. **Rounds** (`components/RoundTable.tsx`): Driver (link), Work (Collection/Delivery), Stops left,
   Packages left, Opens, Due, State (093 stage label e.g. "Out 4 of 9", + "Late").

**Round detail** — `features/dispatch/RoundDetailScreen.tsx` → `GET /fleet/v1/dispatch/rounds/{id}`.
Header: kind, stage label, "Worked out of order", waiver, opens/due. Actions (admin/manager):
**Reassign** (`ReassignDialog.tsx` → `POST …/reassign`), **Let this run go ahead** (waive sequence,
`WaiveSequenceButton.tsx` → `POST …/waive-sequence`), **reorder stops / Take this round back**
(`ReorderControl.tsx` → `POST …/reorder`, `POST …/unassign`). Stops list: label, order number, hand-over
counts, window + Due now/Late, zone, raw stop status.

**Courier tab** — `features/orders/CourierScreen.tsx` → `GET /orders/v1/handovers?view=` — five views:
At the hub · Late at the hub · Supplier pickups · With the courier · Problems (service, where it is, due).

### 1.4 Drivers — `/drivers`, `/drivers/$id`
`features/drivers/*` → `/fleet/v1/drivers*`, `/fleet/v1/duty`, `/fleet/v1/readiness`, `/fleet/v1/coverage`.
- List (`DriversListScreen.tsx`): **On duty now** (`components/DutyPanel.tsx`: name, area, time on duty,
  expected finish, "Past their expected finish", "Shift running long" + **End duty session**; "Nobody is
  on duty, and N packages are waiting" banner), **Readiness** (`ReadinessPanel.tsx`: drivers who cannot
  be given work, work nobody can cover, licences/registrations to renew), Register table with search,
  clearance summary, Add driver (`CreateDriverDialog.tsx`, provisions Cognito sign-in).
- Detail (`DriverDetailScreen.tsx`): profile edit, identity & contact, work assignment (vehicle, licence),
  employment status (`StatusControl.tsx`), **Cleared for** (`CapabilityEditor.tsx`: collection/delivery ×
  everywhere/area), change history. Comment at ~l.161: "Reports from the road" and "Work history" were
  removed with the 049 work model and **never rebuilt** — no per-driver performance, rounds, or failures.
- "Drivers go on duty from the driver app; back-office cannot do it for them" — **no shift scheduling /
  roster**; duty is self-declared.

### 1.5 Vehicles — `/vehicles`
`features/vehicles/*` → `/fleet/v1/vehicles*`. List: Plate, Vehicle, Carries (temperature), Owner,
With (holder), Status. Detail: edit, status, issue/return holding (`HoldingControl.tsx`), holding history.
Vehicle-check failures appear on Exceptions, not here.

### 1.6 Exceptions — `/exceptions`
`features/exceptions/ExceptionsScreen.tsx`, `SequenceSections.tsx`, `RecordReturnDialog.tsx` →
`/fleet/v1/exceptions`, `…/resolve`, `/fleet/v1/dispatch/rounds/{id}/return`, `/fleet/v1/held-packages/{id}/resolve`,
`/fleet/v1/vehicle-checks/{id}/clear`.
- Failed deliveries table: Order, Reason (+driver note), Driver, Destination suburb, Package (with
  driver / at hub), When, action: **Record return** (still in van) or **Mark dealt with** (sends
  `note: null`, no outcome).
- 093 sections: Runs waiting on their next step (van not loaded / not checked in), Packages declared
  missing (**Found — plan again** / **Lost** via `window.confirm`), Vehicle checks today (clear with note).

### 1.7 Shops — `/shops`
`features/shops/*`: register, status, users, stock; the only delivery fact is the shop **address**
("No address recorded — a driver cannot be sent here", `ShopDetailScreen.tsx:111-127`). No per-shop
collection schedule, opening hours, coordinates or pickup instructions.

### 1.8 What ops CAN'T see or do (back-office)
- **No map anywhere** — no live map, no driver location, no route view, no stop geography. grep for
  latitude/leaflet/maplibre/geolocation in back-office/shop-web/customer-web finds only the hub lat/lng
  form fields.
- **No ETAs**: rounds show "Due" (deadline) and Late (derived), never a predicted arrival per stop.
- **No live operations dashboard / KPIs** (on-time %, failed-delivery rate, window utilisation, driver
  utilisation, collections late). The Dashboard is sample data.
- No shift planning, no capacity forecast for tomorrow's windows vs drivers on roster.
- No driver ↔ customer contact log, no call/SMS from console.
- No re-delivery workflow: a failed parcel "back at the hub, waiting for a decision" has no decision
  buttons on Exceptions; staff must find the order (order number is **not a link**) and use
  "Change day or time…", "Send by courier…" or a refund.

---

## 2. Shop console (`apps/shop-web`, Vite SPA; `apps/shop-mobile`)

### 2.1 shop-web fulfilment
Routes (`features/fulfillment/repo.ts`, `features/today/repo.ts`): `GET /shop/v1/fulfillments?state=`,
`GET /shop/v1/fulfillments/{id}`, `POST …/{id}/status`, `POST …/{id}/courier-handover`,
`GET /shop/v1/orders[/{id}]`, `/activity`, `/tags`, `/notes`, `/picks`, `POST /shop/v1/orders/{id}/refunds`,
`GET /shop/v1/today`, `/team-activity`, `/pick-lists`.

Flow (`features/fulfillment/model.ts`, `components/StateControl.tsx`):
`pending → received` (opening the order IS the acknowledgement) → **Start picking** → per-line pick
(`components/ItemsAndFulfilment.tsx`: Picked in full / partial / unavailable) → **Mark ready for pickup**
(one permitted reversal) → `collected` (driver scan; shop does nothing) → `delivered`.
Side paths: "Can't supply" declaration with required reason (`canDeclareUnfulfillable`; Effy decides
refund), refund proposals, notes & tags, bulk actions (`BulkActions.tsx`), export, filters.

What a shop sees about delivery (`OrderDetailScreen.tsx:195-245`):
- "**Effy driver** / **Courier** · ready by {time}" (`deliveredByText`, `readyBy` = collection deadline).
- 089 package code; **Print labels** (`components/PrintLabels.tsx`, `labels/labels.ts`, `code128.ts`):
  QR + Code 128, three layouts (62 mm roll default, remembered in localStorage), EFFY/COURIER mark, no
  shop name. One label per package, `copies = 1`.
- Courier supplier pickup (`components/CourierPickup.tsx`): courier · service, pickup window, reference,
  "Open label to print", **Handed over to courier** button.
- Customer: recipient name + phone; **Ship to** full address; Bill to withheld.
- Today screen (`features/today/TodayScreen.tsx`, `NeedsAttention.tsx`, `LiveOrders.tsx`,
  `TodayGlance.tsx`): needs-attention list, live orders with ready-by, backlog, print all pick lists.

### 2.2 shop-mobile
`apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/orders/*`
(`OrdersScreen.kt` 828 lines, `OrdersViewModel.kt`, `HttpOrderRepository.kt`, `DeliveredByWords.kt`,
`CourierPickupWords.kt`): queue, pick, ready, courier hand-over. **No label printing / package code**.
Home dashboard is `DummyHomeDashboardRepository.kt` (placeholder data).

### 2.3 Shop observations
- **Shipments block hard-codes "Effy driver"** (`components/ItemsAndFulfilment.tsx` `Shipments`, ~l.396)
  even on a courier order, and counts `ready_for_pickup` as "handed over".
- No "packed / bag count / temperature split": one code per package, so a two-bag (chilled + ambient)
  package prints identical labels; a scanner cannot tell bags apart or detect a missing bag.
- Shop is not told **who** is coming or **when** beyond "ready by"; no driver ETA / "driver arriving"
  signal, no collection confirmation receipt for the shop beyond the status flip.
- "Items from other shops" total row on the shop's order (`ItemsAndFulfilment.tsx` ~l.114) — fine
  internally, but worth noting given the hidden-node model.
- Label parity gap shop-web vs shop-mobile (089 web-only), contrary to the "two surfaces at parity" rule.

---

## 3. Customer (`apps/customer-web` Next.js; `apps/customer-mobile` KMP)

### 3.1 Address & coverage
- Header bar `components/chrome/DeliveryBar.tsx`: signed-in → "Delivering to {label · suburb postcode} —
  Delivered by Effy / Courier delivery / refusal sentence"; **guest → "Sign in to see who delivers to your
  address"**. No anonymous postcode check anywhere (an orphan comment in `app/(shop)/page.tsx:90`
  "Client island: shown only when the shopper's postcode is outside a serviced zone" has no component).
- Address book `app/(account)/addresses/*` with `_components/CoverageNote.tsx` (Delivered by Effy /
  Courier delivery / `COVERAGE_REFUSAL_SENTENCE`). Product page `app/(shop)/_components/ProductDeliveryNote.tsx`
  repeats the default address's coverage. Mobile: `features/addresses/presentation/AddressBookScreen.kt`,
  `AddressFormSheet.kt`.
- Coverage is per saved address only; nothing shows "earliest delivery: today 5–7 pm" while browsing.

### 3.2 Checkout
`app/checkout/CheckoutFlow.tsx` (713 lines), steps `Delivery → Payment → Done`
(`_components/CheckoutSteps.tsx`). Routes: `POST /commerce/v1/checkout/quote`, `POST /commerce/v1/checkout/intent`.
- `AddressPicker.tsx` (saved addresses, add new; changing address invalidates the quote).
- `EffyWindowOptions.tsx` — one radio group for the whole order: **"Same-day delivery"** (today's
  windows, "Order by …", per-window fee) and **"Standard delivery"** (next N days; a day alone is a
  complete choice = "Any time during the day"; first tile **"Standard" = ASAP** with the business
  estimate; "Need a specific time?" opens that day's windows; "Choose a time for this day." when untimed
  room is full). Words from `packages/shared-types/src/delivery.ts DELIVERY_WINDOW_WORDS` + `effy-windows.ts`.
- `CourierDelivery.tsx` — courier estimate sentence + "Courier delivery fee"; also the fallback when no
  window is left (if enabled).
- Fee: `components/delivery/DeliveryFeeLines.tsx`, `FreeDeliveryHint.tsx` (lines: Delivery, Window
  surcharge, Small-order fee, Free delivery).
- `DeliveryInstructions.tsx` — handover preference (`leave_at_door` / `meet_at_door`) + note ("Gate code,
  which door, where to leave it"), optional save as address default.
- 409 handling: `delivery_type_changed`, `delivery_fee_changed`, `slot_unavailable`/`slot_required`/
  `date_unavailable`/`no_windows_available` → re-quote and ask again (`CheckoutFlow.tsx:363-386, 683+`).
- Mobile twin: `features/checkout/presentation/CheckoutScreen.kt`, `CheckoutViewModel.kt`,
  `EffyWindowsView.kt`, `DeliveryWindowWords.kt`, `DeliveryTypeWords.kt`, `DeliveryFeeWords.kt`.

### 3.3 Order tracking
- Web: `app/(account)/orders/[id]/page.tsx` → `GET /commerce/v1/orders/{id}`; `components/receipt/ArrivalPanel.tsx`
  + `ProgressTrack.tsx`; `components/live/LiveRefresh.tsx` re-reads on live update.
  Shows: who delivers; the sold window / "Any time during the day" / "Standard — As soon as possible —
  {estimate}" / courier partner + estimate + **one "Track your parcel" link or "by email"**; "We've
  changed this order to courier…" note with compensation; 4-step tracker **Confirmed → Packing →
  On the way ("Out for delivery") → Delivered**; receipt; refund block; "Something wrong?" → request
  refund; cancel (until a shop starts preparing).
- Mobile: `features/checkout/presentation/OrdersScreen.kt` (Ongoing/Completed, "Track order" button when
  on the way), `ReceiptScreen.kt` (`OrderTracker`: Confirmed / **Being packed** / On the way / Delivered).
- Stage is server-derived (`apis/edge-api/shared/src/lib/order-completion.ts stageFor`: least-advanced
  package). No failed / attempted / rescheduled stage exists.
- Push (`apis/edge-api/notifications/src/worker/copy.ts`): `order_paid`, `order_ready`,
  `order_with_courier`, `order_delivery_changed`, `order_delivered` (+email). `order_out_for_delivery`
  has copy and a DB check value but **no producer** (grep: only `copy.ts`, `email-sender.ts`, migrations).
- No: driver name/photo, live map, ETA countdown, "N stops away", contact driver, proof-of-delivery
  photo, rating/tip, customer-side reschedule or "change instructions after ordering". Commerce routes
  for orders are only list/detail/cancel/refund-requests (`apis/edge-api/commerce/serverless.yml:522-558`).

---

## 4. Observations

### 4.1 Gaps vs Uber Eats / DoorDash / Instacart / Onfleet / Amazon
**Dispatcher / ops**
1. **No map, no driver location, no ETA.** Onfleet/DoorDash Drive's core is a live map with driver dots,
   route polylines and per-task ETAs; Effy's dispatcher works from tables and a derived "Late" flag
   (`RoundTable.tsx`, `RoundDetailScreen.tsx`). Nothing tells ops a driver is 40 min behind until the
   window closes.
2. **No route optimisation UI.** Reorder is ↑/↓ swaps (`ReorderControl.tsx`), and the reorder list shows
   only "Stop 1, Stop 2…" — **no address or order on the rows being moved** (it is a second list,
   separate from the labelled stops list below it). A dispatcher cannot tell what they are reordering.
3. **No ops dashboard/KPIs** (on-time rate, first-attempt success, window fill, late collections, driver
   utilisation). Dashboard is placeholder sample data (`routes/app.tsx:107-140`) and uses the metric cards
   Principle V forbids.
4. **No re-delivery / failed-delivery resolution flow.** Exceptions offers "Record return" and
   "Mark dealt with" (no outcome; `note: null`). Amazon/Instacart offer redeliver tomorrow / refund /
   return-to-store / customer reschedule. The legal text the customer app ships already promises
   "re-delivery, a replacement, or a refund" (`customer-mobile/.../legal/generated/LegalContent.kt:839,849`).
5. **No shift/roster planning.** Drivers self-declare duty; back-office cannot schedule, forecast
   capacity vs tomorrow's booked windows, or put someone on duty (`DutyPanel.tsx`).
6. **No per-driver performance** — "Reports from the road" / "Work history" were deleted and never
   rebuilt (`DriverDetailScreen.tsx` ~l.161 comment).
7. **Proof of delivery not viewable** by CSAs (`PackageRows.tsx:207` text only) — the #1 tool for "I
   never got it" disputes at every competitor.
8. No bulk actions on dispatch (assign a window's parcels to one driver, move a window to another day,
   close a window for weather), and no "today vs tomorrow capacity" heatmap beyond the Booked columns.

**Shop**
9. No "driver arriving in N min" / who is collecting; no handover receipt; no bag count or per-bag
   labels (temperature split); shop-mobile can't print labels.

**Customer**
10. **No anonymous postcode check** — a guest must sign in and save an address to learn whether Effy
    delivers (`DeliveryBar.tsx GuestDeliveryBar`). Every competitor asks for an address first.
11. **No earliest-slot promise while browsing** ("Delivery today 5–7 pm") — the window is first seen at checkout.
12. **Tracking is 4 coarse steps**, no ETA, no driver, no map, no "you're next", no push when the van
    actually leaves (out_for_delivery push never produced), no failed-attempt message (stage stays
    "On the way"), no self-service reschedule, no post-order instruction edit, no rating/tip.

### 4.2 Bugs and inconsistencies found
- **DutyPanel always says "Idle — nothing is assigned"** for every on-duty driver — a hard-coded string
  (`features/drivers/components/DutyPanel.tsx:87`), regardless of rounds they hold.
- **Reassign can only pick drivers who already hold a round today**: `RoundDetailScreen.tsx` builds the
  picker from `day.rounds` (`drivers = (day.data?.rounds ?? []).map(...)`). A freshly on-duty idle driver
  is not in the list; and the current holder's name falls back to "This driver" if they have no round in
  the day view. The per-package "Assign to…" sheet uses a proper server list — two different driver
  pickers with different populations.
- **"On the way · Out for delivery" is shown as soon as a package leaves the shop**, including while it
  waits at the hub for a later-day window (`ProgressTrack.tsx:22`, mobile `ReceiptScreen.kt` OrderTracker;
  order console guide: "On the way = with a driver, at the hub, or with a carrier"). For a day-3 window
  the customer reads "Out for delivery" for days — the exact unearned claim 053 avoided for "Packing".
- **`order_ready` push leaks split orders and uses internal jargon**: enqueued per fulfilment with dedupe
  `order_ready:<sub>:<fulfilment id>` (`apis/edge-api/shop/src/fulfillments/repository.ts:390-404`), body
  "Your order is ready for handoff." A two-shop order sends two pushes, contradicting the
  `customerViewChanged` rule (`order-completion.ts`) that a split must look like a single order — and
  the order page at that moment still says "Packing".
- `order_out_for_delivery` copy exists, no producer.
- Shop-web Shipments block says "Effy driver" for courier orders (`ItemsAndFulfilment.tsx` ~l.396).
- Exceptions / SequenceSections timestamps use `toLocaleString()` (browser zone, not Melbourne) while
  the rest of the console formats in Australia/Melbourne (`ExceptionsScreen.tsx:120`, `model.ts:27`,
  `SequenceSections.tsx:16`).
- Held-package "Found — plan again" / "Lost" swallow errors (`.catch(() => undefined)`,
  `SequenceSections.tsx:97,105`) and "Lost" uses `window.confirm` — no feedback on failure, and no prompt
  to refund the customer for a lost package.
- Raw enums on screen: round stop status `{s.status}` (e.g. `out_for_delivery`, `en_route`) in
  `RoundDetailScreen.tsx`, and `round.status.replace("_", " ")` replaces only the first underscore —
  both bypass the "nine words via STATUS_WORD" rule.
- Delivery-type history shows a raw Cognito `sub` as the actor (`DeliveryTypeSection.tsx` ~l.111) where
  other screens show staff names.
- Order numbers on Exceptions, Needs a driver and Delivery windows are plain text, not links to the order.
- Stale words: `SlotsPanel.tsx` header "Same-day delivery slots"; settings field `samedayPrepBufferMin`;
  `CheckoutFlow.tsx` header comment still describes per-package selections and `excludedPackageKeys`;
  orphan guest-postcode comment in `app/(shop)/page.tsx:90`.
- Both operator guides are flagged "PARTLY OUT OF DATE (083)" and still document removed tabs (Same-day
  tab, carrier lead time, "Hand over by", ring/zone tiers) — `docs/delivery-console-guide.md`,
  `docs/order-console-guide.md`. Guide calls the courier view "Due at the hub"; UI says "At the hub".
- Wording drift customer-side: web badge "Being packed" vs web tracker "Packing" vs mobile "Being packed";
  `ArrivalPanel.tsx methodLabel` keeps a local "Same-day / Scheduled / Standard" map outside the shared
  wording files.

### 4.3 Complexity and confusing concepts
- **One place name, four words**: coverage *group*, driver clearance *area*, dispatch "No area" / round
  stop and duty "No zone", DB `delivery_zone`. An operator meets all four.
- **"Standard" means two things at checkout**: the section heading "Standard delivery" (later days) and
  the tile titled "Standard" that is actually ASAP (`DELIVERY_WINDOW_WORDS.asapTitle`). Back-office
  labels the ASAP estimate field "'Standard' delivery tile". Plus the "Any time" window, which staff edit
  among windows but customers never see as a window.
- **Settings are scattered**: driver-ops thresholds and the vehicle-check toggle live under
  Delivery → *Delivery days*; prep buffer under *Settings*; collection runs on their own tab; lookahead and
  ASAP estimate on *Delivery days*; courier default collection mode on *Coverage*; courier fee on
  *Pricing*. Seven tabs for one model, one of them (Go-live) now permanently inert.
- **Overlapping "where is it?" screens**: Orders list (Next step, Driver, Customer sees), Assignments
  (Needs a driver, Delivery windows, Rounds), Exceptions (failed, sequence, missing, vehicle), Drivers
  (on duty, readiness, "work nobody can cover"), Courier tab. "Work nobody can cover" (Drivers) vs
  "Needs a driver" (Assignments) vs "Needs a driver" filter (Orders) are three views of a similar fact.
  The dispatch board lives under *Orders* while Exceptions, Drivers and Vehicles are separate nav items.
- "Deliverability" (email) beside "Exceptions"/"Delivery" in the nav reads like a delivery feature.
- Assignments shows *rounds* (opens/due), *windows* (by day) and *unassigned packages* as three
  disconnected lists; nothing ties a window to the round's progress through its stops in one view.
- Many states derived differently per audience (nine package words for staff, four stages for
  customers, "ready for pickup / collected" for shops, stage labels "Out 4 of 9" for runs). Correct by
  design, but CSAs have to translate between "Customer sees" and package status by hand on every call.

### 4.4 What is genuinely strong
- Fee transparency end to end (simulator, per-order breakdown, "fee changed" refusal).
- Unassigned work always comes with a human reason and an explicit empty state.
- Emergency Effy⇄courier move with previewed compensation and append-only history.
- No polling; live kinds re-read the right screens.
- Hidden-fulfilment discipline mostly holds on the customer side (no package counts, one tracking link)
  — the `order_ready` push is the notable leak.
