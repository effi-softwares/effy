# 03 - Gap analysis: Effy's delivery system vs the industry

Date: 2026-10-18 · Inputs: [01-system-index.md](01-system-index.md) (and `maps/`),
[02-industry-research.md](02-industry-research.md).

Every finding has an ID; [04-backlog.md](04-backlog.md) refers to them. Evidence (file:line) is in the
maps. Findings marked **(verify)** were read from code but depend on data or provider behaviour that
can't be seen from the repo.

---

## 0. Verdict

**The shape is right. Effy has built the parts that are hard and has skipped the parts customers notice.**

- **Right:** one window per order, capacity, cutoffs and a short hold; one fee per order; hub and spoke with
  your own drivers plus a courier fallback; a scanned chain of custody. This is how Woolworths, Coles/Ocado,
  Kroger and Picnic work (02 §1). Effy's checkout promise is ahead of a typical MVP.
- **Behind:** everything after "out for delivery".
  - **Customer:** the customer is never told the van has left, is told "On the way" while a parcel sits at
    the hub for days, and hears nothing after a failed attempt.
  - **Driver:** stops are ordered by random UUIDs, not by where they are.
  - **Back-office:** staff can't see the proof photo, and a failed delivery has no recorded outcome.
  - **Industry baseline:** all of these are table stakes at the cheapest tier of every last-mile product (02 §15).
- **Unproven:** features 085 and 088–093 are built but not migrated, deployed or walked, and no delivery
  feature has a recorded end-to-end walk. Correctness is assumed from tests, not observed.
- **Heavy:** for fewer than 10 drivers and one hub the machinery is large:
  - a 5-minute planner with waves, standing exclusions, collector preference and sequence gates with waivers;
  - nine overlapping status notions for one package;
  - 7 settings tabs, one of them inert.

  The project's own architecture doc puts automation below the volume where it pays (map 2 §4.3).

**So the plan is:** fix the defects that lose money or lie to customers, finish and walk what's built, and add
the four missing table stakes (customer messages, honest tracking, failed-delivery outcome, route order).
Then simplify. Defer location, real-time ETA, carrier APIs, shifts and analytics until volume justifies them.

---

## 1. What we implemented wrong (defects)

### 1.1 Money and order integrity (checkout)
| ID | Defect | Impact |
|---|---|---|
| **W1** | A **superseded Stripe intent is not cancelled.** A new intent is made when the card amount changes, and `payment.stripe_payment_intent_id` is overwritten. If the old `clientSecret` is confirmed (stale tab or payment sheet), the webhook finds no order ("not one of ours") and acks it. Only the points-only path cancels (`commerce/src/checkout/service.ts:436`, `webhook/handler.ts:73`). **(verify against Stripe)** | Customer charged, order stays `pending_payment`, no alarm |
| **W2** | `createIntent` runs **4+ separate transactions**. A `slot_unavailable` refusal in the last one leaves the new amounts and lines next to the old delivery type, packages, booking and payment row | A paid order whose stored amounts can differ from what was charged (with W1) |
| **W3** | **Lock-order inversion**: the hold locks slot → order, payment locks order → slot | Rare deadlock; the webhook retries |
| **W4** | No sweep of abandoned `pending_payment` orders, held points or stale intents | Data and intents pile up (capacity is safe because holds lapse) |

### 1.2 Dispatch and custody (backend)
| ID | Defect | Impact |
|---|---|---|
| **W5** | Back-office **Unassign on a loaded delivery round** puts parcels that are physically in the van back in the pool; the next pass gives them to another driver (`fleet/src/dispatch/service.ts unassign`) | Two drivers "own" one parcel; the old driver's proof marks the stop done with no packages |
| **W6** | Dispatch reassign / unassign / reorder don't take `PLANNER_PASS_LOCK`, contrary to `driver-work.ts:13` | Races with the 5-minute pass |
| **W7** | `packageStatus` **ignores `package_hold`**: a missing parcel, and even one resolved `lost`, reads "At hub". Nothing downstream (refund, customer, shop) reacts to `lost` | Lost parcels look fine, and the customer is never refunded |
| **W8** | The planner **ignores vehicle status and compliance**: an off-road van keeps its driver eligible, rego/insurance/roadworthy expiry are never checked, and an unsafe daily check can be **bypassed by handing the van to another driver** | Unsafe or unregistered vehicles get work (WHS exposure) |
| **W9** | **Proof media is not verified**: any non-empty `mediaKey` is accepted, with no prefix, drop or existence check | "Delivered" without a photo |
| **W10** | Resolving an exception **throws away the staff note**, records no outcome, and the parcel is **silently re-planned** next pass. Audit rows put object ids in `driverId` | No record of what was decided; implicit redelivery |
| **W11** | `reportIssue` (`/issue`) bypasses locks; a not-available package is silently re-planned with no loop back to the shop | Repeated wasted collections |
| **W12** | `order_ready` push is sent **once per shop** with internal wording ("ready for handoff") | Leaks the hidden multi-shop split, which breaks a core product rule |
| **W13** | Customer stage comes from `shop_fulfillment.status` alone. It shows **"On the way / Out for delivery" from the moment a driver collects**, including days at the hub waiting for a later window and after a failed attempt. A partly cancelled order can stay "Confirmed" forever | Customers are told something false |
| **W14** | `order_out_for_delivery` has copy but **no producer**, yet the driver's load screen says "customers are told you're on the way" | A false promise in two places |
| **W15** | Collection-round feasibility (opens 45 min before the run; 12 min per stop) **caps a collection round at about 3 shops** per driver per run, which is invisible except as "cannot meet deadline" | Unassigned work with plenty of drivers |
| **W16** | Stops are ordered by status → seq → window → **zone UUID → shop UUID**. Ungrouped postcodes (most, since 076) aren't grouped at all | Drivers zig-zag; the industry's #1 cost lever is ignored |

### 1.3 Driver app
| ID | Defect | Impact |
|---|---|---|
| **W17** | **Going off duty while holding parcels always fails** because the app never sends `acknowledgeHeldPackages`. The 409 shows "Someone else just changed this". Sign-out swallows the error, so the driver **stays on duty and keeps being assigned work** | A core daily action is broken |
| **W18** | **The hub scan can never auto-finish after a short collection**: `ScanContexts.hub` expects packages left at the shop | Every short collection falls back to manual |
| **W19** | Offline "load then deliver" dead-ends at the door because the cached drop still says "not loaded"; runs and drops aren't persisted | The driver is stuck in poor reception, which is exactly when the offline queue matters |
| **W20** | The sync drain treats **any unnamed 409 as applied**, so real refusals disappear silently | Silent data loss |
| **W21** | Sign-out doesn't clear the offline queue, proof outbox or stop drafts, so on a **shared phone the next driver replays the last driver's writes** | Wrong-driver writes, lost proof |
| **W22** | Scan progress uses `remember` instead of `rememberSaveable`, so it is lost on rotation or process death | A half-scanned van is lost |

### 1.4 Consoles and customer
| ID | Defect |
|---|---|
| **W23** | DutyPanel always reads "Idle - nothing is assigned" (hard-coded, `DutyPanel.tsx:87`) |
| **W24** | Reassign lists only drivers who already hold a round today; idle on-duty drivers can't be chosen |
| **W25** | The reorder control shows "Stop 1, Stop 2…" with no address or order |
| **W26** | Shop-web Shipments says "Effy driver" on courier orders |
| **W27** | Raw enums and a raw Cognito sub on screen; browser-timezone timestamps on Exceptions; Found / Lost swallow errors and use `window.confirm` |
| **W28** | **"Standard" means two things at checkout**: the "Standard delivery" section and a tile titled "Standard" that is actually ASAP |

### 1.5 Engine logic that doesn't do what its docs say
| ID | Defect |
|---|---|
| **W29** | The "no windows" alarm and the **courier-when-no-windows fallback are unreachable**: the always-open, unlimited Any-time window makes `windowsUnavailable` return null |
| **W30** | **ASAP almost never means today**: the Any-time window starts at the earliest window start, which no collection run can reach that day. If its day fills between quote and intent, it refuses instead of trying the next day |
| **W31** | **Courier coverage depends on `public.locality`**, and the committed dataset is an 18-line sample. If dev wasn't loaded with full G-NAF, courier delivery is refused almost everywhere **(verify on dev)** |
| **W32** | The cart minimum is judged **before** promo, the small-order fee and free threshold **after**; nothing reconciles them |

---

## 2. What we are missing (vs industry table stakes)

Ranked by how much a customer, driver or ops person feels it. "TS" means table stakes in 02 §15.

| ID | Missing capability | Industry baseline | Priority |
|---|---|---|---|
| **M1** | **Customer delivery messages**: out for delivery (with window), failed attempt (with what happens next), delivered (with proof photo) | TS: every SaaS entry tier; Woolworths/Coles SMS (02 §6) | **Now** |
| **M2** | **Honest tracking states**: Scheduled for {day, window} → Out for delivery → Delivered / Attempted | TS | **Now** (fixes W13) |
| **M3** | **Failed-delivery outcome**: staff pick Redeliver (day/window) · Send by courier · Refund · Return to shop; attempt count; customer told; reason stored | TS (02 §7); Effy's legal text already promises "re-delivery, a replacement or a refund" | **Now** |
| **M4** | **Proof of delivery viewable in back-office** (photo, signature, time, driver) and on the customer's order | TS; the #1 dispute tool | **Now** |
| **M5** | **Geographic stop order**: at minimum sort drops by distance from the hub using the locality centroids already stored, then a hosted optimiser (Google Route Optimization ~$0–60/mo at Effy's volume) once addresses have coordinates | TS: route sequencing per driver (02 §5) | Now (simple) / Next (optimiser) |
| **M6** | **Directions-mode navigation hand-off** (`google.navigation:q=` / `maps.apple.com/?daddr=&dirflg=d`), Google / Waze / Apple choice | TS | **Now** (tiny) |
| **M7** | **Basic delivery KPIs**: on-time % vs window end, first-attempt success %, drops per hour, failed by reason, window fill. Replaces the placeholder dashboard | TS (02 §11) | Next |
| **M8** | **Anonymous postcode check** (guest) and earliest-window hint while browsing | Every AU grocer asks for an address first | Next |
| **M9** | **Address quality**: validate and geocode at address save (G-NAF or Google Address Validation); flag unresolvable addresses before they become failed drops | Failed drops cost ~$14–18 each (02 §7) | Next |
| **M10** | **Customer amend / cancel / reschedule before a cutoff** (change window, update instructions) | TS in AU grocery | Next |
| **M11** | **iOS push for drivers** | TS | Next (blocked on Apple account) |
| **M12** | **Driver location** (foreground during a round only), feeding the dispatcher map, ETA and geotagged proof | Differentiator; NSW Workplace Surveillance Act requires 14 days' notice | Later |
| **M13** | Live ETA / "N stops away" / customer tracking map | Differentiator | Later |
| **M14** | Masked customer contact / SMS "I'm outside" | Differentiator | Later |
| **M15** | Courier aggregator integration (Shippit / Sendle) for booking, labels and tracking webhooks | Differentiator; manual is fine at low volume | Later |
| **M16** | Shift roster, capacity forecast (drivers vs booked windows) | Nice-to-have at this size | Later |
| **M17** | Per-bag labels (chilled vs ambient), hub dwell-time limit for chilled (FSANZ ≤5 °C) | TS for grocery cold chain | Later (Next if selling chilled at volume) |
| **M18** | Age / ID check flow (only if selling alcohol: NSW same-day delivery rules) | TS if alcohol | Later / conditional |
| **M19** | Event backbone (the `order.placed` outbox is never drained) | Platform hygiene | Later |
| **M20** | Shop allocation / fallback shop when stock is short | Differentiator; by design not built | Later |

---

## 3. What we need to improve

| ID | Improve | How |
|---|---|---|
| **I1** | **Finish before extending**: migrate, deploy and walk 085 and 088–093 end to end on dev (shop → collect → hub → load → deliver / fail → return), and fix what the walk finds | The operator runs it; the backlog sequences it |
| **I2** | Make the driver app **route to the one next action** instead of dead-end screens ("Load the van first" on a drop should be a button to Load) | Today already knows the step (093's `runStage`) |
| **I3** | **Dispatch board as one view per window**: window → round → stops with progress, late flag and a link to each order. Order numbers are links everywhere | Merge Needs-a-driver / Windows / Rounds |
| **I4** | **Delivery settings on one page** in the order an operator thinks: Where (coverage, hub) · When (windows, days, collection runs, ASAP estimate) · Price · Courier · Drivers (thresholds, vehicle check) | Fold 7 tabs into about 5; drop Go-live |
| **I5** | The proof record: store recipient name for signatures and the device timestamp; verify the object exists (W9) | Small server change |
| **I6** | Persist run and drop reads offline; patch the cached drop on an offline load (W19) | App data layer |
| **I7** | Driver failed-attempt evidence: optional photo, "called customer" tick | DropScreen + `/fail` body |
| **I8** | Planner capacity: replace the hidden 3-shop cap with a feasibility rule that matches reality (collection feasibility from now / round opening with a configurable per-shop time) and show the reason clearly (W15) | `planner/assign.ts` |
| **I9** | Use the delivery type everywhere: `arrived` counts by `delivered_by`, not the legacy method | Small |
| **I10** | Test the things that broke: `SyncCoordinator`, Today states, hub accounting; one scripted end-to-end walk checklist per release | App tests + a runbook |

---

## 4. What we need to simplify

| ID | Simplify | Proposal |
|---|---|---|
| **S1** | **One package status, really.** Nine status notions exist; the customer's reads a different source from staff's | Derive the **customer stage from the same facts as `packageStatus`** (plus holds), with a fixed mapping. One function and one test |
| **S2** | **"Delivered" has four writers, `package_arrival` three** | One `markDelivered(source)` helper in `@effy/edge-shared/delivery`, guarded like the consignment writer |
| **S3** | **One word for a place group**: group / area / zone appear on screens | Use "area" in every UI and keep `delivery_zone` in SQL only |
| **S4** | **Window calendar loaded three times** (quote, override, bind) | One `loadCalendar(q, now)` |
| **S5** | `override.ts` (832 lines) mixes rules, money, points, driver work and DTOs | Split into rules / money / binding / read model with no behaviour change. Only when next touched |
| **S6** | **Sequence gates + waivers + holds + opening times + custody**: three control layers on every driver write | Keep the server gates (they protect custody) but **don't add more**. Show the driver one "next step" (I2) rather than explaining refusals |
| **S7** | **Planner machinery** (waves, standing exclusions, collector preference, keep-together, release) for fewer than 10 drivers | Freeze; no new planner features. If it gets in the way, collapse "waves" to a plain assignment log (`dispatch_wave.run_id` is always NULL anyway) |
| **S8** | `delivery_settings` edited by three services | One owner (admin) for writes, others read. Do it while doing I4 |
| **S9** | Comment volume (multi-paragraph defect histories in most functions) | New code: short comments, history in FEATURE-HISTORY. Trim when touching a file |
| **S10** | Three "where is this order?" screens (Orders, Assignments, Exceptions, Drivers readiness, Courier) | After I3, Orders = per-order truth and Dispatch = per-window truth; Readiness's "work nobody can cover" links to Dispatch |

---

## 5. What we should remove

| ID | Remove | Why it's safe |
|---|---|---|
| **R1** | Go-live machinery: the back-office Go-live tab, `admin/src/delivery/go-live.*` routes, the **5-minute `deliveryModelSwitchSweep`**, `goLiveReadiness`, the `courier_pending` branch and `delivery_model_v2_at` checks in SQL | The old model is gone; the sweep counts something guaranteed to be zero. Keep the `delivery_settings` record columns |
| **R2** | Dead backend code: `serviceableForPostcode`, `ownLiveHolds`, `lastOrderCutoff` (+ its contract test), the shop 020 pickup/deliver stubs, `round_package.state='failed'`, `driver_round.locked_by_sub/locked_at`, `dispatch_wave.run_id` | No production callers (map 1 §11B, map 2 §4.2) |
| **R3** | Write-only `order.delivery_quote` / `delivery_quote_expires_at` (sizeable JSON per order, no reader) | Grep shows no reader; drop the write first, the columns later |
| **R4** | Unused driver routes `/issue`, `/activity`, `/activity/read` | The app no longer calls them and 093 already broke compatibility (no installed drivers). **Check no installed build depends on them first** |
| **R5** | Driver-app dead code: `TodayViewModel.returnParcels`, `DeliveryViewModel.advance`, test-only `deliverContactless/WithPhoto/WithSignature` wrappers | Unused |
| **R6** | The **decorative schematic map** (`RunMapView.kt` ~455 lines plus `run-map.ts`): fake streets and suburb-centroid pins are not the house, and the redesign brief said no map | Replace later with a real ordered stop list or a proper map once M5 / M12 land. **Product call: keep if the operator likes it** |
| **R7** | The back-office **placeholder Dashboard** (sample data, metric cards forbidden by Principle V) | Replace with M7 or a plain landing list |
| **R8** | Stale docs, marked superseded rather than deleted: `docs/driver-app-review.md`, `docs/logistics-engine-architecture.md`, `docs/research/logistics/audit-00-current-system.md`, both console guides' removed sections | They contradict the code |
| **R9** | The `order_ready` customer push in its current form (W12) | Replaced by M1's single, order-level messages |

**Keep - these are right and should not be "simplified away":** one coverage function; one fee sum; one
window rule; the hold at intent; stale-quote 409s; delivery-type history; append-only override log;
idempotent `change_id` writes; offline queue; scan-or-tick per hand-over; Effy⇄courier emergency move; no
polling (live channel). The hub-and-spoke shape and window-based selling match the market; don't chase
under-one-hour delivery with your own fleet (02 §1.3: Milkrun, Getir and Gorillas). If rapid is wanted,
use Uber Direct or DoorDash Drive.

---

## 6. The changes we should make (decisions)

| # | Decision | Rationale |
|---|---|---|
| **D-1** | **Feature freeze on delivery until 085 and 088–093 are migrated, deployed and walked**, and the NOW backlog is done | Nothing in the delivery path has been observed working end to end |
| **D-2** | **Reverse "no geometry" partially**: allow **coordinates for addresses** (postcode centroid now, geocoded address next) and **stop sequencing** by them. Keep "no device location" for now | Route order is the industry's biggest cost lever, and Effy already stores centroids. The no-location guard should allow *address* coordinates, not *driver* positions |
| **D-3** | **Tell the customer three things**: out for delivery, attempt failed (and what happens next), delivered (with photo). Email + push now, SMS later | Table stakes. The copy already exists |
| **D-4** | **The customer stage derives from package facts** (S1), including "Scheduled for {day} {window}" and "Delivery attempt failed" | Stops the "On the way for three days" lie |
| **D-5** | **Failed delivery gets an explicit outcome** chosen by staff from Exceptions (redeliver / courier / refund / return to shop), built on the existing override functions; max 2 attempts, then refund or return | Matches the legal promise and industry practice; no implicit re-planning |
| **D-6** | **ASAP: make it honest or drop it.** Rename the tile so it isn't "Standard", and describe it as "Earliest available day" with the estimate. Don't imply today | W28 / W30 |
| **D-7** | **Buy, don't build**: routing (Google Route Optimization or Routific), address validation, SMS, and later one courier aggregator | 02 §16 |
| **D-8** | **Defer**: driver GPS (needs the NSW notice), live ETA, masked calls, rosters, carrier APIs, shop allocation, multi-hub, event backbone | Not needed for a *correct* service at current volume |
