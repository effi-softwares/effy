-- +goose Up
-- 061-fleet-foundations — slice A of the logistics rebuild.
--
-- Makes Effy able to DESCRIBE its fleet. It assigns nothing: there is no task, round, dispatch or
-- routing concept anywhere in this migration (spec FR-037). The wave planner is slice C.
--
-- Research deliverable: docs/logistics-engine-architecture.md §5 Slice A.
-- Decisions D8/D9/D20–D24: docs/research/logistics/decisions-01-running.md.
-- Data model, table by table: specs/061-fleet-foundations/data-model.md.
--
-- ⚠⚠ DESTRUCTIVE. This migration DROPS SIX COLUMNS and their values are gone for good:
--   public.driver.vehicle_type, .vehicle_plate, .vehicle_registration_expires_on
--       — free-text strings about a thing that now exists properly. Leaving them would give the
--         platform two answers to "what does this driver drive", which is 054's availability-in-
--         fourteen-places in miniature.
--   public.driver_duty_session.last_location_lat, .last_location_lng, .last_location_at
--       — the operator has decided Effy does not track driver position (D20). ⚠ VERIFIED DEAD
--         SURFACE, not a behaviour change: no caller exists in apps/driver-mobile, the Android
--         manifest declares only INTERNET/POST_NOTIFICATIONS/CAMERA, the iOS Info.plist declares no
--         NSLocation* key, and nothing else reads the columns. A receiver with no sender.
--         ⚠ Removing it closes a TRAP: the moment anyone added a location permission to make a map
--         work, the platform would have started recording employee position with no notice, no
--         consent record and no retention rule, and NOTHING WOULD HAVE FAILED. That is 059's
--         device_token.platform defect inverted.
-- The Down restores the SHAPE only. In dev these are fixtures; in any other environment, read this
-- paragraph before running it.
--
-- House style (007/009/019/047/056): everything operational in `public`; raw SQL; text CHECK enums,
-- no native PG enums and no triggers; an index on every FK; `numeric` only for money — THERE IS NONE
-- HERE, because the driver domain has never carried currency (049 FR-013) and this slice does not
-- introduce it; COMMENT ON everything.

-- ── The vehicle — a first-class entity, at last ──────────────────────────────────────────────────
CREATE TABLE public.vehicle (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_plate         text NOT NULL CHECK (btrim(registration_plate) <> ''),
    make                       text NOT NULL CHECK (btrim(make) <> ''),
    model                      text NOT NULL CHECK (btrim(model) <> ''),
    year                       int  CHECK (year BETWEEN 1950 AND 2100),
    body_type                  text NOT NULL
                                 CHECK (body_type IN ('van', 'ute', 'truck_light', 'car', 'motorcycle', 'bicycle')),
    fuel_type                  text CHECK (fuel_type IN ('petrol', 'diesel', 'hybrid', 'electric', 'none')),
    ownership                  text NOT NULL DEFAULT 'effy_owned'
                                 CHECK (ownership IN ('effy_owned', 'driver_owned')),
    payload_kg                 int  CHECK (payload_kg > 0),
    load_volume_litres         int  CHECK (load_volume_litres > 0),
    crate_capacity             int  CHECK (crate_capacity >= 0),
    can_carry_chilled          boolean NOT NULL DEFAULT false,
    can_carry_frozen           boolean NOT NULL DEFAULT false,
    registration_expires_on    date,
    insurance_policy_reference text,
    insurance_expires_on       date,
    roadworthy_expires_on      date,
    odometer_km                int  CHECK (odometer_km >= 0),
    status                     text NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'off_road', 'retired')),
    status_reason              text,
    notes                      text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.vehicle IS 'A vehicle Effy runs, whoever owns it (061). Replaces driver.vehicle_type/vehicle_plate, which were free text on the driver row and could not answer how many vans exist, which are roadworthy, or which can carry chilled goods.';
COMMENT ON COLUMN public.vehicle.ownership IS '⚠ ONE TABLE SERVES BOTH MODELS. A driver-owned van and an Effy-owned van are assigned, inspected, retired and reported on identically, so ownership is a FACT ABOUT THE VEHICLE and not a branch in the code. Two tables would duplicate every one of those behaviours and then drift.';
COMMENT ON COLUMN public.vehicle.can_carry_chilled IS 'Effy sells groceries, so refrigeration is a capability the fleet is selected on, not a detail.';
COMMENT ON COLUMN public.vehicle.can_carry_frozen IS 'See can_carry_chilled. A vehicle may do both, one, or neither.';
COMMENT ON COLUMN public.vehicle.status IS '⚠ `off_road` is NOT `retired`. Off-road is temporary (in the workshop) and the vehicle comes back; retired is terminal and the record survives for history. Collapsing them makes "where did the van go?" unanswerable.';
COMMENT ON COLUMN public.vehicle.odometer_km IS 'Last known reading, typed by a human at a handover. ⚠ NOT telemetry — this platform records no position and no journey (D20).';
COMMENT ON COLUMN public.vehicle.registration_expires_on IS 'Compliance is DERIVED ON READ from this and the two dates below. ⚠ Never store a `is_compliant` flag: it is time-dependent and would go stale silently at midnight with nothing to update it.';

-- ⚠ Plate uniqueness is scoped to NON-RETIRED and is CASE-INSENSITIVE. A retired van's plate can be
-- legitimately reissued by the state years later, and a blanket unique index would refuse a real
-- vehicle because of a record Effy keeps only for history. `abc123` and `ABC123` are the same plate
-- to everyone except a database.
CREATE UNIQUE INDEX vehicle_plate_active_uq ON public.vehicle (upper(registration_plate))
    WHERE status <> 'retired';
CREATE INDEX vehicle_status_idx ON public.vehicle (status);

-- ── The holding — one driver had one vehicle for a period ────────────────────────────────────────
-- ⚠ Called a HOLDING, not an assignment. Slice C introduces WORK assignment, and two things called
-- assignment in one domain is how a codebase starts lying to its readers.
CREATE TABLE public.vehicle_holding (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id         uuid NOT NULL REFERENCES public.vehicle (id) ON DELETE RESTRICT,
    driver_id          uuid NOT NULL REFERENCES public.driver  (id) ON DELETE RESTRICT,
    started_at         timestamptz NOT NULL DEFAULT now(),
    ended_at           timestamptz,
    odometer_start_km  int CHECK (odometer_start_km >= 0),
    odometer_end_km    int CHECK (odometer_end_km   >= 0),
    issued_by_sub      text,
    returned_by_sub    text,
    note               text,
    -- FR-018: a closing reading below the opening one is physically impossible.
    CONSTRAINT vehicle_holding_odo_ck CHECK (
        odometer_end_km IS NULL OR odometer_start_km IS NULL OR odometer_end_km >= odometer_start_km
    ),
    CONSTRAINT vehicle_holding_period_ck CHECK (ended_at IS NULL OR ended_at >= started_at)
);
COMMENT ON TABLE public.vehicle_holding IS 'One period during which one driver had one vehicle (061). ended_at IS NULL means still held. ⚠ Named "holding" deliberately — slice C introduces work assignment and the two must not share a word.';
COMMENT ON COLUMN public.vehicle_holding.ended_at IS 'NULL = the vehicle is still out with this driver. The two partial unique indexes below make that the single source of truth for "who has what".';

-- ⚠⚠ THESE TWO INDEXES ARE REQUIREMENTS FR-012 AND FR-013, NOT AN OPTIMISATION.
-- "At most one" is a CONCURRENCY claim. A service-level check is a read followed by a write, and two
-- operators clicking at the same moment slip between them. driver_duty_session_open_uq is exactly
-- this shape and has held since 049. Proven by a concurrent container test, not by reasoning.
CREATE UNIQUE INDEX vehicle_holding_open_vehicle_uq
    ON public.vehicle_holding (vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX vehicle_holding_open_driver_uq
    ON public.vehicle_holding (driver_id)  WHERE ended_at IS NULL;

CREATE INDEX vehicle_holding_vehicle_idx ON public.vehicle_holding (vehicle_id);
CREATE INDEX vehicle_holding_driver_idx  ON public.vehicle_holding (driver_id);

-- ⚠ There is deliberately NO public.driver.current_vehicle_id. The open holding row IS the answer.
-- A second place stating one fact is 033/052/053's recurring defect: the two disagree and then
-- nobody knows which is true.

-- ── The driver record gains a licence CLASS, and loses its free-text vehicle strings ─────────────
ALTER TABLE public.driver ADD COLUMN licence_class text
    CHECK (licence_class IN ('C', 'LR', 'MR', 'HR'));
COMMENT ON COLUMN public.driver.licence_class IS 'Australian licence class (061, FR-021). Recorded so "may this driver legally drive this vehicle" is CHECKABLE rather than assumed — a WorkSafe Victoria OHS duty. ⚠ Every Effy vehicle is a light vehicle today, so a current Class C covers all of them; the field exists so the gate is real the day a heavier one is bought.';

-- ⚠ Chain of Responsibility (HVNL) begins above 4.5t GVM and heavy-vehicle fatigue law above 12t.
-- VERIFIED thresholds; neither reaches Effy's vans. No fields for either are invented here.

ALTER TABLE public.driver DROP COLUMN IF EXISTS vehicle_type;
ALTER TABLE public.driver DROP COLUMN IF EXISTS vehicle_plate;
ALTER TABLE public.driver DROP COLUMN IF EXISTS vehicle_registration_expires_on;

-- ⚠ public.driver.delivery_zone_id is NOT touched. Slice B replaces it with driver_zone_capability;
-- changing it here would put slice B's decision in slice A's migration.

-- ── Duty gains an expected finish, and loses every trace of location ─────────────────────────────
ALTER TABLE public.driver_duty_session ADD COLUMN expected_end_at timestamptz;
COMMENT ON COLUMN public.driver_duty_session.expected_end_at IS '⚠ NULLABLE ON PURPOSE, AND NULL MEANS UNKNOWN (FR-033). Slice C''s feasibility gate asks "can this driver finish before they go home"; with NULL the honest answer is "we do not know" and the gate must SAY so. It MUST NEVER be defaulted to a shift length — that would make a guess look like a fact at exactly the moment it decides someone''s workload.';

ALTER TABLE public.driver_duty_session DROP COLUMN IF EXISTS last_location_lat;
ALTER TABLE public.driver_duty_session DROP COLUMN IF EXISTS last_location_lng;
ALTER TABLE public.driver_duty_session DROP COLUMN IF EXISTS last_location_at;

-- ── The shop gains an address. It does NOT gain coordinates ─────────────────────────────────────
ALTER TABLE public.shop ADD COLUMN address_line1 text;
ALTER TABLE public.shop ADD COLUMN address_line2 text;
ALTER TABLE public.shop ADD COLUMN suburb        text;
ALTER TABLE public.shop ADD COLUMN postcode      text CHECK (postcode ~ '^[0-9]{4}$');
ALTER TABLE public.shop ADD COLUMN state         text
    CHECK (state IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'));
COMMENT ON COLUMN public.shop.address_line1 IS 'Where a driver is told to collect from (061, FR-029). Nullable: shops exist today without one, and a NOT NULL would force a fabricated value into real rows. The gap is made VISIBLE in the console instead.';
COMMENT ON COLUMN public.shop.postcode IS 'Validated ^[0-9]{4}$ because slice C matches it against delivery_zone_postcode — a malformed value there silently matches no zone, producing a shop nobody can be sent to with nothing failing.';

-- ⚠⚠ NO latitude/longitude ON public.shop OR public.vehicle, DELIBERATELY (FR-031, D20/D21).
-- Nothing in this platform computes distance: sequencing is an ORDERING problem over task status,
-- time constraint, zone and shop — not a geometry problem. A column nothing reads is a design
-- decision made in advance for a feature nobody has specified, which is the exact pattern this whole
-- programme exists to clean up (driver.delivery_zone_id read by nothing; device_token.platform
-- contradicting the live contract; POST /driver/v1/location, a receiver with no sender).
-- When something needs geometry, THAT slice adds the columns and their loader together.

-- +goose Down
-- Dev-only single-step down (003). Restores the SHAPE only — every dropped value is gone for good.
ALTER TABLE public.shop DROP COLUMN IF EXISTS state;
ALTER TABLE public.shop DROP COLUMN IF EXISTS postcode;
ALTER TABLE public.shop DROP COLUMN IF EXISTS suburb;
ALTER TABLE public.shop DROP COLUMN IF EXISTS address_line2;
ALTER TABLE public.shop DROP COLUMN IF EXISTS address_line1;

ALTER TABLE public.driver_duty_session ADD COLUMN last_location_lat numeric(9, 6);
ALTER TABLE public.driver_duty_session ADD COLUMN last_location_lng numeric(9, 6);
ALTER TABLE public.driver_duty_session ADD COLUMN last_location_at  timestamptz;
ALTER TABLE public.driver_duty_session DROP COLUMN IF EXISTS expected_end_at;

ALTER TABLE public.driver ADD COLUMN vehicle_type  text;
ALTER TABLE public.driver ADD COLUMN vehicle_plate text;
ALTER TABLE public.driver ADD COLUMN vehicle_registration_expires_on date;
ALTER TABLE public.driver DROP COLUMN IF EXISTS licence_class;

DROP TABLE IF EXISTS public.vehicle_holding;
DROP TABLE IF EXISTS public.vehicle;
