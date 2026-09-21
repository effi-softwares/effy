-- +goose Up
-- 063-driver-work-assignment — slice C of the logistics rebuild.
--
-- The piece between 061 (the fleet) and 062 (clearances): WHICH DRIVER DOES WHICH WORK, WHEN.
-- Before this migration a shop could mark every package ready and no driver was ever told, because
-- the work model was torn down (20260920101500) and nothing replaced it.
--
-- Spec: specs/063-driver-work-assignment/spec.md. Data model: ../data-model.md. Research: ../research.md.
--
-- ⚠ PURELY ADDITIVE. No DROP, no ALTER ... DROP COLUMN, no data rewrite. Unlike 061 and 062 — both of
-- which dropped columns and had to be deployed in a precise order — this migration is safe to apply
-- before its code ships. Nothing existing reads these tables until the new services deploy.
--
-- ⚠ THIS IS NOT A RESTORATION OF THE 049 SHAPE (D16). That model was driver_run + collection_task +
-- delivery_task, a table per work type. This one is round -> stop -> package: one shape for both kinds
-- of work, because a collection round and a delivery round differ in what a stop POINTS AT, not in
-- what a round IS.
--
-- ⚠ NO COORDINATES, NO DISTANCE, NO TRAVEL TIME, ANYWHERE (operator direction, D20/D22). Sequencing is
-- an ORDERING problem here, not a geometry problem: status, then time constraint, then zone, then
-- shop. There is deliberately no latitude/longitude column for a later slice to "just use".
--
-- House style (007/009/047/056/061/062): everything operational in `public`; raw SQL; text CHECK enums,
-- no native PG enums and no triggers; an index on every FK; no money anywhere in the driver domain
-- (049 FR-013); COMMENT ON everything.

-- ── A planning pass ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.dispatch_wave (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id               uuid     NULL REFERENCES public.delivery_collection_run (id) ON DELETE SET NULL,
    kind                 text NOT NULL CHECK (kind IN ('collection', 'delivery')),
    planned_for          timestamptz NOT NULL,
    trigger              text NOT NULL CHECK (trigger IN ('schedule', 'manual')),
    triggered_by_sub     text     NULL,
    started_at           timestamptz NOT NULL DEFAULT now(),
    finished_at          timestamptz NULL,
    packages_considered  int NOT NULL DEFAULT 0 CHECK (packages_considered  >= 0),
    packages_assigned    int NOT NULL DEFAULT 0 CHECK (packages_assigned    >= 0),
    packages_unassigned  int NOT NULL DEFAULT 0 CHECK (packages_unassigned  >= 0),

    -- ⚠ A manual pass is caused by a person and must say who. A scheduled one has no actor, and
    -- inventing one ("system") would make the audit trail lie about who decided.
    CONSTRAINT dispatch_wave_actor_ck CHECK (
        (trigger = 'manual'   AND triggered_by_sub IS NOT NULL) OR
        (trigger = 'schedule' AND triggered_by_sub IS NULL)
    )
);

COMMENT ON TABLE  public.dispatch_wave IS 'One planning pass (063). Exists so a wave''s decisions are explainable after the fact (FR-006) — without it, "why did nobody get this package?" is unanswerable an hour later.';
COMMENT ON COLUMN public.dispatch_wave.run_id IS 'The collection run this wave serves. NULL for a manual pass, which answers no particular run.';
COMMENT ON COLUMN public.dispatch_wave.planned_for IS 'The deadline this wave serves — run_time minus the prep buffer, computed never stored elsewhere (research R2). Comparing it to finished_at is how a late wave is spotted.';
COMMENT ON COLUMN public.dispatch_wave.packages_unassigned IS '⚠ The number that matters. A wave that considered 40 and assigned 0 is the silent failure this feature must alarm on; a wave that assigned everything needs no attention at all.';

CREATE INDEX dispatch_wave_run_idx      ON public.dispatch_wave (run_id);
CREATE INDEX dispatch_wave_started_idx  ON public.dispatch_wave (started_at DESC);

-- ── A body of work given to one driver in one go ─────────────────────────────────────────────────
CREATE TABLE public.driver_round (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wave_id        uuid NOT NULL REFERENCES public.dispatch_wave (id) ON DELETE RESTRICT,
    driver_id      uuid NOT NULL REFERENCES public.driver (id)        ON DELETE RESTRICT,
    kind           text NOT NULL CHECK (kind   IN ('collection', 'delivery')),
    status         text NOT NULL DEFAULT 'planned'
                        CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    deadline_at    timestamptz NOT NULL,
    changed_note   text     NULL,
    locked_by_sub  text     NULL,
    locked_at      timestamptz NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    -- A lock is a person's decision or it is nothing; half a lock has no owner to ask about it.
    CONSTRAINT driver_round_lock_ck CHECK (
        (locked_by_sub IS NULL     AND locked_at IS NULL) OR
        (locked_by_sub IS NOT NULL AND locked_at IS NOT NULL)
    )
);

COMMENT ON TABLE  public.driver_round IS 'One driver''s work in one go (063) — a collection round of shops, or a delivery round of customer stops.';
COMMENT ON COLUMN public.driver_round.locked_by_sub IS '⚠ NON-NULL MEANS A PERSON DECIDED THIS (FR-032). A planning pass MUST leave such a round exactly as it stands. An engine that "improves" a dispatcher''s decision has destroyed a human judgement about the physical world it cannot see.';
COMMENT ON COLUMN public.driver_round.changed_note IS 'Set when a wave adds work to a round already under way (FR-004b). A round that grows silently underneath somebody working it is worse than one that never grows.';
COMMENT ON COLUMN public.driver_round.updated_at IS '⚠ THE CONCURRENCY TOKEN, AND IT CARRIES MICROSECONDS. toISOString() truncates to milliseconds while PostgreSQL stores microseconds, so a naive optimistic-lock comparison never matches its own row and EVERY save fails claiming somebody else changed it. 056 found exactly this, and only its container test caught it.';
COMMENT ON COLUMN public.driver_round.deadline_at IS 'When this round must be finished — the collection deadline, or the end of the delivery window. Judged in Australia/Melbourne wall-clock like the schedule it derives from.';

CREATE INDEX driver_round_wave_idx        ON public.driver_round (wave_id);
CREATE INDEX driver_round_driver_idx      ON public.driver_round (driver_id, status);
CREATE INDEX driver_round_open_idx        ON public.driver_round (status) WHERE status IN ('planned', 'in_progress');

-- ── One place the driver goes ────────────────────────────────────────────────────────────────────
CREATE TABLE public.round_stop (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id            uuid NOT NULL REFERENCES public.driver_round (id) ON DELETE CASCADE,
    seq                 int      NULL CHECK (seq >= 0),
    kind                text NOT NULL CHECK (kind IN ('shop_pickup', 'customer_drop', 'hub_checkin')),
    shop_id             uuid     NULL REFERENCES public.shop (id)    ON DELETE RESTRICT,
    order_id            uuid     NULL REFERENCES public."order" (id)  ON DELETE RESTRICT,
    zone_id             uuid     NULL REFERENCES public.delivery_zone (id)    ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'arrived', 'done', 'skipped')),
    completed_at        timestamptz NULL,

    -- A stop points at exactly the thing its kind implies. Making the wrong shape unrepresentable
    -- beats validating it in three services (054's "unrepresentable" rule).
    CONSTRAINT round_stop_target_ck CHECK (
        (kind = 'shop_pickup'   AND shop_id IS NOT NULL AND order_id IS NULL) OR
        (kind = 'customer_drop' AND order_id IS NOT NULL AND shop_id IS NULL) OR
        (kind = 'hub_checkin'   AND shop_id IS NULL AND order_id IS NULL)
    )
);

COMMENT ON TABLE  public.round_stop IS 'One place a driver goes on a round (063): a shop to collect from, a customer to deliver to, or the hub to check in at.';
COMMENT ON COLUMN public.round_stop.seq IS '⚠ A DISPATCHER''S MANUAL ORDER (FR-031), and NULL the rest of the time. Display order is DERIVED — status, then time constraint, then zone, then shop (FR-018) — and seq beats the derived order only where a person has set it. The precedence is stated ONCE, in @effy/edge-shared, because a dispatcher and a driver seeing different orders is a divergence in which NOTHING FAILS (research R5).';
COMMENT ON COLUMN public.round_stop.zone_id IS 'What the ordering groups on. NULL for a hub stop, which belongs to no zone.';
COMMENT ON COLUMN public.round_stop.order_id IS
    '⚠ A DELIVERY STOP POINTS AT THE ORDER, NOT AT public.customer_address. The order SNAPSHOTS the chosen address as jsonb at placement (019 R13) precisely so the customer''s mutable address book cannot corrupt a historical record — and an FK to customer_address would reintroduce exactly that: edit your saved address after checkout and the driver is sent somewhere the order never said. The snapshot is read through this reference, so there is ONE copy of the destination, not a third.';

CREATE INDEX round_stop_round_idx ON public.round_stop (round_id, seq);
CREATE INDEX round_stop_shop_idx  ON public.round_stop (shop_id);
CREATE INDEX round_stop_order_idx ON public.round_stop (order_id);
CREATE INDEX round_stop_zone_idx  ON public.round_stop (zone_id);

-- ── Which packages are handled at which stop ─────────────────────────────────────────────────────
CREATE TABLE public.round_package (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id              uuid NOT NULL REFERENCES public.round_stop (id)        ON DELETE CASCADE,
    shop_fulfillment_id  uuid NOT NULL REFERENCES public.shop_fulfillment (id)  ON DELETE RESTRICT,
    state                text NOT NULL DEFAULT 'assigned'
                              CHECK (state IN ('assigned', 'picked_up', 'not_available', 'delivered', 'failed')),
    note                 text     NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    settled_at           timestamptz NULL
);

COMMENT ON TABLE  public.round_package IS 'The join that makes a stop actionable (063): what to collect here, or what to hand over here.';
COMMENT ON COLUMN public.round_package.note IS
    '⚠ WHY A PACKAGE WAS NOT TAKEN (FR-026) — and it lives HERE rather than in public.fulfillment_event, which is the SHOP''s accountability log (020). A driver''s reason is not a shop event: its event_type vocabulary is closed and has no value for this, and widening a shop''s audit trail to carry driver facts would put two domains in one table. The discrepancy must be recorded somewhere, and this is the row that already knows the package did not travel.';
COMMENT ON COLUMN public.round_package.state IS 'assigned -> picked_up | not_available (collection); assigned -> delivered | failed (delivery). ⚠ A driver''s load (FR-014) is COUNTED from these rows and never stored on public.driver — a counter and the rows it counts can disagree, and then nobody knows which is true (027''s counted-not-stored rule, its fourth application).';

-- ⚠⚠ THIS INDEX *IS* FR-005 AND HALF OF SC-004. It is not a safeguard around the planner; it is the
-- planner's correctness. One package can be in ONE open assignment, enforced by the database. A
-- service that SELECTs "not already assigned" and then INSERTs is not a guarantee — two planning
-- passes, or one pass retried after a timeout, interleave between the two statements. 039 recorded
-- that lesson on the newsletter rate limit, 052 repeated it on receipt dispatch, and 054 proved the
-- principle against two concurrent payments for the last unit in stock.
--
-- ⚠ IT IS PARTIAL ON PURPOSE. Once a package is picked_up or not_available it MUST be re-assignable
-- in a later wave — a package a driver could not collect on Monday is ordinary work on Tuesday. A
-- TOTAL unique index would forbid that forever. This is the same asymmetry 052 needed so a receipt
-- could be resent while staying exactly-once automatically.
CREATE UNIQUE INDEX round_package_open_uq
    ON public.round_package (shop_fulfillment_id) WHERE state = 'assigned';

CREATE INDEX round_package_stop_idx ON public.round_package (stop_id);
CREATE INDEX round_package_sf_idx   ON public.round_package (shop_fulfillment_id);

-- ── Packages arrived at the hub ──────────────────────────────────────────────────────────────────
CREATE TABLE public.hub_checkin (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id           uuid NOT NULL REFERENCES public.driver_round (id) ON DELETE RESTRICT,
    driver_id          uuid NOT NULL REFERENCES public.driver (id)       ON DELETE RESTRICT,
    checked_in_at      timestamptz NOT NULL DEFAULT now(),
    packages_expected  int NOT NULL CHECK (packages_expected >= 0),
    packages_arrived   int NOT NULL CHECK (packages_arrived  >= 0),

    -- A round is checked in ONCE. A retry must be recognised as a retry, not recorded as a second
    -- arrival of the same van.
    CONSTRAINT hub_checkin_round_uq UNIQUE (round_id)
);

COMMENT ON TABLE  public.hub_checkin IS 'The record that a collection round''s packages reached the hub (063, FR-022). Custody passes from the round to the hub here, and a standard package''s driver-side work ENDS here (FR-024).';
COMMENT ON COLUMN public.hub_checkin.packages_arrived IS '⚠ THE DISCREPANCY IS THE POINT (FR-026). Expected minus arrived is a package nobody is looking for; recording only what arrived would make a short count indistinguishable from a small round.';

CREATE INDEX hub_checkin_driver_idx ON public.hub_checkin (driver_id, checked_in_at DESC);

-- ── Why a driver was not eligible ────────────────────────────────────────────────────────────────
CREATE TABLE public.assignment_exclusion (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wave_id              uuid NOT NULL REFERENCES public.dispatch_wave (id)     ON DELETE CASCADE,
    shop_fulfillment_id  uuid NOT NULL REFERENCES public.shop_fulfillment (id)  ON DELETE CASCADE,
    driver_id            uuid     NULL REFERENCES public.driver (id)            ON DELETE CASCADE,
    reason               text NOT NULL CHECK (reason IN (
                             'not_on_duty', 'not_employable', 'licence_expired', 'no_vehicle',
                             'not_cleared', 'no_refrigeration', 'over_capacity', 'cannot_meet_deadline')),
    created_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.assignment_exclusion IS
    'Why a package could not be given to a driver (063, FR-015) — the thing that makes an unassigned package EXPLAINABLE instead of mysterious. '
    '⚠ ITS READER SHIPS IN THIS SAME SLICE (FR-028, the dispatcher view). 056''s central finding was that the driver app had been recording exceptions into two tables for a reader THAT DID NOT EXIST — written, never read, for four features. If the dispatcher view is ever cut, THIS TABLE IS CUT WITH IT. '
    '⚠ Rows are written PER WAVE and replaced when that wave re-runs: a reason from last Tuesday is not a fact about today.';
COMMENT ON COLUMN public.assignment_exclusion.driver_id IS 'NULL means there was no candidate at all — distinct from a named driver failing a specific condition, and the more urgent of the two.';

CREATE INDEX assignment_exclusion_wave_idx ON public.assignment_exclusion (wave_id);
CREATE INDEX assignment_exclusion_sf_idx   ON public.assignment_exclusion (shop_fulfillment_id);
CREATE INDEX assignment_exclusion_driver_idx ON public.assignment_exclusion (driver_id);

-- ── Planner configuration (047's settings row gains two knobs) ───────────────────────────────────
-- ⚠ CONFIGURATION, NEVER LITERALS. How far ahead of a deadline to plan, and how long to allow per
-- stop, are operational facts that will be tuned once a real round has been timed — and tuning must
-- not be a code change (research R11).
ALTER TABLE public.delivery_settings
    ADD COLUMN planning_lead_min      int NOT NULL DEFAULT 45 CHECK (planning_lead_min      > 0),
    ADD COLUMN per_stop_allowance_min int NOT NULL DEFAULT 12 CHECK (per_stop_allowance_min > 0);

COMMENT ON COLUMN public.delivery_settings.planning_lead_min IS 'How long before a collection deadline the wave is planned (063). Default 45 min is a STATED ASSUMPTION awaiting one real timed round, never a measurement.';
COMMENT ON COLUMN public.delivery_settings.per_stop_allowance_min IS '⚠ The feasibility gate''s only input (FR-013). With no travel-time data by design (D20), "can this round finish in time" can only be ESTIMATED from stop count times this allowance. The estimate is shown to the dispatcher rather than silently trusted.';

-- +goose Down
-- Dev-only single-step back (003). Forward-only in every other environment.
ALTER TABLE public.delivery_settings
    DROP COLUMN IF EXISTS per_stop_allowance_min,
    DROP COLUMN IF EXISTS planning_lead_min;
DROP TABLE IF EXISTS public.assignment_exclusion;
DROP TABLE IF EXISTS public.hub_checkin;
DROP TABLE IF EXISTS public.round_package;
DROP TABLE IF EXISTS public.round_stop;
DROP TABLE IF EXISTS public.driver_round;
DROP TABLE IF EXISTS public.dispatch_wave;
