# Map 2 - Driver operations / dispatch / fulfilment backend (after payment)

Read-only map of `/Users/janith/Projects/effy`, verified against code on 2026-10-18 (branch `dev`, HEAD `f9118e04`).
Paths are relative to `apis/edge-api/` unless they start with `db/`, `docs/` or `apps/`. I checked the docs (`docs/logistics-engine-architecture.md`,
`docs/research/logistics/audit-00`, `decisions-01`, and FEATURE-HISTORY 063/072/073/088–093) against the source. Where a doc and the code disagree, I say so.

**One-line model:** a paid order fans out into one `shop_fulfillment` row per shop (the "package"). The shop moves it to
`ready_for_pickup`. A **5-minute scheduled planner** (`fleet`) puts it on a **collection round** for the *next* collection
run. The driver collects it (`collected`) and checks it in at the hub (`hub_checkin` row). The next pass puts Effy parcels
whose day has come on a **delivery round** for their window. The driver loads the van (`out_for_delivery`), then either
records proof (`delivered`, `package_arrival`) or a failure (stop `skipped`). A failed parcel is then returned to the hub
(`parcel_return`) and waits for staff. Courier parcels leave through `carrier_handoff` / `courier_consignment` instead.
There is **no geometry anywhere**: no geocoding, no distances, no ETA, no live location. This was decided on purpose (decisions D20–D22, D25).

---

## 1. End-to-end lifecycle (state machine)

### 1.1 The state lives in many places (no single state column)

| Fact | Where | Values |
|---|---|---|
| Shop's lifecycle of the package | `shop_fulfillment.status` | `pending → received → picking → ready_for_pickup → collected → delivered`, plus terminal `unfulfillable` (needs reason) and `withdrawn` (cancellation). CHECK widened 4× (`db/migrations/20260829162928_refunds_cancellation.sql:200`) |
| Assignment of a package to a stop | `round_package.state` | `assigned → picked_up / not_available` (collection); `assigned → delivered / failed / returned` (delivery). **`failed` is never written by any code** (see §4) |
| Stop progress | `round_stop.status` | `pending, out_for_delivery, en_route, arrived, done, skipped` (`20260930173242_round_stop_in_transit_states.sql`) |
| Round | `driver_round.status` | `planned → in_progress → completed / cancelled` |
| At hub | **existence of** `hub_checkin` row for the collection round | - |
| Delivered | `package_arrival` row (unique per package; `source` driver_proof / staff_recorded / carrier_signal) and `shop_fulfillment.status='delivered'` | - |
| Failed attempt | `delivery_attempt_failure` (unresolved = `resolved_at IS NULL`) | reasons nobody_home, wrong_address, customer_refused, access_blocked, other |
| Returned to hub | `round_package.state='returned'` + `parcel_return` row | - |
| Missing / held (093) | `package_hold` (open, or resolved `lost`) | step load/checkin; reasons not_at_hub, damaged, wrong_temperature, not_in_van, other |
| Courier | `carrier_handoff`, `courier_consignment(.state)`, `courier_consignment_event` | consignment state incl. failed/lost/damaged/returned |
| Derived word shown to staff and shop | `packageStatus()` in `shared/src/status/status.ts:60` over `PACKAGE_STATUS_FACTS` (`shared/src/status/sql.ts:10`) | Preparing · Ready · With driver · At hub · Out for delivery · With carrier · Delivered · Problem · Cancelled |
| Derived word shown to the customer | `stageFor()` in `shared/src/lib/order-completion.ts:121` - the **least advanced** `shop_fulfillment.status` | confirmed · packing · on_the_way · delivered |
| Derived run stage (093) | `stageOfRound()` / `ROUND_STAGE_LATERAL` in `shared/src/delivery/round-stage.ts` → `runStage` in shared-types | - |

### 1.2 Happy path: an Effy-delivered package

```
[order paid] ──(019 finalize tx, shared/src/payments/finalize.ts)──▶ shop_fulfillment(pending) + event_outbox(order.placed, never drained)
   │
   │ shop opens it (implicit) → received
   │ POST /shop/v1/fulfillments/{id}/status {picking|ready_for_pickup|unfulfillable}
   │   shop/src/fulfillments/service.ts:44 transition(); allowed map shop/src/fulfillments/types.ts:87-95
   │   on → ready_for_pickup: enqueues customer push 'order_ready' (shop/src/fulfillments/repository.ts:391-405)
   ▼
shop_fulfillment = ready_for_pickup           packageStatus → "Ready"
   │
   │ fleet plan-waves-scheduled (rate 5 min) → planner/service.ts:89 runPass()
   │   GATHER_COLLECTION (fleet/src/planner/sql.ts) : status=ready_for_pickup, not held, courier_collection<>'supplier',
   │   no open 'assigned' row; filtered to parcels due on the NEXT run (service.ts:153-174, collectionRunFor)
   │   planWave (planner/assign.ts:57) → commitWave (planner/repository.ts:247)
   │   INSERT driver_round(kind=collection, deadline_at=run instant) + round_stop(shop_pickup per shop) +
   │   round_package(assigned) + round_stop(hub_checkin); push 'run_assigned'
   ▼
round_package(collection)=assigned            packageStatus → "Ready" (driver name shown in Orders)
   │
   │ round opens at public.round_opens_at = run_time − planning_lead_min (45)
   │ (db/migrations/20261007065255_immediate_driver_assignment.sql:26); before that every driver write → 409 round_not_open
   │ POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect   driver/src/work/complete.ts:41 collectStop
   │   gates: assertRoundOpen, assertNoDeliveriesOpen (093)
   │   per NAMED package: round_package → picked_up | not_available(+note)
   │   picked_up ⇒ shop_fulfillment ready_for_pickup → collected (complete.ts:~95)
   │   stop → done only when nothing named is left (remaining=0); round planned → in_progress
   │   package_handover(step=collect, scan/typed/manual) via work/handover.ts
   ▼
shop_fulfillment = collected, rp=picked_up    packageStatus → "With driver"; customer stage → "on_the_way" (!)
   │
   │ POST /driver/v1/hub/checkin   complete.ts:167 hubCheckin
   │   gates: assertRoundOpen, assertStopsSettled (093); optional `missing[]` → package_hold(checkin, not_in_van)
   │   INSERT hub_checkin(expected, arrived); hub stop done; round → completed
   │   returns effyGroups by day/window, courierCount, next courier pickup label
   ▼
hub_checkin exists                            packageStatus → "At hub"
   │
   │ next pass: GATHER_DELIVERY : collection rp=picked_up + hub_checkin, delivered_by='effy',
   │   window_start ≤ end of today (082), sf.status='collected', not held, no open 'assigned',
   │   not (returned AND unresolved failure)
   │   groupByWindow → deadline = window end (or end of day if passed) → planWave → commitWave
   │   INSERT driver_round(kind=delivery, deadline_at, window_start_at) + round_stop(customer_drop per ORDER) + round_package(assigned)
   ▼
round_package(delivery)=assigned, stop=pending  packageStatus → "At hub"
   │
   │ round opens at window_start − 45 min (NULL window_start ⇒ open now)
   │ POST /driver/v1/delivery/runs/{runId}/load   driver/src/work/load.ts:35 loadRun
   │   gates: assertRoundOpen, assertNothingToHandIn (no unchecked-in collections, no unreturned failures; waivable)
   │   notLoaded[] → package_hold(load) + removeAssignment; all pending drops → out_for_delivery; round → in_progress
   ▼
stop=out_for_delivery                         packageStatus → "Out for delivery"
   │ POST /driver/v1/delivery/drops/{dropId}/status {en_route|arrived}   work/delivery.ts setDropStatus (forward-only)
   │ POST .../proof/presign → S3 presigned PUT under proof/ ; POST .../proof   driver/src/proof/repository.ts:71 recordProof
   │   delivery_proof(photo|signature|contactless; 'code' refused) ; rp → delivered ; sf → delivered ;
   │   package_arrival(source=driver_proof) ; stop → done ; completeDeliveryRoundIfFinished ;
   │   enqueueOrderDeliveredIfComplete (shared/src/lib/order-completion.ts:68 → 'order_delivered' push + email)
   ▼
DELIVERED                                     packageStatus → "Delivered"; customer stage "delivered" once ALL packages are delivered
```

### 1.3 Failure → return → staff path (088)

```
stop out_for_delivery/en_route/arrived
  │ POST /driver/v1/delivery/drops/{dropId}/fail   proof/repository.ts:173 recordFailure
  │   delivery_attempt_failure ; stop → skipped ; rp stays 'assigned'  (nothing to the customer)
  ▼
"to return" = TO_RETURN_SQL (shared/src/delivery/parcel-return.ts): delivery rp assigned on a skipped stop, no arrival
  packageStatus → "Problem - Delivery attempt failed - <reason>" (with driver); custody counts it; the round cannot complete
  │ POST /driver/v1/delivery/runs/{runId}/return  OR  POST /fleet/v1/dispatch/rounds/{roundId}/return (staff)
  │   recordParcelReturn: parcel_return row ; rp → returned ; round may complete
  ▼
packageStatus → "At hub - Returned after a failed delivery - needs a next step"
  GATHER_DELIVERY skips it while the failure is unresolved
  │ staff: POST /fleet/v1/exceptions/{id}/resolve (just sets resolved_at)  OR  orders delivery-move / delivery-window
  │   (override.ts moveToCourier/moveToEffy/changeEffyWindow resolve the open failures themselves)
  ▼
next pass re-gathers it automatically → a new delivery round (end-of-day deadline if its window has passed)
```

### 1.4 Other branches

| Branch | Trigger and code | Result |
|---|---|---|
| Not available at shop | collect with outcome `not_available`, or `POST .../stops/{stopId}/issue` (`complete.ts:357 reportIssue`) | rp `not_available`; sf stays `ready_for_pickup` ⇒ "Problem - Not collected at the shop" until the **next pass re-assigns it automatically** (the gather excludes only `assigned` rows) |
| Shop can't supply | shop → `unfulfillable` (reason required) | "Problem - Shop can't supply"; refund proposal flow (055) |
| Cancelled | platform cancellation writes `withdrawn` | "Cancelled" |
| Missing at load | `notLoaded[]` on load | `package_hold(load)`; removed from the round; held out of both gathers until dispatch says `found` (re-planned) or `lost` (never planned again) - `POST /fleet/v1/held-packages/{holdId}/resolve` |
| Missing at check-in | `missing[]` on check-in | `package_hold(checkin,not_in_van)`; excluded from the arrived count |
| Driver goes off duty or is stood down | `planner/release.ts releaseUnworkable` (first step of each pass) | uncollected `assigned` rows deleted, planned rounds cancelled, push `run_changed`/`run_withdrawn`; **a delivery round in progress is never touched**; `picked_up` goods are never released. Off duty itself is refused while holding goods (`driver/src/driver/service.ts HoldingPackagesError`) |
| Collection run deleted | `release.ts` checks planned collection rounds against the schedule | released `run_removed` |
| Courier via hub | collected and checked in like Effy; GATHER_DELIVERY excludes it (delivered_by='courier') | staff/shop `POST /orders/v1/fulfillments/{id}/handoff` → `consignment.ts handOver` → `carrier_handoff`, sf → collected (if not already), push `order_with_courier`; consignment events → `recordConsignmentStep` writes `package_arrival(carrier_signal…)` + `delivered` |
| Courier pickup from supplier | `order.courier_collection='supplier'` → never in GATHER_COLLECTION | shop `POST /shop/v1/fulfillments/{id}/courier-handover` → consignment.ts |
| Staff-recorded arrival | `POST /orders/v1/fulfillments/{id}/arrival` (`orders/src/arrival/repository.ts`) | only for `collected` + `carrier_handoff`; `package_arrival(staff_recorded)` |
| Back-office override (081) | `POST /orders/v1/orders/{orderId}/delivery-move`, `.../delivery-window` → `shared/src/delivery/override.ts` | moves the order Effy↔courier or re-times it; uses `removeAssignment` |

### 1.5 Writers per transition (where to look)

| Write | Writers |
|---|---|
| `shop_fulfillment.status → collected` | `driver/src/work/complete.ts` collectStop; `shared/src/delivery/consignment.ts:284` handOver; shop dev stub `collectViaStub` (`shop/src/fulfillments/repository.ts`, no route registered) |
| `→ delivered` | `driver/src/proof/sql.ts MARK_FULFILLMENT_DELIVERED`; `orders/src/arrival/repository.ts`; `consignment.ts:379`; shop stub `deliverViaStub` |
| `package_arrival` INSERT | `driver/src/proof/sql.ts:97`; `orders/src/arrival/repository.ts`; `consignment.ts:374` - **three writers**, even though CLAUDE.md implies consignment.ts is the one path |
| `round_package` INSERT | only `planner/repository.ts commitWave` (also used by manual Assign) |
| `round_package` DELETE | `driver-work.ts removeAssignment` (load, unassign-package, override); `planner/sql.ts RELEASE_ASSIGNED`; **`fleet/src/dispatch/service.ts unassign` deletes directly** (a second path) |
| `driver_round.status → completed` | hubCheckin; `completeDeliveryRoundIfFinished`; migration `20261016120000` one-off backfill |
| `→ cancelled` | removeAssignment, release.ts, dispatch unassign |

---

## 2. Tables (driver ops / dispatch), key columns

| Table | Migration | Key columns / constraints |
|---|---|---|
| `shop_fulfillment` | 019 `20260719120000`, widened 020/047/055/089 | `order_id, shop_id` UNIQUE; `status`; `state_changed_at` (ready_since); `delivery_method` (legacy routing word); `unfulfillable_reason`; `package_code` 6-char UNIQUE default `new_package_code()` (089) |
| `fulfillment_item`, `fulfillment_event` | `20260720093119` | the shop's pick progress and audit trail |
| `order_package_delivery` | 047 | per (order, shop): `method`, `slot_id`, `window_start`, `window_end` (069/078) - what the planner reads for windows |
| `delivery_collection_run` | 047 | `run_time` (Melbourne wall clock) UNIQUE, `status` active/disabled - **the collection schedule** |
| `delivery_settings` (singleton id=1) | many | hub lat/lng; `sameday_prep_buffer_min`; `sameday_hub_turnaround_min` (used by collectionRunFor); `standard_no_delivery_weekdays`; `planning_lead_min` 45; `per_stop_allowance_min` 12; `load_overdue_min` 20; `checkin_overdue_min` 30; `vehicle_check_required` false (093) |
| `driver` | `20260822120000` + 056 + fleet | `status` active/suspended/offboarded, licence_expires_on, licence_class, contact |
| `driver_duty_session` | 049/056 | one open per driver; `expected_end_at` (nullable; feeds the feasibility gate); location columns dropped (D22) |
| `vehicle`, `vehicle_holding` | `20260920143000` | vehicle: body_type, payload_kg, load_volume_litres, crate_capacity, can_carry_chilled/frozen, rego/insurance/roadworthy expiry, status active/off_road/retired. Holding: one open per vehicle and per driver, odometer start/end |
| `driver_zone_capability` | `20260920190000` (method column dropped 083) | (driver, function collection/delivery, zone_id NULL = everywhere) |
| `dispatch_wave` | `20260921120151` | one row per pass **that assigned something**; `run_id` (always NULL in practice), counts |
| `driver_round` | same + 072/073 | wave_id, driver_id, kind, status, deadline_at, window_start_at (072), changed_note, `locked_by_sub/locked_at` (**unused since 073**), updated_at (optimistic lock at microseconds) |
| `round_stop` | same | round_id, seq (dispatcher order), kind shop_pickup/customer_drop/hub_checkin, shop_id / order_id, zone_id, status, completed_at |
| `round_package` | same + 072/088 | stop_id, shop_fulfillment_id, state, note, assigned_note, assigned_by_sub, settled_at, return_id; **partial UNIQUE (shop_fulfillment_id) WHERE state='assigned'** = exclusivity |
| `hub_checkin` | same | UNIQUE round_id; packages_expected/arrived |
| `assignment_exclusion` | same, reshaped 072 | standing reasons per (package, kind, driver, reason); rewritten only when changed |
| `delivery_proof` | `20260921215440` | UNIQUE stop_id, UNIQUE change_id; method photo/signature/contactless; media_key required for photo/signature |
| `delivery_attempt_failure` | same | stop_id, reason, note (required for other), resolved_at, change_id UNIQUE |
| `carrier_handoff`, `package_arrival` | 053 `20260826232728` | both UNIQUE per package |
| `courier_service`, `courier_consignment(_event)`, `order_courier_collection_change` | 080 `20261009051347` | - |
| `delivery_override`, `order_delivery_type_change` | 081 / 079 | append-only |
| `parcel_return` | 088 `20261016140000` | round_id, driver_id, recorded_by driver/staff, package_count, change_id UNIQUE |
| `package_handover` | 090 `20261016160000` | package, round, driver, step collect/checkin/load/deliver/return, handover_method scan/typed/manual |
| `package_hold`, `round_sequence_waiver`, `vehicle_check` | **093 `20261017100000` - NOT MIGRATED** | hold: one open per package, resolution found/lost; waiver: PK round_id; check: one per (driver, vehicle, local_date), answers jsonb, unsafe/minor, cleared_* |
| `notification_request` | 050 + `20261016130000` | types incl. order_ready, order_out_for_delivery, order_delivered, order_with_courier, run_assigned/changed/withdrawn/opens_soon |
| `event_outbox` | 019 | `order.placed` written, **never drained** (no SNS publisher exists) |

SQL functions: `round_opens_at(kind, deadline, window_start)`, `package_delivered_by(type, method, slot)`,
`courier_parcel_collection(type, mode)`, `new_package_code()`, `coverage_for_postcode`, `courier_reaches_postcode`.

**Events / SNS:** none on this path. Dispatch is coordinated through (a) the 5-minute DB-polling pass, (b) the `notification_request`
outbox drained by the `notifications` worker (push/email), and (c) AppSync "kind-only" live announcements after commit
(`fleet/src/lib/live.ts announceDispatch`, `driver/src/work/announce.ts`, `@effy/edge-shared/live`). The SNS/SQS fan-out in CLAUDE.md is not built yet.

---

## 3. Sub-areas

### 3.1 Planner (wave planning and the assignment pass) - `fleet/src/planner/`
- **Trigger:** `plan-waves-scheduled` on `rate(5 minutes)` (`fleet/serverless.yml:427-439`). `runPass()` is one transaction under
  `pg_try_advisory_xact_lock(72063001)`; a second concurrent pass skips. Order of work: release → collection → delivery →
  standing exclusions → `enqueueRoundsOpeningSoon` (push 15 min before a round opens) → after commit, announce. It also emits EMF
  `Effy/Dispatch` metrics: DispatchPackagesAssigned/Unassigned/Released, **DispatchUnassignedPastOpening** (the one alarm), DispatchParcelsCollectLate,
  DriverPackagesHeldHours; and announces newly overdue runs (`sequence/service.ts overdueCrossedSince`).
- **Collection:** plans only against `nextRunInstant(runs, now)`. Each Effy parcel with a window is due on
  `collectionRunFor(windowStart, runs, hubTurnaroundMin, calendar)` (`shared/src/lib/collection-deadline.ts`), which gives the latest run
  that still reaches the hub in time, walking back over no-delivery days. A parcel due later than the next run is skipped. One due earlier is
  counted as `collectLate`. Parcels with no window (courier, legacy) go on the next run.
- **Delivery:** only parcels whose window day is today. `groupByWindow` → one bucket per (window_start, window_end). Deadline = window end, or
  end of day once that has passed (`planner/windows.ts:48`).
- **Assignment algorithm** (`planner/assign.ts planWave`, oldest-ready first):
  1. If an existing round in the bucket already visits this stop (same shop, or same order), add it there ("keep together").
  2. Otherwise compute hard gates for every candidate: `eligibilityReasons` (`shared/src/lib/driver-eligibility.ts`):
     not_employable, not_on_duty, licence_expired, no_vehicle, not_cleared (function × zone; NULL zone = all), vehicle_check_due /
     vehicle_unsafe (093), no_refrigeration, over_capacity (**payload_kg only**; volume and crates ignored), cannot_meet_deadline
     (`startAt + stops × per_stop_allowance_min > deadline` or > shift end).
  3. Delivery: prefer the driver who collected it (093 "trips join up").
  4. Otherwise `pickByLoad`: fewest packages assigned **today** (counted), tie broken by driver UUID.
  5. Nobody fits → unassigned plus standing exclusion reasons. No reasons at all → `driverId NULL, not_on_duty`.
- **First come, first served:** assigned work is never rebalanced. One `planned` round per driver per bucket. A delivery round in progress is
  never added to; a collection round in progress can gain packages at shops not yet visited (with `changed_note`).
- **Hidden capacity cap:** a planned round's feasibility starts at `opensAt` = deadline − 45 min. With 12 min/stop, a collection round holds
  at most **3 shops** per driver per run. FEATURE-HISTORY 072 acknowledges this. A delivery round for a 2-hour window holds about 13 drops.
- **Routes:** `GET /fleet/v1/readiness`, `GET /fleet/v1/coverage`, `GET /fleet/v1/dispatch/day`, `/dispatch/windows`, `/dispatch/rounds/{id}`,
  `POST /dispatch/rounds/{id}/reassign|unassign|reorder|return|waive-sequence`, `GET /dispatch/packages/{packageId}/drivers`,
  `POST /dispatch/packages/{packageId}/assign|unassign` (manual Assign uses the planner's own `planWave` + `commitWave`; a person may override
  "concern" reasons but not "cannot"), `GET /fleet/v1/custody`, `GET /fleet/v1/exceptions`, `POST /exceptions/{id}/resolve`,
  `POST /held-packages/{holdId}/resolve`, `POST /vehicle-checks/{checkId}/clear`. All are on the **staff** gateway.
- **Guards:** `planner/no-location.guard.test.ts` (no distance or nearest-driver logic; `run-map.ts` is the only point reader),
  `planner.container.test.ts`, `fleet/src/driver-method.guard.test.ts` (driver work asks `package_delivered_by`, never a method),
  `change-map.guard.test.ts` (writes must announce).

### 3.2 Route ordering - `shared/src/lib/round-ordering.ts orderRoundStops`
There is **no route optimisation**. Stops are sorted by status rank (pending first, then in transit, then done, then skipped) → dispatcher
`seq` if set → due time (window start) → `zone_id` → `shop_id` → id. Zones and shops sort by **UUID**, so "grouped by zone" means adjacent
but in an arbitrary order across zones. Since 076 most postcodes may have no zone (`zone_id` NULL), and those all sort last together.
Manual reorder: `POST /fleet/v1/dispatch/rounds/{id}/reorder`. Navigation hands one stop's address string to the phone's maps app.
`driver/src/work/run-map.ts` draws a decorative schematic from postcode centroids (`locality`), for display only (D25).

### 3.3 Driver execution service - `driver/src/` (shared gateway)
Routes (`driver/serverless.yml`): `GET /driver/v1/today`, `/collection/runs/{runId}`, `/collection/runs/{runId}/stops/{stopId}`,
`/delivery/runs/{runId}`, `/delivery/drops/{dropId}`, `/history`, `/history/{kind}/{id}`, `/activity`, `/me`, `/live`;
`POST /collection/runs/{runId}/stops/{stopId}/collect`, `.../issue`, `/hub/checkin`, `/delivery/runs/{runId}/load`,
`/delivery/drops/{dropId}/status`, `.../proof/presign`, `.../proof`, `.../fail`, `/delivery/runs/{runId}/return`,
`/duty`, `/vehicle-check`, `/activity/read` (**a no-op by design**), `/devices`, `DELETE /devices/{token}`.
- **Gates** (all 409): `round_not_open` (`work/open.ts`, `open.guard.test.ts`); 093's sequence gates in `work/sequence.ts`:
  `stops_outstanding` (check-in before every shop is settled), `run_not_loaded` (drop action before load),
  `finish_collection_first` / `return_parcels_first` (load while holding goods; a dispatcher can waive per run),
  `finish_deliveries_first` (collect while drops are in the van). Held by `sequence.guard.test.ts`.
- **Idempotency:** `change_id` UNIQUE on proof, failure, parcel_return, vehicle_check, holds and handovers. Status writes are forward-only.
- **Hand-over records (090/091):** `work/handover.ts recordHandovers` inside collect / checkin / load / deliver / return. The method is
  client-asserted (scan/typed/manual) and optional. Read by orders (per package), fleet readRound (per stop), and admin shop detail (30-day scan rate).
- **Hub sort (090):** `work/hub-sort.ts` labels each collected package LOAD NOW / SHELVE / COURIER BAY.
- **Duty:** `POST /driver/v1/duty` opens or closes `driver_duty_session` with an optional `expected_end_at`. Going off is refused while holding goods (custody SQL `shared/src/lib/custody.ts`).
- **Vehicle check (093):** six items, `vehicle_check` one per driver+vehicle per day, unsafe ⇒ ineligible until staff clear it. **Off by default.**

### 3.4 Proof of delivery - `driver/src/proof/`
- Methods: **photo** (needs media), **signature** (needs media, a drawn image), **contactless** (needs a photo). `code` (OTP/PIN) is
  explicitly refused: "no delivery code is issued for an order". D16's attended-PIN design is not built.
- Upload: presigned S3 PUT under `proof/` (`presignUpload(PROOF_MEDIA_PREFIX, dropId, …)`); archival lifecycle in `infra/envs/dev/media.tf:81+` (`proof-prefix.guard.test.ts`).
- What is recorded: method, media_key, note, driver, `captured_at`, one proof per stop (whole order, not per package). No device GPS or timestamp, no
  recipient name, no age check, no photo-at-location metadata.
- Read back: driver history detail (presigned GET); back-office order view.

### 3.5 Failed delivery, return, exceptions - 064/088 + `fleet/src/exceptions/`
- Failure reasons are fixed (5). Failure ⇒ stop `skipped`; the parcel stays with the driver ("to return") until `parcel_return`.
- Exceptions list (`fleet/src/exceptions/sql.ts LIST_EXCEPTIONS`) shows package location with_driver/at_hub, plus held packages, overdue runs
  and today's vehicle checks (093).
- **Resolve** only stamps `resolved_at`. There is no outcome (redeliver, refund, return to shop, call customer) and the **note is not stored**
  (only `noteProvided` in the audit). The next pass then re-plans the parcel automatically: **the redelivery is implicit**.
- No attempt counter, no maximum attempts, no return-to-shop/RTS flow, and **no customer notification on a failed attempt**.

### 3.6 Shop side - `shop/src/fulfillments/`
- `POST /shop/v1/fulfillments/{id}/status` (picking | ready_for_pickup | unfulfillable), `PATCH .../items/{orderItemId}` (pick progress),
  `GET /shop/v1/pick-lists`, `POST /shop/v1/orders/{id}/picks`, `POST /shop/v1/fulfillments/{id}/courier-handover` (supplier pickup → consignment.ts).
- One permitted reversal: ready_for_pickup → picking (even while the package is on a collection round; nothing removes the assignment).
- Labels (089) are rendered **client-side** in `apps/shop-web/src/features/fulfillment/labels/` (Code 128 encoder + QR, token `EFY1:<code>`, EFFY/COURIER only).
- Shops are told "Effy driver" / "Courier" only (`scripts/check-shop-delivery-words.sh`).
- Schedules on shop: insights rollups (`rate(1 minute)`, cron 17:30), attention evaluator `rate(5 minutes)`.
- **Dead code:** `fulfillment-pickup-v1-post.ts` / `fulfillment-deliver-v1-post.ts` + `collectViaStub` / `deliverViaStub` (020 dev stub, deliberately unrouted).
  Its own removal trigger ("when the driver slice ships a real dispatch path") has been met since 063.

### 3.7 Orders service (back-office, staff gateway) - `orders/src/`
`GET /orders/v1/orders`, `/orders/{id}` (package status via `packageStatuses`, handovers 091), `GET /orders/v1/handovers`,
`POST /orders/v1/fulfillments/{id}/handoff` (carrier handoff), `PUT .../consignment`, `POST .../consignment/events`, `POST .../consignment/label`,
`POST .../arrival` (staff-recorded delivered), `GET|POST /orders/v1/orders/{id}/delivery-move`, `POST .../delivery-window`, `PUT .../courier-collection`,
cancel/refund routes. Schedule: `courier-late-sweep` every 30 min emits `CourierParcelsLate{where=hub|supplier|courier}`.

### 3.8 Fleet admin - `fleet/src/drivers|capabilities|duty|vehicles|holdings|slots|deliverydays`
Drivers CRUD/status/audit (Cognito provisioning in `drivers/cognito.ts`), capabilities grant/revoke, duty list and force-end, vehicles CRUD/status,
issue/return holdings, delivery slots (windows) and delivery days. Vehicle issue refuses retired/off-road vehicles and inactive drivers.

### 3.9 Config knobs that drive dispatch
`delivery_collection_run.run_time` (the schedule) · `planning_lead_min` 45 (round opening, collection feasibility window) ·
`per_stop_allowance_min` 12 (the only "travel time") · `sameday_hub_turnaround_min` (collectionRunFor) · `standard_no_delivery_weekdays` +
delivery-day dates · `load_overdue_min` 20 / `checkin_overdue_min` 30 · `vehicle_check_required` · `OPENS_SOON_LEAD_MIN`=15 (code constant) ·
`PASS_INTERVAL_MS` 5 min (code, must match serverless rate) · vehicle `payload_kg`, chilled/frozen flags · `driver_duty_session.expected_end_at`.

---

## 4. Observations

### 4.1 Overlapping "status" notions (at least 9 for one package)
1. `shop_fulfillment.status` (8 values; the shop's word, also partly written by drivers, orders and consignment)
2. `round_package.state` (6 values; separate rows for collection and delivery)
3. `round_stop.status` (6 values)
4. `driver_round.status` (4)
5. Existence facts: `hub_checkin`, `package_arrival`, `carrier_handoff`, `parcel_return`, open `delivery_attempt_failure`, open `package_hold`
6. `courier_consignment.state`
7. `packageStatus` nine words (staff/shop) - derived from 1+2+3+5+6
8. `stageFor` customer stage (4 words) - derived from **1 only**
9. `runStage` (093) per round, `dropStatusOf` (driver wire), `hubSortOf`, the dispatch day's "late" rule (`dueRun`)

Each has its own reader. They disagree in practice:
- **The customer sees "on the way" as soon as a driver collects** from the shop (`STAGE_RANK collected:2`), even when the parcel will sit at the hub for days
  (a later-day window). A failed delivery still shows "on the way". A `withdrawn`/`unfulfillable` package ranks 0, so an order with one cancelled portion stays "confirmed" until… never.
- **`packageStatus` ignores `package_hold`.** A parcel declared "not in van" at check-in reads "At hub". One held at load reads "At hub", and so does one resolved `lost`.
  Nothing (customer, refund, shop) reacts to `lost`. `grep package_hold` hits only driver/complete, load, planner sql, sequence and audit.

### 4.2 Bugs / inconsistencies (with evidence)
1. **Dispatch "Unassign" of a loaded delivery round re-pools goods that are in a van.** `fleet/src/dispatch/service.ts unassign` deletes every
   `assigned` rp on the round and cancels it, with only a `parcels_to_return` check. Delivery packages stay `assigned` while out for delivery, so GATHER_DELIVERY
   (hub check-in + picked_up + no open assigned) re-plans them to another driver on the next pass. The planner's own release explicitly skips in-progress delivery rounds
   for exactly this reason (`release.ts` comment). Afterwards `recordProof` on the old driver's stop finds no packages but still marks the stop done.
2. **Dispatch reassign/unassign/reorder do not take `PLANNER_PASS_LOCK`.** `driver-work.ts:13` says "anything that changes driver work outside a pass takes it FIRST".
   The assignments service and load do; `dispatch/service.ts` does not (only row `FOR UPDATE`). This can race a pass adding to the same round.
3. **`round_package.state='failed'` is never written** (the CHECK allows it; `dispatch/windows.ts:61` counts it). A failure leaves the row `assigned` on a skipped stop. Dead state.
4. **`dispatch_wave` comment vs behaviour:** the table says `packages_unassigned` "is the number that matters". `commitWave` deletes any wave that assigned 0
   (`planner/repository.ts:~410`), and `run_id` is always passed NULL. The table is now an assignment log. `driver_round.wave_id` NOT NULL forces a wave row anyway.
5. **`driver_round.locked_by_sub/locked_at` are unused since 073** (FEATURE-HISTORY says "drop it later").
6. **Exception resolve note is discarded** (`exceptions/service.ts resolveException` takes `note`, stores only `noteProvided`). The audit records `driverId: exceptionId`.
   The same `driverId:` misuse appears for hold/check/round/vehicle ids in `sequence/service.ts` and `vehicles/service.ts`.
7. **Proof media is not verified.** `submitProof` accepts any non-empty `mediaKey` and checks no prefix, no drop, and does not confirm the object exists. The presign handler's comment
   ("a drop cannot be marked delivered against an image that failed to arrive") is not enforced server-side.
8. **The planner ignores vehicle status and compliance.** `CANDIDATE_DRIVERS` joins the held vehicle with no `status` filter. A van set `off_road` while held
   keeps its driver eligible. Rego/insurance/roadworthy expiry are never gates (decision D14 said they would be). The licence-expiry check uses UTC end of day (`driver-eligibility.ts licenceExpired`), not Melbourne.
9. **An unsafe vehicle can be laundered:** `vehicle_check` is unique per (driver, vehicle, day). Hand the same van to another driver, they answer "ok", and the van is eligible.
   The vehicle's status is never changed by an unsafe check.
10. **The hub check-in discrepancy is weakened:** `packages_expected` excludes held (not_in_van) packages, so expected − arrived no longer shows them (they live only in `package_hold`).
    `arrived` is counted by legacy `delivery_method`, not by delivered_by.
11. **`reportIssue` (`complete.ts:357`)** sets `not_available` without taking the stop lock or the pass lock, and leaves the stop open. A not-available package is silently
    re-assigned on the next pass, possibly to the same run. There is no "shop said no" loop back to the shop.
12. **`order_ready` push leaks the split** (`shop/src/fulfillments/repository.ts:391`). It is sent per shop portion ("Your order is ready for handoff") with dedupe by `sf.id`, so a
    2-shop order notifies twice. This contradicts `customerViewChanged`'s rule that update count must not reveal a second shop, and the copy is wrong for the customer anyway.
13. **`order_out_for_delivery` has copy (`notifications/src/worker/copy.ts:104`) but no producer.** Loading the van notifies nobody.
14. **Three writers of `package_arrival` and four of `status='delivered'`** (§1.5). CLAUDE.md's "one writer" claims cover consignments only.
15. **Ordering by zone UUID** groups zones in random order. With 076's optional zones, ungrouped postcodes have NULL `zone_id` and are not grouped by suburb or postcode at all.
    The sort could use the postcode, but does not.
16. **Malformed JSON → 500** on some fleet dispatch handlers (`dispatch-unassign-v1-post.ts` calls `JSON.parse` unguarded).
17. **Deploy status in the records contradicts itself:** 092 says `driver` is deployed to dev and "needs 088–090's migrations first", while 088/089/090 each say "NOT MIGRATED".
    093's migration is not applied, and its code reads `package_hold`/`vehicle_check` in **both gathers** (`heldSql`) and in candidates (`vehicleCheckStateSql`). So **deploying fleet before
    `make db-up` breaks every planning pass.** The live state cannot be verified from the repo.

### 4.3 Complexity hotspots / over-engineering
- **The `fleet` planner (~1,500 lines in planner/ + eligibility + ordering) serves a volume the docs themselves put below where automation is needed** (logistics-engine-architecture §7:
  "~30–50 orders/day threshold… a dispatcher with a good screen would cope"). The waves, buckets, standing exclusions, late-join, keep-together, collector preference and release
  together are a lot of machinery for <10 drivers and one hub.
- **Round opening plus feasibility interact to cap rounds** (3 shops/collection round at defaults). This is invisible to operators except through "cannot_meet_deadline" reasons.
- **The sequence gates (093) plus waivers plus holds plus returns plus overdue** add a third control layer on top of open/closed and the custody checks. Each driver write runs 2–4 extra gate queries.
- **SQL fragments in TS strings**, shared by string interpolation (`heldSql`, `TO_RETURN_SQL`, `IN_TRANSIT_SQL`, `ROUND_STAGE_LATERAL`, `deliveredBySql`). Good for one definition,
  but they rely on alias conventions (`dr`, `rp`, `rs`, `sf`), and the comments record several column-name defects that only container tests caught.
- **The comments are very long** (multi-paragraph ⚠ histories in nearly every function). They are useful as archaeology, but the signal-to-noise ratio is low, and several are already stale (e.g. dispatch_wave, `driver_round.locked_by_sub`).
- **Legacy compatibility debris:** `sameDayCount/standardCount`, history `type: "same_day_delivery"`, `delivery_method` still used for counting at check-in,
  `delivery_model_v2_at`, the go-live route that always 409s, and the dead pickup stub.

### 4.4 Missing capabilities vs a real delivery platform
| Capability | State |
|---|---|
| Route optimisation / sequencing by geography | **None** (deliberate, D20). No geocoding of customers or shops; order = status/time/zone-uuid/shop-uuid |
| ETA / travel time | **None.** "Travel time" is `stops × 12 min`. No ETA to the customer, no predicted arrival, no "you're next" |
| Live driver tracking | **None** (deliberate, D22; location columns and route removed). Customer has no tracking page for Effy delivery (courier gets one link) |
| Customer notifications | paid, `order_ready` (per portion, see bug 12), `order_delivered` (push + email), `order_with_courier`. **No out-for-delivery, en-route, arriving, or failed-attempt messages**; no SMS |
| Proof of delivery | photo / signature-image / contactless-photo. **No OTP/PIN** (refused), no GPS or time-of-device stamp, no recipient name, no ID/age check, no per-package POD |
| Failed delivery handling | reason + return to hub + staff resolve. **No attempt count, max attempts, reschedule-by-customer, redelivery fee, RTS to supplier, or customer contact flow**; redelivery is implicit on resolve |
| Capacity | payload kg only; volume/crates stored but unused; cold-chain = boolean vehicle flags vs product `storage` attribute |
| Shifts / rostering | ad-hoc clock-on + optional expected end (D23); no breaks, no roster, no planned availability for tomorrow |
| Multi-hub | not supported (one hub in settings) |
| Cash on delivery / payments at door | none (prepaid only) |
| Returns (customer-initiated) | none; only failed-delivery returns to hub |
| SLA monitoring | EMF metrics (unassigned past opening, collect-late, custody hours, courier late) + overdue runs (093). **No on-time-delivery metric vs window end**, no late-delivery alert to staff or customer |
| Driver performance / pay | none |
| Dispatcher map / live board | day/windows/round views; live via AppSync "kind" pings |
| Event backbone | `event_outbox` never drained; no SNS events for dispatch transitions |

### 4.5 Fragile parts
- **Everything hangs on the 5-minute pass** (one Lambda, one advisory lock, one transaction doing release + both kinds + exclusions + pushes). One slow or failing query stalls all
  dispatch. There is no retry beyond the next tick, and the metric is emitted only on success.
- **Gathers depend on `shop_fulfillment.status`** being advanced by other services. Comments note that a missed status write re-collects or re-delivers packages
  (072 found a delivered package re-gathered).
- **Timezone logic** is hand-rolled (`collection-deadline.ts`, Intl-based) with DST fixtures. Mixed `now() AT TIME ZONE 'Australia/Melbourne'` SQL and TS date math.
- **Optimistic lock on `updated_at` at microsecond precision**, formatted via `to_char` (documented trap).
- **Wire compatibility**: driver DTO fields are kept for installed apps with no update mechanism; 093 broke the collect body with no compatibility (OK only because the app has no users).

### 4.6 Built but not deployed / migrated (per FEATURE-HISTORY, unverified live)
- 093 driver-work-sequence: **not migrated, deployed or walked** (`20261017100000_driver_work_sequence.sql`); vehicle check is off by default.
- 091 handover visibility: not deployed. 090 scanning foundation: not migrated, deployed or walked. 089 labels: not migrated, deployed or walked.
  088 failed-parcel return: "not migrated" yet also "deployed by operator 2026-10-16" - contradictory.
- 092 driver redesign: `driver` deployed to dev; app not walked. 072/073: recorded as "not deployed" in their own entries, but later features build on them as live.
- No feature on this path has been walked end-to-end by a person per the records (memory: "walks not recorded").
