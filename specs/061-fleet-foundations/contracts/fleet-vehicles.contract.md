# Contract — Fleet: vehicles, holdings, driver & shop extensions (061)

**Services**: `apis/edge-api/fleet` (new vehicle domain) · `apis/edge-api/admin` (shop fields only) ·
`apis/edge-api/driver` (duty change + one removal).
**Shared types**: `packages/shared-types/src/driver.ts` (extend) — back-office-only, not in the KMP
driver contract aggregator.

**Authorization** — unchanged from 056 and enforced per route by the gateway authorizer:
- **Read** = any active back-office staff member, **including `csa`**.
- **Mutate** = `admin` / `manager` only.
- ⚠ Every `/fleet/v1/*` route carries the **back-office** authorizer. `edge-fleet`'s
  `config.contract.test.ts` asserts this **exhaustively over the real `serverless.yml`**, so a new route
  added without one fails the suite rather than quietly becoming public.

⚠ **No money in any payload.** The driver domain has never carried currency (049 FR-013) and this
feature does not introduce it — not a purchase price, not a lease cost, not a fuel figure.

---

## A. Vehicle register — `edge-fleet`, NEW routes

| Method | Path | Gate | Purpose |
|---|---|---|---|
| `GET` | `/fleet/v1/vehicles` | read | the register, filterable by status / refrigeration / compliance |
| `POST` | `/fleet/v1/vehicles` | mutate | create (FR-001…FR-005) |
| `GET` | `/fleet/v1/vehicles/{vehicleId}` | read | detail + current holder + holding history (FR-016) |
| `PATCH` | `/fleet/v1/vehicles/{vehicleId}` | mutate | edit (FR-007) |
| `POST` | `/fleet/v1/vehicles/{vehicleId}/status` | mutate | active ↔ off_road ↔ retired (FR-008) |
| `POST` | `/fleet/v1/vehicles/{vehicleId}/holdings` | mutate | issue to a driver (FR-010) |
| `POST` | `/fleet/v1/vehicles/{vehicleId}/holdings/current/return` | mutate | take it back (FR-011) |

**7 new functions → `edge-fleet` goes 12 → 19.** Comfortably inside the CloudFormation budget that
forced 056 to create this service (research R2).

### Key payload shapes

`VehicleListItem` — ⚠ deliberately carries **`complianceIssues: string[]`**, so FR-009 is answerable
*without opening a record*:
```
id · registrationPlate · make · model · bodyType · ownership
· canCarryChilled · canCarryFrozen · status
· currentHolderDriverId | null · currentHolderName | null
· complianceIssues: ('registration_expired'|'insurance_expired'|'roadworthy_expired')[]
```

`VehicleDetail` — the above plus year, fuelType, payloadKg, loadVolumeLitres, crateCapacity, the three
expiry dates, insurancePolicyReference, odometerKm, statusReason, notes, timestamps, and:
```
holdings: { id, driverId, driverName, startedAt, endedAt|null,
            odometerStartKm|null, odometerEndKm|null, note|null }[]   -- newest first (FR-016)
```

`IssueHoldingRequest` → `{ driverId, odometerStartKm?, note? }`
`ReturnHoldingRequest` → `{ odometerEndKm?, note? }`

### Refusals — each names the situation, never a generic failure

| Situation | Refusal | Requirement |
|---|---|---|
| vehicle already held | `409` naming the **current holder** | FR-014 |
| driver already holds one | `409` naming the **vehicle they hold** | FR-014 |
| vehicle is retired | `409` "this vehicle is retired" | FR-015 |
| closing odometer < opening | `422` on `odometerEndKm` | FR-018 |
| duplicate plate among non-retired | `409` on `registrationPlate` | FR-006 |
| driver not active | `409` naming the employment status | FR-027 |

⚠ **A 409 must say which driver or which vehicle.** 053 shipped a console where every refusal collapsed
into one generic sentence because the screen tested `e instanceof Error` while the client throws a plain
object — the server got it right and the UI discarded it. The field list is the payload that makes these
actionable; the console must render it.

---

## B. Driver record — `edge-fleet`, EXISTING routes extended

`AdminDriverProfile` and `AdminDriverUpdateRequest` gain **`licenceClass`** (FR-021) and a read-only
**`currentVehicle: { id, registrationPlate, make, model } | null`** (FR-017).

⚠ **`AdminDriverUpdateRequest` keeps 056's presence-not-value semantics**: a key present with `null`
clears the field; a key absent leaves it alone (FR-022). 056 fixed a real defect here — `COALESCE($n,
col)` cannot distinguish "leave alone" from "clear", so a zone once set was permanent. **Do not "clean"
the request object; dropping nulls silently restores that defect.**

`AdminDriverListItem` and the readiness payload gain two `blockedReasons` values:
**`no_vehicle`** and **`vehicle_non_compliant`** (FR-027).

⚠ **`DriverBlockedReason` is a widening of a live enum.** 053, 056 and 057 each shipped a defect through
one. **Every reader must be audited** — `edge-fleet`, `apps/back-office` (`BLOCKED_LABEL` is a
`Record<DriverBlockedReason, string>` and a missing key renders nothing), and any test fixture.

---

## C. Shop address — `edge-admin`, EXISTING routes extended

`POST /admin/v1/shops` and `PATCH /admin/v1/shops/{shopId}` accept, and the detail read returns:
```
addressLine1 | addressLine2 | suburb | postcode | state    -- all optional (FR-029)
```
**Zero new functions.** `edge-admin` sits at 72 handlers / ~434 CloudFormation resources with
`versionFunctions: false` already spent (research R3).

⚠ **`postcode` is validated `^[0-9]{4}$`**, because slice C will match it against
`delivery_zone_postcode` and a malformed value there silently matches no zone — a shop nobody can be sent
to, with nothing failing.

⚠ **These fields MUST NOT appear on any customer-facing payload.** Hidden fulfilment is a platform
invariant (Principle V): a customer never learns which shop served them. Guarded by a source test.

---

## D. Duty — `edge-driver`, one change and one REMOVAL

**Changed** — `POST /driver/v1/duty` accepts an optional `expectedEndAt` when going on duty (FR-032).
`DutyResponse` and the back-office `OnDutyDriver` carry `expectedEndAt: string | null`.

⚠ **`null` is rendered as "unknown", never as a number (FR-033).** A default shift length would make a
guess look like a fact at the moment it decides someone's workload.

**REMOVED** — `POST /driver/v1/location`, its handler, and `recordLocation` in the driver service.

⚠ **Verified safe (research R6)**: no caller in `apps/driver-mobile`, no location permission declared on
either platform, no other reader of the three columns. A receiver with no sender.

⚠ **`edge-driver`'s `config.contract.test.ts` gains a negative assertion** that no route path contains
`location` — the same shape as the "schedules nothing" guard added when 049's sweep was removed. A
removal without a guard is an invitation to restore it by resemblance.

---

## E. What this contract does NOT add

No task, round, assignment or dispatch interface (**FR-037**) · no shop or vehicle **coordinates**
(**FR-031**) · no driver **location** (**FR-035/036**) · no roster · no Chain-of-Responsibility or
fatigue fields · no per-driver food-safety field · no telematics · no customer-facing surface at all.
