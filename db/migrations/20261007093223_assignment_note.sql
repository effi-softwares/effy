-- +goose Up
-- 073 — how a package got onto a driver's round, in one line.
--
-- Back-office shows, beside every assignment, "Auto-assigned — fewest packages today (2)" or
-- "Assigned by Ann". That line is written ONCE, when the assignment is made, on the assignment row
-- itself — not recomputed later, which would explain today's world instead of the one the decision
-- was made in, and not in a separate event table, which the operator ruled out as more than this
-- needs ("simpler is better").
--
-- ⚠ ADDITIVE AND NULLABLE: the fleet build running before 073 inserts rows without these columns,
-- and those rows simply have no line.

ALTER TABLE public.round_package
    ADD COLUMN assigned_by_sub text NULL,
    ADD COLUMN assigned_note   text NULL;

COMMENT ON COLUMN public.round_package.assigned_by_sub IS 'The back-office person who put this package here (073). NULL = the planner (auto-assign).';
COMMENT ON COLUMN public.round_package.assigned_note IS 'One line on how this package got onto this round, written once at assignment (073): the planner''s rule in words, or the person''s action. NULL for rows written before 073.';

COMMENT ON COLUMN public.driver_round.locked_by_sub IS '⚠ UNUSED SINCE 073. The lock only stopped the planner ADDING to a round — since 072 it never moves assigned work — and 073 removed it as a concept nobody needed. Kept until a later migration drops it, so the fleet build running between this migration and its deploy still reads it.';

-- +goose Down
ALTER TABLE public.round_package
    DROP COLUMN IF EXISTS assigned_note,
    DROP COLUMN IF EXISTS assigned_by_sub;
COMMENT ON COLUMN public.driver_round.locked_by_sub IS '⚠ NON-NULL MEANS A PERSON DECIDED THIS (FR-032).';
