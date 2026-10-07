-- +goose Up
-- 072 — Immediate driver work assignment.
--
-- Work is given to a driver the moment a driver can take it, instead of inside a short window before
-- a collection run or a delivery window. The driver sees it at once; what stops them acting early is
-- that the round has not OPENED. This migration carries the three things that needs:
--
--   1. a round's opening time, as ONE definition every reader shares;
--   2. the delivery window a round serves, so that definition has something to subtract from;
--   3. "nobody can take this package" as a standing fact, not a row per planning pass.
--
-- ⚠ ADDITIVE, AND SAFE TO APPLY BEFORE ANY DEPLOY. The fleet service deployed before this feature
-- still inserts per-wave exclusion rows with a wave_id and no kind; both remain legal (wave_id is
-- made nullable, not dropped, and the new uniqueness is partial on kind IS NOT NULL).

ALTER TABLE public.driver_round
    ADD COLUMN window_start_at timestamptz NULL;

COMMENT ON COLUMN public.driver_round.window_start_at IS 'The start of the delivery window this round serves (072). NULL for a collection round and for a delivery round with no window. With deadline_at it identifies the run or window a round belongs to — the planner adds to a driver''s not-yet-begun round for that run or window rather than creating another.';
COMMENT ON COLUMN public.driver_round.deadline_at IS 'When this round must be finished — the collection run''s instant, or the end of the delivery window (end of day for a windowless or already-missed window). ⚠ For a collection round this IS the run it belongs to (072): no separate run reference is stored.';

CREATE INDEX driver_round_bucket_idx
    ON public.driver_round (driver_id, kind, deadline_at) WHERE status = 'planned';

-- +goose StatementBegin
CREATE FUNCTION public.round_opens_at(p_kind text, p_deadline_at timestamptz, p_window_start_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
             WHEN p_kind = 'collection'
               THEN p_deadline_at - make_interval(mins => s.lead)
             WHEN p_window_start_at IS NOT NULL
               THEN p_window_start_at - make_interval(mins => s.lead)
             ELSE NULL
           END
      FROM (SELECT COALESCE((SELECT planning_lead_min FROM public.delivery_settings WHERE id = 1), 45) AS lead) s
$$;
-- +goose StatementEnd

COMMENT ON FUNCTION public.round_opens_at(text, timestamptz, timestamptz) IS
    'When a round''s actions become available (072). ⚠ THE ONLY DEFINITION — the driver''s reads, the driver''s action gate and the dispatch view all call this, and nothing computes it another way. NULL or a past instant means OPEN. ⚠ DERIVED, NEVER STORED: a stored opening time is a second copy of the lead setting and is stale the moment the setting changes.';

COMMENT ON COLUMN public.delivery_settings.planning_lead_min IS 'How long before a collection run, or before a delivery window starts, the work OPENS to its driver (072). Until 072 this was how long before a run planning began; planning is now continuous and this decides only when a driver may act. Default 45 min is a STATED ASSUMPTION awaiting one real timed round, never a measurement.';

-- ── "Nobody can take this" becomes one standing fact per package ───────────────────────────────────
-- Every existing row describes a planning pass that is over.
DELETE FROM public.assignment_exclusion;

ALTER TABLE public.assignment_exclusion
    ALTER COLUMN wave_id DROP NOT NULL,
    ADD COLUMN kind       text NULL CHECK (kind IN ('collection', 'delivery')),
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX assignment_exclusion_standing_uq
    ON public.assignment_exclusion (shop_fulfillment_id, kind, driver_id, reason) NULLS NOT DISTINCT
    WHERE kind IS NOT NULL;

COMMENT ON TABLE public.assignment_exclusion IS
    'Why a package cannot currently be given to a driver (063, reshaped by 072) — the thing that makes an unassigned package EXPLAINABLE instead of mysterious. '
    '⚠ A STANDING FACT, NOT A LOG. A package''s rows for a kind exist exactly while it is unassigned for that kind; a planning pass rewrites them only when the reasons CHANGE and removes them when the package is assigned. The planner now runs every few minutes all day, and a row per pass would be 288 copies of one fact. '
    '⚠ ITS READER IS THE DISPATCHER VIEW (FR-028). If that view is ever cut, this table is cut with it.';
COMMENT ON COLUMN public.assignment_exclusion.kind IS 'Which stage the package is waiting at (072): collection (ready at a shop) or delivery (checked in at the hub). NULL only on rows written by the pre-072 planner, which no reader uses.';
COMMENT ON COLUMN public.assignment_exclusion.wave_id IS 'Unused since 072. Kept nullable so the planner deployed before 072 keeps working between this migration and its own deploy.';

COMMENT ON TABLE public.dispatch_wave IS 'One planning pass that CHANGED something (063, narrowed by 072). The planner runs every few minutes; a pass that assigned and released nothing writes no row. Every round is created by a recorded pass.';
COMMENT ON COLUMN public.dispatch_wave.planned_for IS 'The instant the pass ran (072). Until 072: the planning moment the wave served.';

-- +goose Down
-- Dev single-step rollback only. Standing rows have no wave to belong to and are deleted.
DROP INDEX IF EXISTS public.assignment_exclusion_standing_uq;
DELETE FROM public.assignment_exclusion WHERE wave_id IS NULL;
ALTER TABLE public.assignment_exclusion
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS kind,
    ALTER COLUMN wave_id SET NOT NULL;
DROP FUNCTION IF EXISTS public.round_opens_at(text, timestamptz, timestamptz);
DROP INDEX IF EXISTS public.driver_round_bucket_idx;
ALTER TABLE public.driver_round DROP COLUMN IF EXISTS window_start_at;
