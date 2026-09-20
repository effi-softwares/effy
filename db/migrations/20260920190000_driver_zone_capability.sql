-- +goose Up
-- 062-driver-zone-capability — slice B of the logistics rebuild.
--
-- Makes Effy able to say WHO IS ELIGIBLE FOR WHAT WORK, WHERE. It assigns nothing: no task, round,
-- dispatch or routing concept appears here (spec FR-026), and it does not change how zones are
-- defined (FR-027). The wave planner is slice C.
--
-- Research: specs/062-driver-zone-capability/research.md. Data model: ../data-model.md.
--
-- ⚠⚠ DESTRUCTIVE. This DROPS public.driver.delivery_zone_id and its values are discarded rather than
-- converted. That is deliberate and not laziness: a single zone does not say which FUNCTION
-- (collecting vs delivering) or which METHOD (standard vs same-day) it applied to, so converting it
-- into a clearance would be INVENTING A PERMISSION NOBODY GRANTED. Operators re-grant deliberately.
-- Nothing breaks: no assignment code ever read that column — 049 declared that a driver without a
-- zone "is inert for assignment" and then never consulted the field in any decision.
--
-- House style (007/009/047/056/061): everything operational in `public`; raw SQL; text CHECK enums,
-- no native PG enums and no triggers; an index on every FK; no money anywhere in the driver domain
-- (049 FR-013); COMMENT ON everything.

-- ── A clearance: this driver may do this kind of work in this place ──────────────────────────────
CREATE TABLE public.driver_zone_capability (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      uuid NOT NULL REFERENCES public.driver (id) ON DELETE CASCADE,
    function       text NOT NULL CHECK (function IN ('collection', 'delivery')),
    method         text NOT NULL CHECK (method   IN ('standard', 'same_day')),
    -- ⚠⚠ NULL MEANS EVERY ZONE — INCLUDING ZONES CREATED AFTERWARDS. This is the single most
    -- important fact in the table.
    --
    -- The alternative, a row per zone, is correct on the day it is written and quietly WRONG the
    -- first time a zone is added: the driver stops being eligible for the new area, nothing fails,
    -- and nobody is told. The only representation that stays true is one that stores the FACT rather
    -- than an enumeration of today's zones.
    --
    -- ⚠ And NOT an `all_zones boolean` beside this column. Two columns answering one question makes
    -- (zone_id = X, all_zones = true) representable and meaningless — 033/052/053's recurring defect.
    -- One nullable column cannot express the contradiction.
    --
    -- ⚠ ON DELETE CASCADE is for a DELETED zone, whose clearances become statements about nothing.
    -- A DISABLED zone is reversible and must NOT lose its clearances — disabled zones are filtered
    -- at READ time so re-enabling one restores cover without anybody re-granting.
    zone_id        uuid     NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    granted_by_sub text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.driver_zone_capability IS 'One grant: a driver may do one kind of work in one place (062). Replaces public.driver.delivery_zone_id, which could hold only ONE zone when a driver plainly covers several, and which no assignment code ever read.';
COMMENT ON COLUMN public.driver_zone_capability.zone_id IS '⚠ NULL = EVERY ZONE, including zones created afterwards (FR-010/FR-011). Storing "everywhere" as a list of today''s zones is wrong the first time a zone is added, and wrong INVISIBLY.';
COMMENT ON COLUMN public.driver_zone_capability.function IS 'Collecting from shops, or delivering to customers. Independent of method and zone.';
COMMENT ON COLUMN public.driver_zone_capability.method IS 'Standard or same-day. The method is chosen by the customer at checkout (047); this says whether the driver may carry it.';

-- ⚠⚠ FR-005 AND FR-011 BOTH LIVE IN THIS ONE INDEX.
--
-- A plain UNIQUE does NOT deduplicate NULLs in standard SQL, so (driver,'delivery','same_day',NULL)
-- could be inserted TWICE and "every zone" would silently become two rows — turning the idempotent
-- grant FR-005 requires into a duplicate. PostgreSQL 15 added NULLS NOT DISTINCT; we run 16.
--
-- The alternative is two partial unique indexes (one WHERE zone_id IS NOT NULL, one WHERE it IS
-- NULL). That works, and leaves two objects that can drift, and invites someone to delete the one
-- that "looks redundant". One index states the rule once.
CREATE UNIQUE INDEX driver_zone_capability_uq
    ON public.driver_zone_capability (driver_id, function, method, zone_id)
    NULLS NOT DISTINCT;

CREATE INDEX driver_zone_capability_driver_idx ON public.driver_zone_capability (driver_id);
CREATE INDEX driver_zone_capability_zone_idx   ON public.driver_zone_capability (zone_id);

-- ── The single-zone field goes ───────────────────────────────────────────────────────────────────
-- ⚠ See the DESTRUCTIVE note in the header: the values are discarded, not converted.
DROP INDEX IF EXISTS public.driver_zone_idx;
ALTER TABLE public.driver DROP COLUMN IF EXISTS delivery_zone_id;

-- +goose Down
-- Dev-only single-step down (003). Restores the SHAPE only — every dropped value is gone for good,
-- and no clearance is converted back into a single zone (it could not be: a clearance knows which
-- function and method it covers, and the old column had nowhere to put either).
ALTER TABLE public.driver
    ADD COLUMN delivery_zone_id uuid REFERENCES public.delivery_zone (id) ON DELETE SET NULL;
CREATE INDEX driver_zone_idx ON public.driver (delivery_zone_id);

DROP TABLE IF EXISTS public.driver_zone_capability;
