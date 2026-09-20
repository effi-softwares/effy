# Phase 1 — Data Model: Fleet Foundations (061)

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

House style (007/009/019/047/056): everything operational in `public`; raw SQL; **text CHECK enums**, no
native PG enums; an index on every FK; `numeric` only for money (**none here** — the driver domain has
never carried currency, 049 FR-013); `COMMENT ON` everything.

**One forward-only migration.** Goose, `db/migrations/<ts>_fleet_foundations.sql`.

---

## 1. `public.vehicle` — NEW

A vehicle Effy runs, whoever owns it.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `registration_plate` | `text NOT NULL` | ⚠ unique among **non-retired** vehicles — partial index, §6 |
| `make`, `model` | `text NOT NULL` | |
| `year` | `int` | `CHECK (year BETWEEN 1950 AND 2100)` |
| `body_type` | `text NOT NULL` | `CHECK IN ('van','ute','truck_light','car','motorcycle','bicycle')` |
| `fuel_type` | `text` | `CHECK IN ('petrol','diesel','hybrid','electric','none')` |
| `ownership` | `text NOT NULL` | **`CHECK IN ('effy_owned','driver_owned')`** — FR-005 |
| `payload_kg` | `int` | `CHECK (payload_kg > 0)` |
| `load_volume_litres` | `int` | `CHECK (load_volume_litres > 0)` |
| `crate_capacity` | `int` | `CHECK (crate_capacity >= 0)` |
| `can_carry_chilled` | `boolean NOT NULL DEFAULT false` | FR-003 |
| `can_carry_frozen` | `boolean NOT NULL DEFAULT false` | FR-003 |
| `registration_expires_on` | `date` | FR-004 |
| `insurance_policy_reference` | `text` | |
| `insurance_expires_on` | `date` | FR-004 |
| `roadworthy_expires_on` | `date` | FR-004 |
| `odometer_km` | `int` | `CHECK (odometer_km >= 0)`; last known reading |
| `status` | `text NOT NULL DEFAULT 'active'` | `CHECK IN ('active','off_road','retired')` |
| `status_reason` | `text` | |
| `notes` | `text` | |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

⚠ **ONE TABLE FOR BOTH OWNERSHIP MODELS (FR-005).** `ownership` is a *fact about the vehicle*, not a
branch in the code. A driver-owned van and an Effy-owned van are assigned, inspected, retired and
reported on identically. Two tables — or two features — would duplicate every one of those behaviours
and then drift.

⚠ **NO `latitude` / `longitude`, AND NO TELEMETRY COLUMNS (FR-031, D20/D21).** Nothing in the platform
computes distance. `odometer_km` is a maintenance figure a human types, not a position.

⚠ **`off_road` is NOT `retired`.** Off-road is temporary (in the workshop) and the vehicle comes back;
retired is terminal and the record survives for history (FR-008). Collapsing them would make "where did
the van go?" unanswerable.

---

## 2. `public.vehicle_holding` — NEW

One period during which one driver had one vehicle. **Named "holding", not "assignment"** — slice C will
introduce *work* assignment, and two things called assignment in one domain is how a codebase starts
lying to its readers.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `vehicle_id` | `uuid NOT NULL` → `vehicle` `ON DELETE RESTRICT` | history outlives nothing |
| `driver_id` | `uuid NOT NULL` → `driver` `ON DELETE RESTRICT` | |
| `started_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `ended_at` | `timestamptz` | **NULL = still held** |
| `odometer_start_km` | `int` | `CHECK (odometer_start_km >= 0)` |
| `odometer_end_km` | `int` | |
| `issued_by_sub`, `returned_by_sub` | `text` | which operator, for attribution |
| `note` | `text` | |

**Constraints that carry the requirements:**
```
CONSTRAINT vehicle_holding_odo_ck CHECK (
  odometer_end_km IS NULL OR odometer_start_km IS NULL
  OR odometer_end_km >= odometer_start_km )            -- FR-018
CONSTRAINT vehicle_holding_period_ck CHECK (
  ended_at IS NULL OR ended_at >= started_at )
```
```sql
-- FR-012: one open holding per VEHICLE.   FR-013: one open holding per DRIVER.
CREATE UNIQUE INDEX vehicle_holding_open_vehicle_uq
    ON public.vehicle_holding (vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX vehicle_holding_open_driver_uq
    ON public.vehicle_holding (driver_id)  WHERE ended_at IS NULL;
```
⚠ **These two indexes ARE requirements FR-012 and FR-013**, not an optimisation. A service-level check
is a read then a write, and two operators clicking together slip between them. `driver_duty_session_open_uq`
is the same shape and has held since 049. **Must be proven by a concurrent container test (R4).**

⚠ **There is deliberately no `driver.current_vehicle_id`.** The open holding row IS the answer. A second
place stating one fact is 033/052/053's recurring defect.

---

## 3. `public.driver` — ALTERED

| Change | Column | Notes |
|---|---|---|
| **ADD** | `licence_class text` | `CHECK IN ('C','LR','MR','HR')` — FR-021 |
| **DROP** | `vehicle_type` | superseded by `vehicle` (FR-005) |
| **DROP** | `vehicle_plate` | superseded by `vehicle.registration_plate` |
| **DROP** | `vehicle_registration_expires_on` | superseded by `vehicle.registration_expires_on` |

⚠ **The three drops are the point of the slice, not tidy-up.** They are free-text strings about a thing
that now exists properly. Leaving them would give the platform two answers to "what does this driver
drive", and 054's fourteen hand-written copies of one rule is what that becomes.

⚠ **`delivery_zone_id` is NOT touched** — slice B replaces it with `driver_zone_capability`. Changing it
here would put slice B's decision in slice A's migration.

---

## 4. `public.driver_duty_session` — ALTERED

| Change | Column | Notes |
|---|---|---|
| **ADD** | `expected_end_at timestamptz` | **nullable** — FR-032 |
| **DROP** | `last_location_lat` | FR-036 |
| **DROP** | `last_location_lng` | FR-036 |
| **DROP** | `last_location_at` | FR-036 |

⚠ **`expected_end_at` is nullable ON PURPOSE, and NULL means UNKNOWN (FR-033).** It must never be
defaulted to a shift length. Slice C's feasibility gate asks "can this driver finish before they go
home"; with NULL the honest answer is "we don't know", and the gate must say so rather than test against
an invented number. A default here would make a guess look like a fact at exactly the moment it decides
someone's workload.

⚠ **The three location drops are verified-dead surface** (R6): no mobile caller, no location permission
on either platform, no other reader.

---

## 5. `public.shop` — ALTERED

| Change | Column | Notes |
|---|---|---|
| **ADD** | `address_line1 text` | FR-029 |
| **ADD** | `address_line2 text` | |
| **ADD** | `suburb text` | |
| **ADD** | `postcode text` | `CHECK (postcode ~ '^[0-9]{4}$')` |
| **ADD** | `state text` | `CHECK IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')` |

⚠ **NO `latitude` / `longitude` (FR-031).** Nothing computes distance after D20. A column nothing reads
is a design decision made in advance for an unspecified feature — which is the defect this whole
programme was created to clean up (`driver.delivery_zone_id`, `device_token.platform`,
`POST /driver/v1/location`).

⚠ **Nullable, not `NOT NULL`.** Shops exist today without addresses, and a `NOT NULL` would either fail
the migration or force a fabricated value into production rows. FR-030 makes the gap **visible** instead —
which is the honest treatment of a fact nobody has supplied yet.

⚠ **A shop address MUST NOT reach a customer surface.** Hidden fulfilment is a platform invariant, not a
preference. Guarded in tasks.

---

## 6. Indexes

```sql
CREATE UNIQUE INDEX vehicle_plate_active_uq                    -- FR-006
    ON public.vehicle (upper(registration_plate)) WHERE status <> 'retired';
CREATE INDEX vehicle_status_idx        ON public.vehicle (status);
CREATE INDEX vehicle_holding_vehicle_idx ON public.vehicle_holding (vehicle_id);
CREATE INDEX vehicle_holding_driver_idx  ON public.vehicle_holding (driver_id);
```
⚠ **Plate uniqueness is scoped to non-retired and is case-insensitive.** A retired van's plate can be
legitimately reissued by the state to another vehicle years later; a blanket unique index would refuse a
real vehicle because of a record Effy keeps for history. And `abc123` and `ABC123` are the same plate to
everyone except a database.

---

## 7. Derived, never stored

| Fact | Derived from | Why not stored |
|---|---|---|
| Who holds a vehicle now | the open `vehicle_holding` row | a stored pointer can disagree with the rows |
| What a driver holds now | the same row, other side | same |
| Whether a driver can be given work | `BLOCKED_REASONS` over driver + holding + vehicle | 027's counted-not-stored rule, 4th application |
| Whether a vehicle is compliant | its three expiry dates vs today | a stored flag goes stale silently at midnight |

⚠ **Compliance is time-dependent, so it cannot be a column.** A vehicle that was compliant when the row
was written is not compliant tomorrow, and nothing would update it. Evaluate on read.

---

## 8. Audit

Reuses `admin.audit_log` and 056's `recordAudit` — no second audit trail (FR-023).

Actions: `vehicle.created` · `vehicle.updated` · `vehicle.status_changed` · `vehicle.holding_issued` ·
`vehicle.holding_returned` · plus the existing `driver.*`.

⚠ **The detail records WHICH fields changed, never a personal-contact VALUE (FR-024).** An emergency
contact is a third party who never dealt with Effy. 056 established this and it is not re-litigated.

---

## 9. Migration ordering

```
1. CREATE public.vehicle                       (no dependencies)
2. CREATE public.vehicle_holding               (FKs → vehicle, driver)
3. ALTER  public.driver           ADD licence_class
4. ALTER  public.driver           DROP the three vehicle_* columns
5. ALTER  public.driver_duty_session ADD expected_end_at
6. ALTER  public.driver_duty_session DROP the three last_location_* columns
7. ALTER  public.shop             ADD the five address columns
```
⚠ **Steps 4 and 6 are DESTRUCTIVE and irreversible in data.** The Down restores the *shape* only (003's
dev-only single-step rule). Any free-text vehicle string on a driver row is discarded — acceptable
because those rows are dev fixtures and the data has no home in the new model; **called out in the
migration header rather than discovered on a rollback.**
