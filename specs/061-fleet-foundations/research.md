# Phase 0 — Research: Fleet Foundations (061)

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

⚠ **The industry research for this whole programme was done up front**, before the spec, and lives in
[docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md) with six cited
reports (348 numbered requirements) in [docs/research/logistics/](../../docs/research/logistics/). This
file resolves only what is specific to **building slice A in this codebase** — it does not restate that
work.

---

## R1 — Which backend path? **Cold path, and it is not a close call.**

**Decision**: every new interface in this feature is a **cold-path TypeScript Lambda**.

**Rationale**: Principle III reserves the hot path for latency-sensitive *customer* reads and
transactions. Nothing here is customer-facing. A vehicle register, a licence field and a shop address
are low-frequency back-office CRUD, which the principle names as the cold path's purpose.

**Alternatives considered**: none seriously. Putting admin CRUD on the hot path is the exact inversion
Principle III forbids, and `core-api` has no reason to learn what a vehicle is.

⚠ **No Principle III exception is claimed by this feature.** The cutoff-rule language question recorded
in the audit (`SameDayCutoff` lives in Go while workers live in Node) belongs to **slice C**, not here.

---

## R2 — Which service? **`apis/edge-api/fleet`, and it has room.**

**Decision**: vehicles, vehicle holdings and the extended driver record go in the existing
**`edge-fleet`** service.

**Rationale**: 056 created `edge-fleet` precisely so driver management would not add to `edge-admin`'s
CloudFormation pressure. It already carries the back-office authorizer, the audit helper, the PII
discipline and a container-test harness against real migrations. Vehicles are the same audience, the
same permissions and the same domain.

**Measured, not assumed**: `edge-fleet` declares **12 handlers** today and already sets
`versionFunctions: false`. `edge-admin` sits at **72 handlers** and ~434/500 CloudFormation resources
with `versionFunctions: false` already spent — which is why 056 moved the driver routes out in the first
place. Adding a vehicle domain to `edge-fleet` is comfortable; adding it to `edge-admin` would not be.

**Alternatives considered**:
- *A new `edge-vehicles` service* — rejected. A service boundary should follow an audience or a
  deployment need, not a noun. Vehicles and drivers are read together on nearly every screen, and
  splitting them would mean two services joining each other's tables.
- *`edge-admin`* — rejected on the measured resource count above.

---

## R3 — Where does the shop address go? **`edge-admin`, as fields on the routes that already exist.**

**Decision**: extend the existing `/admin/v1/shops` create and update payloads and the shop detail read.
**No new routes, no new functions.**

**Rationale**: 009 already owns shop management in `edge-admin` with nine `/admin/v1/shops…` routes. A
shop's address is an attribute of a shop, not a new capability. Adding fields to an existing handler adds
**zero** CloudFormation resources, which matters at 434/500.

**Alternatives considered**: a shop-address route in `edge-fleet` — rejected. It would split ownership of
one entity across two services, and the next person editing a shop would have to know which half lives
where.

---

## R4 — "At most one" must be enforced by the DATABASE, not by a service.

**Decision**: two **partial unique indexes** on the vehicle-holding table:
one on `vehicle_id WHERE ended_at IS NULL`, one on `driver_id WHERE ended_at IS NULL`.

**Rationale**: FR-012 and FR-013 are concurrency claims. A service-level check is a read followed by a
write, and two operators clicking at the same moment slip between them. The platform already has the
right precedent: `driver_duty_session_open_uq` is exactly this shape and has held since 049.

⚠ **This must be proven by a container test that runs two assignments concurrently and asserts exactly
one succeeds.** 054 proved its stock floor this way; a uniqueness claim that has never been raced is an
assumption wearing a constraint's clothes.

**Alternatives considered**:
- *A `current_vehicle_id` column on `driver`* — rejected. Two places would then state one fact (the
  column and the open holding row) and they can disagree; this is 033/052/053's recurring defect shape.
- *Service-level locking* — rejected; the index is free, total, and cannot be forgotten by a new caller.

---

## R5 — Odometer validation is a row-local CHECK.

**Decision**: a table CHECK that the closing reading is `>=` the opening reading, tolerating NULL while
the holding is open.

**Rationale**: both readings live on the same row, so the rule is expressible in the schema and does not
need a service. FR-018 then holds for every writer, including a future one nobody has written yet.

---

## R6 — Removing the location capability is safe. **Verified, not assumed.**

**Decision**: drop `POST /driver/v1/location` (route, handler and service function) and drop
`last_location_lat`, `last_location_lng`, `last_location_at` from `driver_duty_session`.

**Verification performed**:
1. `grep` across `apps/driver-mobile/shared/src` for `v1/location`, `recordLocation`, `postLocation` —
   **no caller exists in the mobile app.**
2. The Android manifest declares `INTERNET`, `POST_NOTIFICATIONS`, `CAMERA` and nothing else; the iOS
   `Info.plist` declares no `NSLocation*` key. **The app cannot obtain a coordinate to send.**
3. No other service reads the three columns.

**So this is a receiver with no sender**, and removing it is a deletion of dead surface rather than a
behaviour change. ⚠ It is also the removal of a **trap**: the moment anyone added a location permission
to make a map work, the platform would have begun recording employee position with no notice, no consent
record and no retention rule, and **nothing would have failed**. That is 059's defect shape inverted.

**Alternatives considered**: leaving it dormant — rejected explicitly. 049 left `driver.delivery_zone_id`
read by nothing; 059 found `device_token.platform` quietly contradicting the live contract. Dormant
surface is how this platform accumulates defects.

---

## R7 — Licence class is a closed set, and the phase-1 rule is deliberately simple.

**Decision**: record the class as a constrained value (`C`, `LR`, `MR`, `HR`). The **assignment gate for
phase 1 asks only that the licence is current and the class is present**, because every Effy vehicle is
a light vehicle and an Australian Class C covers it.

**Rationale**: research verified the thresholds — Chain of Responsibility begins above **4.5t GVM** and
heavy-vehicle fatigue law above **12t GVM**, so neither reaches Effy's vans, and a class-to-vehicle
matrix would be a mapping with nothing to map. Recording the class now is what makes the rule
*checkable* rather than assumed, without inventing a rule we cannot justify.

⚠ **FR-027 still requires "licence class insufficient for the held vehicle" as a stated reason.** It is
implemented as a rule with a single current case, so the reason exists and is reachable the day a heavier
vehicle is added — rather than being retro-fitted into a gate that never had the concept.

---

## R8 — Blocked reasons extend an existing shared fragment.

**Decision**: extend `apis/edge-api/fleet/src/drivers/sql.ts`'s `BLOCKED_REASONS` rather than writing a
second predicate.

**Rationale**: it already emits an enumerated `text[]` of causes (`suspended`, `offboarded`, `no_zone`,
`licence_expired`) and its own comment explains why an enumerated cause beats a boolean — "cannot
receive work" without "why" is not actionable and the remedy differs per cause. FR-026/FR-027 add
`no_vehicle` and `vehicle_non_compliant` to the same array.

⚠ **`no_zone` stays in the list and stays meaningless until slice B**, when `driver_zone_capability`
replaces `driver.delivery_zone_id`. Noted here so the next slice does not read it as drift.

---

## R9 — Seeds follow the 047 precedent, and the fictional-address rule is explicit.

**Decision**: one seed file in `db/seeds/`, beside the existing `db/seeds/047_delivery_dev.sql`.

**Content**: shop addresses and a vehicle fixture covering every body type and every refrigeration
capability.

**The identifier rule, applied precisely**: the constitution governs values that *reach, name or bill a
person or organisation outside this repository*. A **suburb and a postcode are public geographic facts
that identify nobody**, and the seed needs real ones so postcode→zone matching can actually be exercised.
A **street line is not** — a real street number in a real street is somebody's home. So: real suburbs and
postcodes, plainly fictional street lines, no real business named, fictional registration plates.

---

## R10 — Testing: container tests against the real migration, from the first commit.

**Decision**: extend `apis/edge-api/fleet/src/schema.container.test.ts`.

**Rationale**: this feature's correctness is almost entirely **in the schema** — two partial unique
indexes, a CHECK, a uniqueness rule on plates. A mocked repository test cannot observe any of it. 056's
own experience is the argument: its concurrency token defect (`toISOString()` truncating to milliseconds
against PostgreSQL's microseconds) typechecked perfectly, passed every mocked test, and **would have made
every edit fail** — only the container test found it. Two wrong column names were caught the same way.

⚠ **Docker was down for the whole of 059 and for 058's authoring**, and 058's container tests — run
afterwards — found **three** defects a fully green suite had missed. Tasks must state plainly that the
container-backed proofs are unrun until Docker is up.

---

## R11 — What this feature must NOT touch

| Not touched | Why |
|---|---|
| `core-api` (the hot path) | nothing here is customer-facing (R1) |
| Any customer surface | a shop's address must never reach a customer — hidden fulfilment (Principle V) |
| `driver_zone_capability` | slice B |
| Any task, round or assignment concept | slice C; FR-037 |
| The driver app's 45 screens | slice D wires them; this feature touches only the duty flow |
| Design tokens | no new colour, no new radius; `tokens:check` must pass **unchanged** |
