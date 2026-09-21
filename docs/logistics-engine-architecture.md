# Effy Logistics Engine — Research Deliverable & Build Plan

**Written 2026-09-20**, after the 049 driver work model was torn down
(`db/migrations/20260920101500_remove_driver_work_model.sql`) and before the replacement is specified.

This is the research artefact the brief demanded, in the shape 058 used for
[docs/insights-architecture.md](insights-architecture.md): find out how the industry actually solves
this, catalogue every requirement, match them against what Effy already has, select, and only then plan.

| | |
|---|---|
| **Raw research** | [docs/research/logistics/](research/logistics/) — 6 reports, ~3,400 lines, every claim cited |
| **Codebase audit** | [research/logistics/audit-00-current-system.md](research/logistics/audit-00-current-system.md) |
| **Decision log** | [research/logistics/decisions-01-running.md](research/logistics/decisions-01-running.md) — D1…D19 |
| **Requirements found** | **348**, numbered and tagged `ESSENTIAL` / `USEFUL` / `OVERKILL-AT-OUR-SCALE` |

---

## §0 ⚠ How much of this is actually verified

Six agents researched in parallel. **The session's shared WebSearch quota (200 calls) was exhausted
early**, and most primary legal sources — AustLII, `legislation.vic.gov.au`, `legislation.gov.au` —
actively block automated fetch. Every agent therefore marked claims **VERIFIED** (source fetched),
**SEARCH-SYNTHESIS** (snippet only), or **UNVERIFIED THIS SESSION**, and none fabricated to fill gaps.

**Read the engineering findings as solid and the legal findings as leads.** §8 lists what a person still
has to settle. Vendor coverage gaps are recorded in each report; the largest is Locate2u, which targets
employee/B2B fleets and is the closest analogue to Effy's model.

---

## §1 The requirement catalogue — 348 items

| Report | Topic | Items | Covers brief requirement |
|---|---|---:|---|
| [01-dispatch](research/logistics/research-01-dispatch.md) | assignment engines | 62 | **4**, **6** |
| [02-routing](research/logistics/research-02-routing.md) | VRP, geodata, solvers | 42 | **6** |
| [03-fleet-domain](research/logistics/research-03-fleet-domain.md) | driver, vehicle, AU compliance | 87 | **1**, vehicles |
| [04-realtime](research/logistics/research-04-realtime.md) | task push to mobile | 43 | **3** |
| [05-proof](research/logistics/research-05-proof.md) | chain of custody | 64 | **5** |
| [06-zones](research/logistics/research-06-zones.md) | territory & capability matching | 50 | **2** |

The per-item tags are in each report. This document selects from them; it does not restate them.

---

## §2 ⭐ The keystone: this is a WAVE PLANNER, not a continuous dispatcher

**Two independent lines of evidence landed on the same shape, and that is the strongest signal in the
whole pass.**

*From outside:* wave/cutoff-driven dispatch — not on-demand — is the correct reference model, confirmed
against WMS wave-planning literature (release triggered by a carrier cutoff, orders grouped by shared
deadline and zone, **work generated only at the wave, not before**) and Instacart's ~1-minute replan
cadence. Food-delivery on-demand systems are the wrong analogue.

*From inside:* `public.delivery_collection_run` already stores 1..n wall-clock run times, and
`apis/core-api/internal/platform/delivery/sameday.go` already answers the checkout question *"can this
shopper still get same-day?"*. **The engine is that same schedule read in the opposite direction:** given
the 14:00 run and the prep buffer, which packages must be collected by then, and when must a driver leave?

⚠ **This is precisely what 049 got wrong.** Its sweep was a `rate(1 minute)` scavenger looking for
unclaimed work, which is why it had no notion of a deadline and no reason to batch — so it gave every
ready package on the platform to one driver. **A wave planner gets deadlines and batching for free,
because a wave IS a deadline and a batch.**

**Trigger:** `for each active collection run: at (run_time − prep_buffer − planning_lead), plan the wave.`
Not a timer hunting for orphans.

---

## §3 The selected design

### 3.1 Assignment — push, gated, then scored *(D13, D14)*
**No system reviewed uses offer/accept for an employee fleet.** That mechanic manages *gig-worker
consent*: Tookan, Deliveroo's Frank and DoorDash's DeepRed offer/broadcast because their workers are
contractors who can decline. **Onfleet and Circuit for Teams, serving owned fleets, push-assign.**
Offer/fallback is right only for failure recovery (driver goes down mid-run).
→ **Deletes accept/decline UI, timeout handling and re-offer loops before they are written.**

```
ELIGIBILITY gate → driver_zone_capability matches (zone, function, method)
                   AND driver active AND open duty session
                   AND licence not expired
                   AND assigned vehicle with current compliance
CAPACITY gate    → vehicle capacity not exceeded by the wave
FEASIBILITY gate → round completes before the cutoff AND before shift end
THEN score       → proximity / insertion cost; lowest wins; push-assign
```

**Hard gates are filters, never weights.** A driver who cannot legally drive is not a worse candidate —
they are not a candidate. Agents 01 and 06 reached this independently.

⚠ **No vendor publishes scoring weights.** Across Onfleet, Bringg, OptimoRoute, Routific and DoorDash,
"proximity + capacity + time-window + load" is universal as *named factors*; the combining weights are
proprietary everywhere. **We set a simple rule and tune by observation, and we do not dress an invented
formula as industry practice.**

**DoorDash's own reasoning argues for us:** DeepRed (ML + Gurobi MIP) exists to protect marketplace
efficiency across *thousands of concurrent competing orders* — not a problem at one hub with <10 drivers.
DoorDash itself falls back to greedy-nearest under time pressure and calls it "suboptimal", not wrong.

### 3.2 Capability matrix — the answer to brief requirement 2 *(D2, D3)*
```sql
CREATE TABLE public.driver_zone_capability (
  driver_id uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
  function  text NOT NULL CHECK (function IN ('pickup','delivery')),
  method    text NOT NULL CHECK (method  IN ('standard','same_day')),
  zone_id   uuid          REFERENCES public.delivery_zone (id) ON DELETE CASCADE
);
-- ⚠ NULLS NOT DISTINCT (PostgreSQL 15+; we run 16) — ONE index, not two partial ones.
-- A plain UNIQUE does NOT deduplicate NULLs, so (driver,'pickup','standard',NULL) would insert twice.
CREATE UNIQUE INDEX driver_zone_capability_uq
    ON public.driver_zone_capability (driver_id, function, method, zone_id) NULLS NOT DISTINCT;
```
**`zone_id IS NULL` is a first-class "all zones, including zones created tomorrow" scope.** A
row-per-zone table cannot express that without a back-fill job for every new zone — and a job that must
not be forgotten is how 054 ended up with `availability` hand-written in fourteen places.

Matching: `zone_id = :zone OR zone_id IS NULL`. "Satisfies several requirements at once": relational
division (double `NOT EXISTS`).

⚠ **The `NULLS NOT DISTINCT` guarantee must be proven by a container test against real PostgreSQL** —
insert the duplicate, assert refusal. A uniqueness rule that silently does not hold is 059's nullable
`subject_key`: a green suite and a feature that looks like it works.

**Capability is a filter and "no match" is explicit UX.** Bringg says it in as many words — *"add a
driver with the required skills… or reschedule"*. 056's existing `readiness` screen already renders
`no_zone` as a blocking reason, so the coverage-gap view **extends rather than gets rebuilt**.

### 3.3 Zones — keep postcodes, no PostGIS *(D1)*
Postcodes are Australia Post delivery-route artefacts with no authoritative boundary; the ABS builds
"Postal Areas" only as a population-weighted approximation and calls that class of correspondence *"the
least accurate method"*. Uber's stated reason for inventing H3 is effectively an argument against
postcode zones — **at Uber's global, multi-city, exact-location-analytics scale.** It does not transfer.

**Accepted cost:** a postcode straddling a suburb boundary sits in one zone and may be mis-promised at
its edge. Revisit only for true polygons or a drive-time cutoff.

### 3.4 Vehicles — their own entity *(D8, D9)*
`public.vehicle` (identity, ownership `effy_owned|driver_owned`, capacity, refrigeration, compliance
dates, status) + `public.vehicle_assignment` (driver, vehicle, started/ended, kind, odometer in/out),
mirroring the **one-open-row + partial-unique-index** pattern `driver_duty_session` already uses.
**One table expresses both "Effy-owned, assigned this shift" and "driver-owned" — distinguished by data,
not by two code paths**, which is exactly what the brief asked for.

⚠ **Licence *class* (C/LR/MR/HR) is missing today** — we hold `licence_reference` and
`licence_expires_on` but nothing can enforce "may this driver legally drive this vehicle", a WorkSafe
Victoria OHS duty. Class C covers our vans; the field must exist so the gate is real.

⚠ **Two compliance areas deleted before being written:** Chain of Responsibility (HVNL) applies only
above **4.5t GVM**; heavy-vehicle fatigue law (work diaries, BFM/AFM) only above **12t GVM**. Neither
reaches our vans. **No fields, no screens, no scope.**

### 3.5 Proof — three events, three mechanisms *(D16, D17, D18)*
⚠ **This contradicts 049, and the contradiction is the point.** 049 had ONE `proof_of_delivery` table
with `method IN ('photo','code','signature','contactless')`, reachable only from a delivery task.

| Custody event | Problem class | Mechanism |
|---|---|---|
| Shop pickup | **scan reconciliation** | expected manifest vs scanned count; hard exception on mismatch |
| Hub check-in | **scan reconciliation** | same, inbound; discrepancy is a first-class outcome |
| Customer delivery | **handoff authorization** | one-time PIN when attended; photo-at-location when contactless pre-authorized |

Forcing all three through one polymorphic "proof" **blurs a scan-count control into a doorstep
authorization control** — two different questions, neither answered well.

**Retention is our number to pick.** APP 11.2 (VERIFIED, OAIC) sets **no specific period** — "reasonable
steps to destroy when no longer needed". **A doorstep photo showing a face or identifiable house IS
personal information.** So: choose a window tied to our chargeback/dispute period, write it down, and
**enforce it with a purge job that actually runs** — a retention policy with no deleter says the
opposite of what it claims.

**Contactless copies Australia Post's Safe Drop verbatim** (VERIFIED): ATL is a customer *preference,
not a guarantee*; the driver keeps final on-the-day judgement; liability transfers once left under ATL.
Both halves are required — a customer preference a driver cannot override is how goods end up on a
footpath.

### 3.6 Real time — push-to-wake, fetch-the-truth *(D11)*
**Never put the work in the push.** FCM is best-effort and unordered; a notification is a *hint*. Uber
backs the shape: they replaced polling — **80% of backend API-gateway requests at peak** — with push,
choosing **SSE over WebSocket for "security, support in mobile SDKs, and binary size impact"**, moving to
gRPC only at 600K–1.5M concurrent connections.

**Android's own docs** make high-priority FCM data messages the sanctioned way through Doze (temporary
network + wake-lock exemption); normal priority waits for an increasingly rare maintenance window.

**Cost is not the discriminator** — every option is under ~$0.10/month at 10 devices. **API Gateway
WebSocket is out on merit**: a 10-minute idle timeout and 2-hour max connection need the same reconnect
logic as SSE for no benefit, plus `$connect`/`$disconnect` Lambdas and a connection store we lack.

**Reuse 027's cart-sync semantics for the client mirror** — monotonic `revision` so a slow response
cannot overwrite newer state, `changeId` per *action* (not per attempt) so a retry cannot double-apply,
absolute values not deltas. Shipped and proven; exactly what a task list needs.

⚠ **SSE is a SPIKE, not a given.** Verified locally: `driver-mobile` pins Ktor 3.5.1 and declares
core/android/darwin/contentNegotiation/auth/logging/json — **no `ktor-client-sse`** — and **SSE has never
been used from any KMP app here**. Our only SSE consumer is `packages/web-kit/src/runtime/live.ts`, a
browser `EventSource` sharing no code path with Ktor or Darwin. **058 proved SSE on the Go server and in
the browser; it proved nothing on KMP/iOS.** Agent 04 cites documented Ktor Darwin **WebSocket** bugs
(TLS/`wss://`, frame size, pong handling KTOR-5540) and reasons that SSE is engine-agnostic in Ktor 3 —
plausible, **unconfirmed on a device**. That is 024's VectorDrawable shape: compiles everywhere, fails
only where it runs.

### 3.7 Sequencing — an ORDERING problem, not a geometry problem *(D20, operator direction)*
⚠ **This section was rewritten on operator direction and supersedes most of
[research-02](research/logistics/research-02-routing.md).** There is **no location tracking and no
geocoding.** The task list is *ordered*, not *optimised*:

```
ORDER BY  task status      -- what is actionable now vs already done
        , time constraint  -- collection-run cutoff, promised window
        , zone             -- all stops in one zone grouped together
        , shop             -- same-shop packages adjacent
```

Deterministic, explainable to a driver, and **testable without a single coordinate**. The sort key
replaces the cost function entirely.

**What this cuts:** street-level G-NAF, customer-address geocoding, distance/time matrices (OSRM,
Valhalla, Google, Mapbox), nearest-neighbour + 2-opt, VROOM/OR-Tools, and **PostGIS entirely** — D4's
open question is now closed, and the answer is no.

⚠ **The trade, written down rather than discovered later:** a driver may zigzag *within* a zone, because
nothing knows which of two addresses in the same suburb is closer. At one metro with <10 drivers that is
acceptable, and it is consistent with manage-by-exception (§7) — the dispatcher reorders when it
matters. **Revisit when a driver complains about a specific round, not on principle.**

**Navigation is still per-stop** (D7): the app hands the device's maps app an address string for the
current stop. Google Maps caps at 3 waypoints on mobile and Apple Maps supports none, so a per-route
hand-off was never available anyway.

---

## §4 ✅ The blocker is resolved — and smaller than it was

`public.shop` still has no location, but after D20 it needs far less than originally scoped.

**Shops get an ADDRESS. They do not get coordinates.** *(D21)* A driver has to know where to drive and
the app hands an address string to the device's maps app. Nothing computes distance, so
`latitude`/`longitude` columns would be **read by nothing**.

⚠ **Adding them "for later" is precisely the defect shape this whole effort exists to clean up.** 049
left `driver.delivery_zone_id` unread by any code. 059 found `device_token.platform` silently
contradicting the live contract. audit-00 records `POST /driver/v1/location` as a receiver with no
sender. **A column nothing reads is a design decision made in advance for a feature nobody has
specified.** When something needs geometry, that slice adds the columns and their loader together.

**Mock Melbourne addresses are seed data**, in `db/seeds/` beside the existing
`db/seeds/047_delivery_dev.sql` — plainly fictional, naming no real business. The constitution's
prohibited-values rule governs *inferring* real-world identifiers; operator-authorised invented test
data is a different thing.

## §5 The plan — four slices, each shippable

Each is its own spec → plan → tasks → implement, in this order, because each unblocks the next.

### Slice A — Fleet foundations *(brief requirement 1 + vehicles)* — ✅ **BUILT 2026-09-20, NOT DEPLOYED**
Spec/artifacts: [specs/061-fleet-foundations/](../specs/061-fleet-foundations/). 83/105 tasks; every
build task done, the remainder are operator steps and the sign-off.
Complete driver management; make vehicles a first-class entity.
- **`public.vehicle`** — identity (rego, VIN, make, model, year), ownership `effy_owned|driver_owned`,
  classification, capacity (payload kg, volume, crate count), **refrigeration (chilled/frozen)**,
  compliance (registration / insurance / roadworthy expiry), operations (odometer, service due), status
  lifecycle. **`public.vehicle_assignment`** — driver, vehicle, started/ended, kind, odometer in/out,
  with the one-open-row partial-unique index `driver_duty_session` already uses.
- Retire `driver.vehicle_type` / `driver.vehicle_plate` / `driver.vehicle_registration_expires_on`.
- **`driver.licence_class`** (C/LR/MR/HR), and expiry that **blocks** assignment rather than warns.
- **`shop` address fields** (line1, line2, suburb, postcode, state). ⚠ **No coordinates** (D21).
- **`driver_duty_session.expected_end_at`**, nullable — the FEASIBILITY gate needs it (D23).
- ⚠ **Remove `POST /driver/v1/location` and `driver_duty_session.last_location_*`** (D22). The operator
  has said no location tracking, so the plumbing is deleted rather than left dormant.
- **Seeds:** mock Melbourne shop addresses and a vehicle fixture covering every type, in `db/seeds/`.
- Back-office: vehicle register, vehicle detail, assign/return, extended driver profile.
- **No engine. Nothing assigns work.** Ships safely.

### Slice B — Zones, capability and coverage *(brief requirement 2)* — ✅ **BUILT 2026-09-20, NOT DEPLOYED**
Spec/artifacts: [specs/062-driver-zone-capability/](../specs/062-driver-zone-capability/).
- `driver_zone_capability` with the `NULLS NOT DISTINCT` index, **proven by a container test** that
  inserts the duplicate and asserts refusal.
- Back-office: capability editor per driver — zone × function × method, including "all zones".
- Extend 056's `readiness` screen into the coverage-gap view: **which zone has nobody today.**
- **Still no engine.** An operator can now describe the fleet; nothing acts on it yet.

### Slice C — The wave planner *(brief requirements 4 and 6)*
- Wave planning triggered off `delivery_collection_run`: hard gates (eligibility → capacity →
  feasibility) then proximity-free scoring, push-assign.
- Task/work model rebuilt — informed by D16, **not a restoration of 049's shape**.
- **Sequencing by the D20 sort key** (status, time, zone, shop). No geometry, no solver.
- Dispatcher console: see the wave, reassign, unassign, reorder, lock. **Manage by exception.**
- ⚠ **Decide the cutoff-rule home here** (audit-00): Go on `core-api` beside `SameDayCutoff`, an internal
  endpoint, or a deliberate duplicate pinned by a cross-language contract test with **DST fixtures** —
  058 found two real calendar bugs that only DST tests caught, including a silently skipped trading hour.

### Slice D — Driver execution and proof *(brief requirements 3 and 5)*
- Wire the 45 existing 060 screens to the new backend. **No new UI design.**
- Push-to-wake + fetch-the-truth with 027's `revision` / `changeId` semantics; poll + refresh-on-resume.
- Three proof mechanisms per D16 — scan reconciliation at shop pickup and hub check-in, handoff
  authorization at the door.
- Retention window **plus a purge job that actually runs** (D17).
- **SSE spike on a real iOS device, gated.** If it fails we lose a spike, not a slice.

## §6 What we deliberately do NOT build
Chain of Responsibility fields · heavy-vehicle fatigue/work diaries · offer-accept-decline · driver
rosters · per-driver Food Safety Supervisor · alcohol age-verification · cold-chain temperature logging ·
polygon zone editing · multi-hub.

**Cut by operator direction (D20–D22), having been researched first:** all location tracking · street-level
G-NAF · customer-address geocoding · distance/time matrices · nearest-neighbour + 2-opt · VROOM/OR-Tools ·
**PostGIS entirely** · H3/S2 · isochrones · shop coordinates.

Each is justified in the decision log. Several are deleted on **verified thresholds** rather than taste —
and the location strand was researched properly *before* being cut, which is why we know what we are
giving up (§3.7) rather than merely that we skipped it.

---

## §7 ⚠ The honest caveat about the engine itself
Bringg's phrase is **"manage by exception"**, and **Shipday states a ~30–50 orders/day threshold before
automation becomes necessary**. Effy's volume sits *below* where even an SMB vendor says an engine is
needed. A dispatcher with a good screen would cope today.

**The engine earns its place by making the common case automatic and the exceptional case visible — not
by being clever.** 056 already established that pattern: derive the problem state on read, itemise it,
and make resolution an explicit human decision because it asserts something about the physical world no
query can know. If a slice starts growing cleverness instead of visibility, that is the signal to stop.

---

## §8 Open questions — answered 2026-09-20

| # | Question | Answer |
|---|---|---|
| 1 | Shop street addresses | ✅ **Mock Melbourne addresses**, seeded for testing (D21) |
| 2 | Vehicle inventory | ✅ **Build the full feature**; seed a fixture of every type (D24) |
| 3 | Shift pattern | ✅ **Ad-hoc clock-in + nullable `expected_end_at`. No roster** (D23) |
| 4 | Live driver position | ✅ **Do not collect.** Existing plumbing removed (D20, D22) |
| 5 | Photo retention window | ⏳ still open — tied to our dispute period (D17) |
| 6 | Modern Award coverage | ⏳ still open — a question for a person (D19) |
| 7 | Food-safety temperature mandate | ⏳ still open — get advice; build nothing on the synthesis (D19) |

**Items 5–7 do not block Slices A–C.** Item 5 is needed before Slice D ships proof media.
