# 01 - What we have built: the Effy delivery system, indexed

Date: 2026-10-18 · Code: `dev` @ `f9118e04` · Read-only review (nothing run against a database or device).

This is the overview. The four detailed maps under [`maps/`](maps/) carry every file, route, table and
line reference:

| Map | Covers |
|---|---|
| [maps/1-delivery-engine.md](maps/1-delivery-engine.md) | Coverage, fee engine, windows / capacity / ASAP, quote → intent → paid, courier services, consignments, Effy⇄courier override, legacy |
| [maps/2-driver-operations-backend.md](maps/2-driver-operations-backend.md) | Package lifecycle after payment, planner and assignment, rounds, hub, proof, failures, returns, holds, sequence gates, tables |
| [maps/3-driver-app.md](maps/3-driver-app.md) | The driver app's screens and the driver's day, offline, scanning, push, permissions |
| [maps/4-consoles-shop-customer.md](maps/4-consoles-shop-customer.md) | Back-office delivery / dispatch / drivers / exceptions, shop fulfilment, customer checkout and tracking |

---

## 1. Short answer: what is it?

Effy has built an **in-house, two-leg last-mile delivery platform** for one brand:

1. A **checkout promise engine**: coverage by postcode → one fee per order → one delivery window per
   order (today, a later day, a day with no time, or "as soon as possible"), with capacity, cutoffs and a
   10-minute hold. Out-of-area orders go to **courier delivery** at a flat-plus-weight fee.
2. **Middle mile (shops → hub):** shops pick and pack; on a fixed daily collection schedule a driver
   collects from shops and checks parcels in at **one hub**.
3. **Last mile (hub → customers):** per delivery window, on its day, parcels are put on a **delivery round**,
   loaded, delivered with photo or signature proof, or failed and returned to the hub.
4. A **courier lane**: courier parcels leave via the hub or by supplier pickup; consignments are recorded
   by staff (operator-entered courier services; no carrier API).
5. **Dispatch and back-office:** an automatic 5-minute assignment pass, manual assign / reassign /
   reorder, exceptions, driver and vehicle registers, clearances, emergency Effy⇄courier moves with
   compensation.
6. **Three driver-facing pieces**: a KMP driver app (Android + iOS), scanning with QR / Code 128 labels
   and Bluetooth scanners, an offline write queue.

What it deliberately does **not** have: any geometry. There is no geocoding of addresses, no route
optimisation, no ETA, no driver location and no live tracking (decisions D20–D22, D25).

Compared with an industry stack (see [02](02-industry-research.md) §15), the checkout promise and custody
chain are **ahead of** an MVP. Customer communication, failed-delivery handling, routing and ops
visibility are **behind** it.

---

## 2. The model in one picture

```
CUSTOMER                       PLATFORM (edge-api)                           PEOPLE / APPS
────────                       ───────────────────                           ─────────────
address ─▶ coverage_for_postcode ─▶ effy | courier | none
           (delivery_zone_postcode list; courier = on + fee table + default service)

cart ─▶ POST /commerce/v1/checkout/quote
           effyFee (base + distance band + weight band + window premium, ceil, clamp, free-over, small-order)
           effyDays/openWindows/judgeWindow (cutoff, collection reachable [today], capacity)
     ─▶ POST /commerce/v1/checkout/intent  (re-quote, 409 on mismatch, HOLD place 10 min, Stripe intent)
     ─▶ Stripe webhook → finalizeSucceeded (paid, shop_fulfillment per shop, booking confirmed, stock)

                                shop_fulfillment: pending → received → picking → ready_for_pickup      ◀── shop-web / shop-mobile
                                                                                │                        (labels EFY1:xxxxxx, 089)
                       fleet planner (every 5 min) ── collection round for the NEXT run ──┐
                                                                                         ▼
                                driver: collect at shop (scan) → collected → hub check-in   ◀── driver app
                                                                                         │
                       fleet planner ── delivery round per window, on its day ───────────┐
                                                                                         ▼
                                driver: load van → out_for_delivery → drop: proof → delivered
                                                               └─▶ fail → return to hub → staff resolve → re-planned
                       courier parcels: hub → carrier_handoff / supplier pickup → courier_consignment (staff-entered)
```

---

## 3. Inventory by capability

Legend: ✅ built and believed live in dev · 🟡 built, **not migrated / deployed / walked** · ⛔ absent.

### 3.1 Checkout promise (delivery engine) - map 1
| Capability | State | Where |
|---|---|---|
| Coverage: flat postcode list + optional groups; one SQL answer | ✅ | `public.coverage_for_postcode`, `shared/src/delivery/coverage.ts` |
| Courier eligibility (on, fee table, default service, not excluded, postcode known) | ✅ (⚠ `locality` data, see 03) | `courier_reaches_postcode`, `courier_delivery_state` |
| One fee per order, plans with draft/active/retired, simulator | ✅ | `shared/src/delivery/engine.ts`, `admin/src/delivery/pricing.*` |
| Windows: daily definitions, cutoff, capacity, non-delivery days, lookahead 3 | ✅ | `slots.ts judgeWindow`, `windows.ts` |
| "Any time" day and ASAP (085) | 🟡 | `delivery-choice.ts`, migration `20261013130000` |
| Hold at intent, confirm at payment, over-capacity flag | ✅ | `checkout/store.ts captureDelivery`, `payments/finalize.ts` |
| Stale-quote refusals (409 fee / type / window changed) | ✅ | `commerce/src/checkout/respond.ts` |
| Delivery type history, `delivery_promise` | ✅ | `delivery-type.ts` |
| Shop selection / stock-based allocation | ⛔ by design | fulfilling shop = `product.shop_id` |
| Abandoned pending-order sweep | ⛔ | listed as "still ahead" |

### 3.2 Middle mile and hub - map 2
| Capability | State | Where |
|---|---|---|
| Collection schedule (daily run times) | ✅ | `delivery_collection_run` |
| Latest run that still makes the window (`collectionRunFor`) | ✅ | `shared/src/lib/collection-deadline.ts` |
| Shop flow receive → pick → ready; can't supply | ✅ | `shop/src/fulfillments/` |
| Package labels (QR + Code 128, one per package) | 🟡 (089) | `apps/shop-web/.../labels/` |
| Collect at shop with per-package outcome | ✅ / 🟡 (093 body) | `driver/src/work/complete.ts` |
| Hub check-in + sort instruction (LOAD NOW / SHELVE / COURIER BAY) | 🟡 (090) | `driver/src/work/hub-sort.ts` |
| Hand-over records per step (scan / typed / manual) | 🟡 (090/091) | `package_handover`, `work/handover.ts` |
| Missing-package holds | 🟡 (093) | `package_hold` |

### 3.3 Dispatch and last mile - map 2
| Capability | State | Where |
|---|---|---|
| Automatic assignment pass every 5 min (gates, then fewest packages) | ✅ | `fleet/src/planner/` |
| Driver eligibility (duty, clearance, licence, vehicle, payload kg, chilled/frozen, deadline) | ✅ | `shared/src/lib/driver-eligibility.ts` |
| Rounds open at run time / window start minus 45 min | ✅ | `public.round_opens_at` |
| Manual assign / unassign / reassign / reorder / waive | ✅ | `fleet/src/dispatch/`, `fleet/src/assignments/` |
| Server-enforced order of work (093) | 🟡 | `driver/src/work/sequence.ts` |
| Load the van | 🟡 (093) | `driver/src/work/load.ts` |
| Stop ordering | ✅ but non-geographic | `round-ordering.ts` (status → seq → window → zone UUID → shop UUID) |
| Route optimisation, ETA, driver location, live tracking | ⛔ by decision | D20–D22 |
| Proof: photo, signature image, contactless photo | ✅ | `driver/src/proof/` |
| Failed delivery (5 reasons) → return to hub (088) | 🟡 | `parcel-return.ts`, `fleet/src/exceptions/` |
| Failed-delivery resolution with an outcome | ⛔ (resolve = timestamp; re-planned implicitly) | `exceptions/service.ts` |
| Vehicle register, holdings, daily check (off by default) | ✅ / 🟡 | `fleet/src/vehicles`, `holdings`, 093 |
| Driver register, Cognito provisioning, clearances by (function, area) | ✅ | `fleet/src/drivers`, `capabilities` |
| Shifts / roster | ⛔ (self-declared duty only) | `driver_duty_session` |

### 3.4 Courier lane - maps 1, 2
| Capability | State | Where |
|---|---|---|
| Courier services (operator-entered, one default) | ✅ | `courier_service` |
| Via hub or supplier pickup | ✅ | `order.courier_collection`, `consignment.ts` |
| Consignment record, events, label upload, one tracking link to customer | ✅ (manual) | `orders/src/consignments` |
| Carrier / aggregator API (booking, labels, tracking webhooks) | ⛔ | - |
| Effy⇄courier emergency move with compensation | ✅ | `shared/src/delivery/override.ts` |

### 3.5 Driver app - map 3
| Capability | State |
|---|---|
| Email + 6-digit sign-in, Today / History / Account tabs | ✅ |
| Duty toggle, vehicle check, collection, hub check-in, load, drops, failed, return | 🟡 (088–093 not walked) |
| Camera + Bluetooth scanning, typed code, manual fallback | 🟡 |
| Offline write queue, proof outbox, cached `/me` and `/today` | ✅ |
| Live updates (AppSync) | ✅ |
| Android push (FCM) | 🟡 (producers need 088–093 deploys) |
| iOS push | ⛔ (Apple Developer account) |
| GPS / location, turn-by-turn hand-off | ⛔ (navigation opens a search pin) |
| Map | Decorative schematic from postcode centroids |
| Customer contact | Direct dial of the real number |

### 3.6 Back-office - map 4
| Screen | What it does |
|---|---|
| Delivery (7 tabs) | Coverage, Pricing, Collection runs, Delivery windows, Delivery days (+ driver-ops thresholds, vehicle-check toggle), Settings (hub lat/lng, prep buffer), Go-live (inert) |
| Orders → Orders / Assignments / Courier | Order list with "Customer sees" and "Next step"; dispatch board = three tables (Needs a driver, Windows by day, Rounds); courier hand-over views |
| Order detail | Delivery type + move / re-time, packages with status, hand-overs, assign; fee breakdown; refunds. Proof photo **not viewable** |
| Drivers, Vehicles | Registers, duty panel, readiness, clearances |
| Exceptions | Failed deliveries, runs waiting, missing packages, vehicle checks |
| Dashboard | Placeholder sample data |

### 3.7 Shop and customer - map 4
| Surface | Delivery-related |
|---|---|
| shop-web | Fulfilment flow, labels, "Effy driver / Courier · ready by", supplier courier hand-over |
| shop-mobile | Same flow without labels; home screen is dummy data |
| customer-web / customer-mobile | Coverage per saved address (guests must sign in); one-window picker (Same-day / Standard / any time / ASAP / courier); fee lines; delivery instructions (leave at door / meet at door + note); tracker Confirmed → Packing → On the way → Delivered; courier link; cancel before preparation |
| Notifications | `order_paid`, `order_ready` (per shop ⚠), `order_with_courier`, `order_delivery_changed`, `order_delivered` (push + email). `order_out_for_delivery` has copy, **no producer**. No SMS. |

---

## 4. Size and shape (for orientation)

- **Backend:** 12 services under `apis/edge-api`; delivery logic concentrated in `shared/src/delivery/`
  (~30 files), `fleet/src/` (planner ~1,500 lines), `driver/src/`, `orders/src/`, `commerce/src/checkout/`.
- **Database:** 82 Goose migrations; ~35 delivery / dispatch tables (map 1 §8, map 2 §2). The delivery tables
  were created, dropped and recreated within a month; eight intermediate tables have come and gone.
- **Guard tests:** delivery behaviour is held by "one writer / one reader / one wording" guards plus
  container tests (driver 224, fleet 328 per FEATURE-HISTORY 093).
- **Driver app:** ~121 common Kotlin files (~14k lines), ~185 tests, no UI or device tests.
- **Deployment state:** features 085 and 088–093 are recorded as built but not migrated, deployed or
  walked; the records contradict each other in places (map 2 §4.6). **No feature on the delivery path has
  a recorded end-to-end walk.**

## 5. Concept glossary (one meaning each)

| Word in code | Means |
|---|---|
| package / `shop_fulfillment` | One shop's share of an order: the unit that is picked, labelled, carried |
| drop / `round_stop` customer_drop | One order's delivery stop on a round |
| round / run / `driver_round` | One driver's piece of work: collection (shops → hub) or delivery (hub → customers) |
| wave / `dispatch_wave` | One planner pass that assigned something (now effectively a log) |
| window / slot / `delivery_slot` | A daily delivery time range with cutoff and capacity; "Any time" is the special untimed one |
| group / area / zone / `delivery_zone` | The same thing: an optional group of postcodes, used for driver clearances |
| `same_day` / `standard` | For an Effy package: window today / later day. For a courier package: routing word |
| delivery type | Who delivers: `effy` or `courier` |
| delivery promise | What was sold: `window`, `day` or `asap` |
| hold (two meanings) | A slot hold at checkout (`delivery_slot_booking.held`), or a missing-package hold (`package_hold`) |
