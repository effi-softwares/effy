# Dispatch engine — running design decisions (synthesised, not yet a plan)

Accumulated as research lands. Each entry: the decision, the evidence, and what it costs us.

---

## D1. Zones stay POSTCODE-BASED. No PostGIS, no H3, no isochrones — in phase 1.
**Evidence (agent 06):** Postcodes are Australia Post delivery-route artifacts with no authoritative
geographic boundary; the ABS builds "Postal Areas" only as a population-weighted Mesh Block
approximation and warns that correspondences like it are "the least accurate method". Uber's own stated
reason for inventing H3 is effectively an argument against postcode zones — **but at Uber's global,
multi-city, exact-location-analytics scale.** It does not transfer to one hub, one metro, <10 drivers.

**Cost of the decision:** a postcode that straddles a suburb boundary is assigned to one zone and may be
mis-priced or mis-promised at its edge. Acceptable at Melbourne-metro scale; revisit if we ever want
true polygons or a drive-time cutoff.

⚠ **This decision is about ZONES ONLY.** It does not settle whether PostGIS is worth having for
ROUTE SEQUENCING (agent 02 wants KNN/clustering once coordinates exist). Those are two different
questions about the same extension and must not be conflated — see D4.

---

## D2. ✅ IMPLEMENTED (062). The capability matrix is a join table with NULL as a first-class "all zones" scope.
**Shape (agent 06):**
```
driver_zone_capability(
  driver_id  uuid NOT NULL REFERENCES public.driver(id) ON DELETE CASCADE,
  function   text NOT NULL CHECK (function IN ('pickup','delivery')),
  method     text NOT NULL CHECK (method IN ('standard','same_day')),
  zone_id    uuid     NULL REFERENCES public.delivery_zone(id) ON DELETE CASCADE
)
```
`zone_id IS NULL` means **every zone, including zones created tomorrow**. Matching is
`zone_id = :zone OR zone_id IS NULL`. "Must satisfy several requirements at once" uses the standard
double-`NOT EXISTS` relational-division idiom.

**Why NULL rather than a row per zone:** a row-per-combination table cannot express "all zones,
including future ones" without a background job that back-fills every new zone into every driver's
capability set — and a background job that must not be forgotten is the shape this repo keeps shipping
defects through (054's `availability` in 14 places; 059's dormant fourth reader).

### ⚠ IMPROVEMENT ON THE AGENT'S RECOMMENDATION — we are on PostgreSQL 16, so we do not need two indexes
The agent correctly identified the trap: **a plain `UNIQUE` does not deduplicate NULLs** in standard
SQL, so `(driver, 'pickup', 'standard', NULL)` could be inserted twice. Its fix was two partial unique
indexes — one `WHERE zone_id IS NOT NULL`, one `WHERE zone_id IS NULL`.

PostgreSQL **15 added `NULLS NOT DISTINCT`** for unique constraints and indexes, and we run 16:
```sql
CREATE UNIQUE INDEX driver_zone_capability_uq
    ON public.driver_zone_capability (driver_id, function, method, zone_id)
    NULLS NOT DISTINCT;
```
ONE index, one statement of the rule, no risk of the two partial indexes drifting apart or of someone
deleting the one that "looks redundant".

⚠ **This must be proven by a container test against real PostgreSQL before it is trusted** — inserting
the same `(driver, function, method, NULL)` twice and asserting the second is refused. A uniqueness rule
that silently does not hold is precisely 059's NP8 (a nullable `subject_key`) and leaves a green suite
with a feature that looks like it works.

---

## D3. ✅ IMPLEMENTED (062). Capability is a FILTER, never a score.
**Evidence (agent 06):** Bringg's and Onfleet's public docs both show the same pattern — skills live on
the worker, tasks declare required skills, matching is a filter, and **"no match" is explicit UX**
(Bringg: *"add a driver with the required skills… or reschedule"*) rather than silent failure.

**Consequence:** the coverage-gap screen is not a nice-to-have. A zone with nobody who can serve it must
be visible BEFORE an order is affected — which is exactly what 056's existing `readiness` screen was
built to do, and it already renders `no_zone` as a blocking reason. It extends rather than gets rebuilt.

---

## D4. UNRESOLVED — PostGIS: no for zones (D1), open for route sequencing.
Agent 02 confirms PostGIS 3.4.6 is available on RDS PostgreSQL 16 via plain `CREATE EXTENSION postgis`
(needs `rds_superuser`), and wants it for KNN/clustering once coordinates exist. Agent 06 says it buys
nothing for the capability matrix and flags a real operational tax: **PostGIS extension upgrades must be
manually sequenced around every RDS major-version engine upgrade.**

Both are right about their own question. To settle in planning, with the deciding factor being whether
sequencing genuinely needs `ST_ClusterKMeans`/KNN or whether Haversine-in-Go is enough — we already
compute Haversine for zone→ring suggestion and store `delivery_zone.hub_distance_km`.

---

## D5. Geodata: G-NAF, and shops are geocoded by hand once.
**Evidence (agent 02):** G-NAF is free, CC BY 4.0, official AU government street-level geocode data —
**the same lineage as the `locality` CSV we already ship** — with existing Postgres loaders. Plan:
geocode each shop once as a back-office task; load full street-level G-NAF; geocode customer addresses
at save-time against G-NAF with a live-geocoder fallback for misses.

⚠ Google's Distance Matrix / Geocoding terms explicitly forbid storing or caching results. Any hosted
geocoder we pick must permit persistence, or the whole design fails on licence terms rather than on
engineering.

---

## D6. Route sequencing: no solver in phase 1.
**Evidence (agent 02):** the two rounds are different OR problems — collection is a single-vehicle TSP
over a *small, stable, known* shop set; same-day delivery is a CVRP/VRPTW over an arbitrary daily set.
At ≤10 drivers / ≤80 drops a day, nearest-neighbour or sweep plus a 2-opt cleanup is sufficient.
**OR-Tools has no official Go binding** (community wrappers only). VROOM (BSD-2, plain JSON HTTP, no
bindings needed) is the phase-2 upgrade, paired with self-hosted OSRM/Valhalla for a real drive-time
matrix. Cost: ~$0–20/month now, $30–60/month for the phase-2 sidecar.

---

## D7. Navigation hand-off is PER-STOP, not per-route.
**Evidence (agent 02):** Google Maps' URL scheme caps at 3 waypoints on mobile (9 elsewhere); Apple
Maps' supports origin+destination only, no waypoints; Waze multi-stop unconfirmed. So the driver app
owns the sequence and "Navigate" targets only the current stop. OpenFreeMap is MIT-licensed, commercial
use permitted, no rate limit, but is **tiles only** — no routing, no geocoding.

---

## D8. Vehicles are their own entity, with an assignment join table.
**Evidence (agent 03):** validated against Fleetio, Samsara, Geotab. Shape mirrors the
one-open-row/partial-unique-index pattern `driver_duty_session` already uses. One table expresses both
"Effy-owned, assigned for this shift" and "driver-owned, used for work" — **distinguished by data, not
by two code paths.**

---

## D9. Driver licence CLASS must be stored. Two compliance areas must NOT be built.
**Missing (agent 03):** we hold `licence_reference` + `licence_expires_on` but no class (C/LR/MR/HR), so
nothing can enforce "may this driver legally drive this vehicle" — a WorkSafe Victoria OHS duty. Class C
covers our vans today; the field should exist so the check is real rather than assumed.

**Do NOT build (agent 03, verified thresholds):** Chain of Responsibility under the HVNL applies only
above **4.5t GVM**; heavy-vehicle fatigue law (work diaries, BFM/AFM) only above **12t GVM**. Neither
reaches our vans. **This is scope deleted before it is written.**

**Unresolved, for a person not a codebase:** which Modern Award covers our drivers (turns on "is
transport the core business" — a retailer running its own fleet is a genuine edge case), and whether
Victoria's Food Safety Supervisor requirement reaches a delivery-only operation. Do not build a
per-driver FSS field speculatively.

---

## D10. Location capture is not free — consent lands with it or we do not collect.
**Verified locally, not from research:** the driver app declares NO location permission on either
platform, while `POST /driver/v1/location` and `driver_duty_session.last_location_*` both still exist.
A receiver with no sender — 059's defect inverted. See audit-00 for the full finding and the four things
that must land in the same change if we ever do capture position.

---

## D11. Real-time: push-to-wake + fetch-the-truth, keyed by a monotonic revision. SSE is a SPIKE, not a given.

**The agreed core (agent 04, and it is well-evidenced):**
- **Never put the work in the push.** FCM is best-effort and unordered; a notification is a HINT. The
  app fetches the truth from one combined endpoint. Uber's own write-up backs the general shape: they
  replaced polling — which was **80% of backend API-gateway requests at peak** — with a push framework,
  and chose **SSE over WebSocket for "security, support in mobile SDKs, and binary size impact"**, only
  moving to gRPC bidi at 600K–1.5M concurrent connections. We will never have that problem at <10.
- **FCM high-priority data messages are the platform-sanctioned way through Doze** — Android's own docs
  say a high-priority message gets a temporary network + wake-lock exemption even mid-Doze, while a
  normal-priority one waits for an increasingly rare maintenance window. This is the justification for
  push-to-wake rather than a persistent connection.
- **Cost is not the deciding factor.** Every option (SSE-on-Fargate, API Gateway WebSocket, AppSync,
  IoT Core MQTT) is under ~$0.10/month at 10 devices. It is an architectural-reuse decision.
- **API Gateway WebSocket is ruled out on merit, not price**: a hard 10-minute idle timeout and 2-hour
  max connection lifetime mean it needs the *same* mandatory client reconnect logic as SSE, for no
  benefit, plus `$connect`/`$disconnect` Lambdas and a connection store we do not have.

**Reuse 027's cart-sync design for the client mirror.** It is shipped and proven: a **monotonic
`revision`** so a slow response can never overwrite a newer state, a **`changeId` per shopper ACTION
(not per attempt)** so a retry cannot apply twice, and **absolute values rather than deltas** so
debounced writes are safe. That is precisely the semantics a driver's task list needs.

### ⚠ VERIFIED LOCALLY — "reuses the proven 058 pattern" is TRUE FOR THE SERVER HALF ONLY
`apps/driver-mobile/gradle/libs.versions.toml` pins **Ktor 3.5.1** and declares
`ktor-client-core/android/darwin/contentNegotiation/auth/logging/serialization-json`. It does **NOT**
declare `ktor-client-sse`. A repo-wide search finds **no SSE usage in any KMP app, ever**. The only SSE
consumer we have is `packages/web-kit/src/runtime/live.ts` — a **browser `EventSource`**, which shares
no code path with Ktor or Darwin.

So 058 proved SSE on the **Go/Fargate server** (ALB idle timeout, `WriteTimeout` cleared per-request via
`http.NewResponseController`) and in the **browser**. It proved nothing on **KMP/iOS**.

Agent 04 flags this itself as its one open technical risk, and cites documented Ktor **Darwin
WebSocket** bugs (TLS/`wss://`, a frame-size bug, pong handling KTOR-5540) severe enough that one KMP
project called WebSocket "fundamentally unstable on Apple platforms". Its reasoning that **SSE is
engine-agnostic in Ktor 3** ("SSE only requires ktor-client-core") is plausible and was **not confirmed
on a real device**.

⚠ **This is 024's VectorDrawable shape exactly**: a KMP SSE client would compile on both platforms, pass
every host test, and fail only where it actually runs. 058's own `WriteTimeout` defect was the same
shape, caught by reading config rather than by any test.

### Decision
1. **Ship push-to-wake + fetch-the-truth FIRST.** It needs no new transport: the FCM outbox (050/059)
   and a REST read already exist. Foreground freshness comes from a **poll on an interval** plus
   refresh-on-resume. At <10 drivers this is genuinely adequate, and the agent agrees cost is not the
   discriminator.
2. **SSE is a separate, later, de-risked step** gated on a **real-iOS-device spike** proving
   `ktor-client-sse` survives backgrounding, reconnect, and token refresh on Darwin. If the spike fails,
   we have lost a spike, not a slice.
3. A coarse background refresh (WorkManager / iOS Background App Refresh) is the safety net, never the
   primary path.

**What this buys:** requirement 3 ("updates in real time") is met on day one by push-to-wake, which is
what actually matters when the phone is in a pocket — and the genuinely risky part is isolated.

---

## D12. ✅ IMPLEMENTED (063). ⭐ THE KEYSTONE: this is a WAVE PLANNER, not a continuous dispatcher.

**Evidence (agent 01):** wave/cutoff-driven dispatch — not continuous on-demand dispatch — is the
correct reference model, confirmed against WMS wave-planning literature (release triggered by a carrier
cutoff, orders grouped by shared deadline and zone, **work generated only at the wave, not before**) and
Instacart's ~1-minute batch replan cadence. Both are far closer to Effy than any food-delivery system.

**This converges with the codebase finding recorded in audit-00.** `delivery_collection_run` already
stores 1..n wall-clock run times, and `SameDayCutoff` already answers the checkout question *"can this
shopper still get same-day?"*. The dispatch engine is the **same schedule read in the opposite
direction**: given the 14:00 run and the prep buffer, which packages must be collected by then, and when
must a driver leave?

⚠ **Two independent lines of evidence — external practice and our own schema — point at the same shape.
That is the strongest signal in this whole research pass, and it should anchor the design.** 049's sweep
was a `rate(1 minute)` continuous scavenger, which is why it had no notion of a deadline and no reason to
batch. A wave planner has both, for free, because a wave IS a deadline and a batch.

**Consequence:** the trigger is not a timer polling for orphan work. It is
`for each active collection run: at (run_time − buffer − planning_lead), plan the wave`.

---

## D13. ✅ IMPLEMENTED (063). Push-assign, not offer/accept — because our drivers are employees.
**Evidence (agent 01):** **no system reviewed uses offer/accept for an employee fleet.** That mechanic
exists specifically to manage **gig-worker consent**. Tookan, Deliveroo's Frank and DoorDash's DeepRed
broadcast-or-offer because their workers are independent contractors who can decline. **Onfleet and
Circuit for Teams — which serve owned/employed fleets — push-assign.**

Effy's shift employees get **push assignment as the primary mechanic**. Offer/fallback is correct only
on the **failure-recovery path** (a driver goes down mid-run), mirroring DoorDash's "offer the next
candidate until picked up".

**This settles a question the brief left open** and deletes a whole feature (accept/decline UI, timeout
handling, re-offer loops) before it is written.

---

## D14. ✅ IMPLEMENTED (063), WITH ONE CHANGE. Algorithm: hard gates, then ~~proximity~~ LOAD BALANCE. No solver.

⚠ **The tie-break is not proximity, because D20 cut all location data.** Settled by operator decision during 063's specification: the eligible driver carrying the **fewest packages that day** wins, tied stably on driver id. `pickByLoad` in `@effy/edge-shared`; FR-014b forbids any distance proxy returning, and `no-location.guard.test.ts` makes that mechanical.
**Evidence (agent 01):** DoorDash's rejection of greedy-nearest-driver **does not transfer to us**.
DeepRed (ML + Gurobi MIP) exists to protect aggregate marketplace efficiency across **thousands of
concurrent, competing orders** — a problem one hub and <10 drivers does not have. ⚠ **DoorDash itself
falls back to plain greedy-nearest under time pressure and calls it merely "suboptimal", not wrong.**

Shape:
```
ELIGIBILITY gate  → driver_zone_capability matches (zone, function, method)   [D2]
                    AND driver.status = 'active' AND open duty session
                    AND licence not expired                                    [D9]
                    AND an assigned vehicle whose compliance is current        [D8]
CAPACITY gate     → vehicle capacity not exceeded by the wave's packages
FEASIBILITY gate  → the round can finish before the cutoff AND before shift end
THEN score        → proximity / insertion cost. Lowest wins. Push-assign.
```
**Hard gates are filters and MUST NOT be weights.** A driver who cannot legally drive, or cannot reach
the cutoff, is not "a worse candidate" — they are not a candidate. Agent 06 independently found the same
rule for capabilities (D3), and Bringg/Onfleet both make "no match" explicit UX rather than silent
failure.

⚠ **Nobody publishes scoring weights.** Across Onfleet, Bringg, OptimoRoute, Routific, DoorDash and the
India-market write-ups, "proximity + capacity + time-window + load" is universal as a set of *named
factors*, and every vendor treats the combining weights as proprietary. **We set our own simple
hard-gate-then-proximity rule and tune by observation.** Do not invent a formula and dress it as
industry practice.

---

## D15. ✅ IMPLEMENTED (063). Manage by exception — the dispatcher console is part of the engine, not a nice-to-have.
**Evidence (agent 01):** Bringg's explicit phrase is "manage by exception". **Shipday states a ~30–50
orders/day threshold before automation becomes necessary** — Effy's volume sits *below* where even an SMB
vendor says an engine is needed. The industry's own philosophy at ANY scale is to surface exceptions to a
human rather than have the algorithm try to own every case.

**We already have the pattern.** 056 built exactly this for driver stand-down: derive the problem state
on read, show the operator an itemised list, and make the resolving action an explicit human decision
because it asserts something about the physical world no query can know. The dispatch console extends
that rather than inventing it.

⚠ **This is also the honest answer to "do we even need an engine?"** At current volume a dispatcher with
a good screen would cope. The engine earns its place by making the *common* case automatic and the
*exceptional* case visible — not by being clever.

---

## D16. ⭐ THREE CUSTODY EVENTS, THREE DIFFERENT MECHANISMS. Not one polymorphic "proof".
**Evidence (agent 05):** shop pickup and hub check-in are both **scan-reconciliation** problems —
expected manifest vs scanned count, with a hard exception flow on mismatch. No signature, no
customer-facing photo. Customer delivery is a **handoff-authorization** problem — a one-time PIN when
attended, photo-at-location when contactless was pre-authorized.

⚠ **This contradicts what 049 built, and the contradiction is the point.** 049 had ONE
`proof_of_delivery` table with a `method IN ('photo','code','signature','contactless')` enum, reachable
only from a `delivery_task`. Generalising that shape across all three events would **blur a scan-count
control into a doorstep-authorization control** — two different questions ("did I take everything the
shop handed me?" vs "was this order lawfully handed over?") forced through one table that can answer
neither well.

**Consequence:** the data model gets a reconciliation record for pickup/check-in and a separate
handover record for delivery. Resist the urge to unify them.

---

## D17. Retention is OUR number to pick and document. The law does not supply one.
**Evidence (agent 05, VERIFIED against OAIC):** **APP 11.2 sets no specific retention period** — the
duty is "reasonable steps to destroy when no longer needed", which is fact-dependent. And **a doorstep
photo showing a face or an identifiable house IS personal information** under the Privacy Act.

**Consequence:** we choose a window tied to our own chargeback/dispute period, write it down, and
**enforce it with a purge job that actually runs**. A retention policy with no deleter is a policy that
says the opposite of what it claims. Treat every POD photo as personal information by default —
private bucket, presigned time-limited GET, access audited (055's refund-attribution lesson).

---

## D18. Copy Australia Post's Safe Drop model verbatim. Do not invent language.
**Evidence (agent 05, VERIFIED):** ATL/Safe Drop is a customer **preference, not a guarantee**; the
driver retains final on-the-day judgement of whether the spot is actually safe; liability transfers to
the recipient once left under ATL.

**Consequence:** contactless is authorised by the CUSTOMER in advance (at checkout or on the address),
and the DRIVER still refuses it at the door if the spot is unsafe. Both halves are required — a
customer preference that a driver cannot override is how goods end up on a footpath.

---

## D19. ⚠ RESEARCH LIMITS — three things are NOT settled and must not be treated as if they were.
The session's shared WebSearch quota (200) was exhausted early; most primary legal sources (AustLII,
legislation.vic.gov.au, legislation.gov.au) actively block automated fetch. Agents flagged claims as
VERIFIED / SEARCH-SYNTHESIS / UNVERIFIED rather than guessing, which is correct behaviour, but it leaves
three open items:

1. **Victorian alcohol delivery law** (Liquor Control Reform Act 1998) — SEARCH-SYNTHESIS only; VCGLR's
   page 523'd. **Irrelevant today** (we sell groceries, not alcohol) but needs a real legal read before
   we ever sell restricted goods. Do not build age-verification on this synthesis.
2. **FSANZ Standard 3.2.2** — VERIFIED that it requires ≤5°C / ≥60°C at receipt, and that it explicitly
   permits a "departure/arrival within an agreed time limit" as an ALTERNATIVE to continuous logging.
   **NOT verified:** whether any last-mile grocery temperature-logging mandate reaches us. Get
   food-safety advice; do not build a cold-chain logging feature on an unverified mandate.
3. **Which Modern Award covers our drivers** (agent 03) — turns on "is transport the core business",
   a genuine edge case for a retailer running its own fleet. A question for a person.

**No current breach was found for the platform as scoped.** That is not the same as "cleared".

---

# ═══ OPERATOR DECISIONS, 2026-09-20 — these SUPERSEDE earlier entries where they conflict ═══

## D20. ✅ IMPLEMENTED (063). ⭐ NO LOCATION DATA. Sequencing is an ORDERING problem, not a geometry problem.
**Operator direction:** *"no need! we just need to track the status of task! no need to track locations.
but routing can be simply implemented so that we show simple order to pickup… just order the task list
according to the task status, time and shop or customer delivery zones. no need to have exact location."*

**This supersedes D5, D6 and most of research-02.** The whole geodata strand is cut:

| Cut | Was justified by | Now unnecessary because |
|---|---|---|
| Street-level **G-NAF** load | geocoding customer addresses | nothing computes distance |
| Customer address **geocoding** | delivery sequencing | ordering is by zone + time |
| **Distance/time matrices** (OSRM, Valhalla, Google, Mapbox) | insertion cost | no cost function |
| **Nearest-neighbour + 2-opt** | stop sequencing | deterministic sort instead |
| **PostGIS** entirely | KNN / clustering | ⚠ D4's open question is now CLOSED: **no** |
| **VROOM / OR-Tools** phase-2 path | scale upgrade | not on the roadmap |
| `driver_duty_session.last_location_*` | nearest-driver scoring | **nothing writes it; see D22** |

**The sort key replaces the cost function.** A task list is ordered by:
1. **task status** — what is actionable now versus already done,
2. **time constraint** — collection-run cutoff, promised window,
3. **zone** — all stops in one zone grouped together,
4. **shop** — same-shop packages adjacent (049 already did this and it was the one sensible thing
   its sweep did).

Deterministic, explainable to a driver, and testable without a single coordinate.

⚠ **The trade is real and should be written down rather than discovered:** a driver may zigzag *within*
a zone, because nothing knows which of two addresses in the same suburb is closer. At one metro with
<10 drivers that is an acceptable cost, and it is consistent with "manage by exception" (D15) — the
dispatcher reorders when it matters. **Revisit only when a driver complains about a specific round, not
on principle.**

---

## D21. Shops get an ADDRESS. They do NOT get coordinates.
**Operator direction:** mock Melbourne addresses for shops, for testing.

`public.shop` gains address fields (line1, line2, suburb, postcode, state) — a driver has to know where
to drive, and the app hands off to the device's maps app with an address string (D7: per-stop, not
per-route). **No `latitude`/`longitude` columns**, because after D20 nothing would read them.

⚠ **Adding coordinates "for later" is exactly the defect shape this slice was created to clean up.**
049 left `driver.delivery_zone_id` unread by any code; 059 found `device_token.platform` contradicting
the live contract; and audit-00 records `POST /driver/v1/location` as a receiver with no sender. **A
column nothing reads is a decision made in advance for a feature nobody has specified.** When something
needs geometry, that slice adds the columns and the loader together.

**Mock addresses are SEED data, not production data** — `db/seeds/`, beside the existing
`db/seeds/047_delivery_dev.sql`. They must be plainly fictional and must not name a real business. The
constitution's prohibited-values rule is about *inferring* real-world identifiers; the operator has
explicitly authorised invented test addresses, which is a different thing.

---

## D22. `POST /driver/v1/location` and `driver_duty_session.last_location_*` are REMOVED.
D10 asked whether to collect driver position and what consent it would require. **The operator's answer
is no.** So the correct action is not to leave the plumbing dormant — it is to delete it.

- Drop the route from `edge-api/driver/serverless.yml` and its handler + service function.
- Drop `last_location_lat`, `last_location_lng`, `last_location_at` from `driver_duty_session`.

**This closes the trap audit-00 identified** — the moment anyone added a location permission to make a
map work, the platform would have begun collecting employee position with no consent record, no notice
and no retention rule, and nothing would have failed. Removing the receiver removes the trap. No consent
record is needed because nothing is collected.

---

## D23. Shifts: ad-hoc clock-in, plus an expected end time. No roster.
**Operator direction:** *"i don't know. we can have any or both."* — so this is my call, made and stated
rather than deferred.

**Ad-hoc clock-in** (what `driver_duty_session` already does) **plus one new nullable field:
`expected_end_at`**, set by the driver when going on duty or by back-office.

**Why not a roster:** a roster is a second source of truth about who is working. At <10 drivers it would
be maintained by hand, drift from reality, and then the engine would have to decide which to believe —
the roster or the open duty session. One of them wins and the other becomes a lie.

**Why an end time is nonetheless required:** the FEASIBILITY gate (D14) asks *"can this driver finish
before the cutoff and before they go home?"* Without an end time the second half of that question is
unanswerable, and the engine would cheerfully hand someone a round they cannot finish — which is 049's
failure in a new costume. **Nullable, and when it is null the gate tests only the cutoff** and says so,
rather than inventing a default shift length.

---

## D24. Vehicles: build the full feature, seed all types.
**Operator direction:** *"we should have all the related features. we can also have mock vehicle list of
all the types."* Confirms D8 in full — register, detail, assign/return, compliance dates, capacity,
refrigeration, status lifecycle — with a seeded fixture covering each vehicle type. Seeds live in
`db/seeds/` and are plainly fictional (plates included).
