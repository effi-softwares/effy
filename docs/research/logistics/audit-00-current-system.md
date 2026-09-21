# Effy codebase audit — what the dispatch engine can build on (2026-09-20)

Read from the migrations and live source, not from specs.

## ✅ ASSETS — already built, correct, and reusable

| Object | What it gives the engine |
|---|---|
| `public.delivery_zone` | code, name, `ring_id`, `sameday_eligible`, status. **Zones already exist.** |
| `public.delivery_zone_postcode` | `UNIQUE(postcode)` → one postcode is in exactly one zone. Serviceability = membership. |
| `public.delivery_ring` | INNER/MIDDLE/OUTER/EXTENDED + `suggest_upper_km`. Distance banding already modelled. |
| `public.delivery_settings` | **`hub_latitude`, `hub_longitude`** (singleton) + `sameday_prep_buffer_min`. The hub HAS coordinates. |
| `public.delivery_collection_run` | `run_time` + status. **The cutoff schedule already exists** — 1..n runs/day. |
| `public.locality` | name, state, postcode, **`latitude`, `longitude`**, `address_count`. G-NAF-derived. ⚠ Currently a 17-row sample. |
| `public.shop_sameday_exception` | per-(shop, zone) on/off override. |
| `public.order_package_delivery` | `UNIQUE(order_id, shop_id)`, `method IN ('same_day','standard')`, fee, `promised_from/to`. **Method is decided at checkout — the engine never classifies.** |
| `public.shop_fulfillment` | `UNIQUE(order_id, shop_id)`, status `pending→received→picking→ready_for_pickup→collected→delivered`, `delivery_method`, `promised_ready_at`. **This IS the package.** |
| `public.driver` | status (active/suspended/offboarded), licence fields, contact, emergency contact. |
| `public.driver_duty_session` | open/closed session, partial-unique one-open-per-driver, `last_location_lat/lng/at`. |
| `public.carrier_handoff`, `public.package_arrival` | 053's terminal records — survive the teardown. |
| `core-api` SSE precedent | `GET /v1/shop/live` on Fargate + Postgres `LISTEN/NOTIFY`, `WriteTimeout` cleared per-request. **A working real-time pattern already exists to copy.** |
| `notification_request` outbox + FCM worker | push plumbing, dedupe key, dead-token pruning. |
| back-office fleet console | register, profile, status transitions, audit, duty panel, readiness panel. 11 routes on `edge-api/fleet`. |
| driver app UI | 45 screens from 060 — today, collection, delivery, proof (signature pad, camera), map (MapLibre/OpenFreeMap), history, activity. **UI exists; backend does not.** |

## ⛔ GAPS — what is missing or wrong

### G-A. Shops have NO location. **This is the hard blocker.**
`public.shop` is `id, code, name, is_active, created_at, updated_at` and nothing else. Its own comment
says "no address, hours, capacity, zones, or inventory — those arrive with the slice that needs them."
A `postcode` column was added by 021 and **dropped** by the 047 withdrawal. A `timezone` column was
dropped too.
→ **A collection round cannot be sequenced, mapped, or time-estimated.** 049 deferred the in-app map on
exactly this. Nothing else in the engine matters until this is fixed.

### G-B. Customer addresses are not geocoded.
`customer_address` = line1/line2/city/region/postal_code/country. `order.delivery_address` is an
immutable jsonb snapshot of the same. **No lat/lng anywhere.**
→ Delivery rounds can be sequenced no finer than locality centroid (via `locality.latitude/longitude`),
which puts every drop in one suburb at the same point.

### G-C. `driver.delivery_zone_id` is a SINGLE nullable FK.
The requirement is a driver × zone × function(pickup|delivery) × method(standard|same_day) capability
matrix, any combination. The current column cannot express it, and **no assignment code ever read it**
(FR-010 was declared and never built).

### G-D. Vehicle is two free-text columns on the driver row.
`driver.vehicle_type`, `driver.vehicle_plate`, `driver.vehicle_registration_expires_on`.
→ No vehicle entity, no capacity, no chilled/frozen capability, no odometer, no service/inspection, no
pool assignment, no "one van, three drivers across a week".

### G-E. There is no work model at all.
Removed 2026-09-20 (`20260920101500_remove_driver_work_model.sql`). Nothing assigns, carries, delivers
or proves anything. `shop_fulfillment` now stops at `ready_for_pickup` forever.

### G-F. No shift / roster / availability plan.
Only an ad-hoc duty session. No planned shift, no break, no shift-end time — so no engine can know
whether a driver can finish a round before going home.

### G-G. No capacity anywhere.
No vehicle capacity, no package dimensions. `product.weight_grams` exists (047, with
`weight_is_assumed`) so package weight is derivable; volume is not.

### G-H. PostGIS is NOT installed.
Extensions in use: `pg_trgm`, `citext`. No PostGIS, no pgRouting, no h3.

## Facts that constrain the design
1. **Method is decided at checkout**, never by a driver or the engine. `order_package_delivery.method`.
2. **One hub**, `delivery_settings` singleton, hub coords present. Multi-hub deferred.
3. **A customer must never learn which shop fulfils their order** — distance/ring/shop identity may not
   cross into a customer DTO.
4. **API Gateway HTTP API caps an integration at 30 s** → a Lambda cannot hold a stream. Fargate can,
   and already does for the shop console.
5. **`edge-admin` is at ~434/500 CloudFormation resources** with `versionFunctions: false` spent. New
   route families need their own service — `edge-fleet` exists and is now at 11 functions.
6. Money never appears in any driver-facing DTO (049 FR-013).

---

## The cutoff engine already exists, is correct, and is in the WRONG LANGUAGE for the worker

`apis/core-api/internal/platform/delivery/sameday.go` is a real, tested, timezone-correct cutoff engine:

- `MelbourneTZ` — loads `Australia/Melbourne`, **falls back to a fixed +10:00** if tzdata is missing from a
  slim container, so a cutoff is never silently judged in UTC.
- `CollectionRun{Hour, Minute}` — a run as wall-clock time-of-day.
- `SameDayCutoff(now, runs, bufferMin) (time.Time, bool)` — the LATEST still-makeable cutoff.
  `ok=false` means no run today can still be made. With several runs, availability extends run-by-run
  through the day.
- `SameDaySchedule(ctx, q)` — reads active runs + prep buffer; returns empty rather than erroring when
  the schedule does not exist yet.

### ⚠ The dispatch engine needs the INVERSE of this function
Checkout asks *"can this shopper still get same-day?"*. Dispatch asks *"given the 14:00 run, which
packages must be collected by then, and when must the driver leave the hub to make it?"* Same schedule,
opposite direction. The schedule read and the timezone rule are shared; the derivation is not.

### ⚠ AND THIS IS A CROSS-LANGUAGE DUPLICATION RISK, WHICH THIS REPO HAS SHIPPED DEFECTS THROUGH
The cutoff rule is **Go, on the hot path**. The natural home for a scheduled assignment worker is the
**Node cold path** (that is where 049's sweep lived, and where every other worker lives). Re-implementing
`SameDayCutoff` in TypeScript would create two implementations of one rule in two languages — the exact
shape of 054's `availability`-in-14-places finding and 052's deleted `summarizeFulfillment`.

Three ways out, to be decided in planning:
1. **Put the assignment engine in Go on `core-api`** beside the rule it depends on. Costs a recorded
   Principle III exception (the cold path is the documented home for ops/async work), which 058 already
   set a precedent for with `GET /v1/shop/live`.
2. **Keep the worker on the cold path and expose the cutoff as an internal endpoint** from core-api.
   Adds a network hop to a scheduled job, and a failure mode where the worker cannot plan because the
   hot path is down.
3. **Duplicate it deliberately, pinned by a cross-language contract test** — the shape 028 used for the
   Go↔Kotlin banner wire contract (one byte-identical fixture, asserted on both sides). ⚠ A DST fixture
   is mandatory here: 058 found TWO real bugs in calendar arithmetic that only the DST tests caught,
   including an entire trading hour silently skipped.

## Reusable, already-solved pieces worth naming so they are not rebuilt
| Piece | Where | Why it matters to dispatch |
|---|---|---|
| Haversine ring suggestion | 047 admin service | zone→hub distance already computed and stored (`delivery_zone.hub_distance_km`) |
| `locality` centroid load | `delivery/localityload.go`, `make load-localities` | a CSV→Postgres geocode loader already exists and works |
| SSE + `LISTEN/NOTIFY` + `WriteTimeout` fix | `core-api` shop live stream (058) | the real-time transport question may already be answered in-house |
| Outbox + FCM worker + dedupe key | 050/053/059 | push-to-wake needs no new plumbing |
| `admin.audit_log` + `recordAudit` | 056 fleet | privileged fleet writes are already audited |
| Container-test harness vs real migrations | `edge-fleet`, `edge-shop` | the engine's SQL can be tested against real PostgreSQL on day one |

---

## ✅ VERIFIED LOCALLY: the driver app collects NO location today, and that changes the risk shape

Research agent 03 flagged a possible Victorian Surveillance Devices Act 1999 / OVIC notice-and-consent
gap on employee location tracking, and recommended a mobile-permission audit. **Audit done. Result:**

`apps/driver-mobile/androidApp/src/main/AndroidManifest.xml` declares exactly three permissions:
`INTERNET`, `POST_NOTIFICATIONS` (050), `CAMERA` (049 photo proof). **No `ACCESS_FINE_LOCATION`, no
`ACCESS_COARSE_LOCATION`, no `ACCESS_BACKGROUND_LOCATION`.** `iosApp/iosApp/Info.plist` declares **no
`NSLocation*` key at all**.

### So the exposure today is ZERO — and that is precisely what makes it dangerous later
The **endpoint exists** (`POST /driver/v1/location`, still live after the teardown) and the **columns
exist** (`driver_duty_session.last_location_lat/lng/at`). What does not exist is any way for the app to
obtain a coordinate. The plumbing is laid and unconnected.

⚠ **This is the exact shape of 059's headline defect** — the platform had been enqueuing shop
notifications since 050 for a `device_token.platform` enum that could not represent a web console, so
every intent was written, attempted and silently recorded `skipped`. Here it is the inverse: a receiver
with no sender. The moment anyone adds a location permission to make the map work, the platform starts
collecting employee position with **no consent record, no notice, and no retention rule** — and nothing
will fail.

### Consequence for the plan
Location capture is **not** a free add-on to the routing work. If the dispatch slice wants driver
position (for nearest-driver scoring, ETA, or a live map), it must land **in the same change** as:
1. a stored, timestamped driver acknowledgement of a written tracking notice;
2. an explicit statement of what is captured, when, and for how long (snapshot-on-event vs continuous);
3. a retention/purge rule for `last_location_*`;
4. a guarantee that capture cannot occur outside an open duty session.

Otherwise the honest option is to **not collect it at all** in phase 1 and sequence routes from
shop/customer coordinates alone — which is viable, because the hub is fixed and every stop is known in
advance. Nearest-*driver* scoring is the only thing that genuinely needs live position, and at <10
drivers departing from one hub it buys very little.
