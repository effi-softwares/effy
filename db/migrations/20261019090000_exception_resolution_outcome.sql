-- +goose Up
-- Back-office redesign (board "Mark dealt with — outcome"): how a failed delivery ended.
--
-- Until now closing a failed delivery recorded only THAT it was dealt with — the operator's note was
-- counted in the audit row and then dropped. The next person to open the order had to ask. Both are
-- now kept on the failure itself: a closed set of outcomes, and the operator's own words.
--
-- ⚠ Nullable, and only ever written together with `resolved_at`: a failure closed before this
-- migration has neither, and says so ("Dealt with") rather than pretending to an outcome.
ALTER TABLE public.delivery_attempt_failure
    ADD COLUMN resolution_outcome text NULL
        CHECK (resolution_outcome IN ('redelivered', 'refunded', 'collected', 'other')),
    ADD COLUMN resolution_note text NULL
        CHECK (resolution_note IS NULL OR length(resolution_note) <= 500),
    ADD CONSTRAINT delivery_attempt_failure_outcome_resolved
        CHECK (resolution_outcome IS NULL OR resolved_at IS NOT NULL),
    ADD CONSTRAINT delivery_attempt_failure_other_note
        CHECK (resolution_outcome IS DISTINCT FROM 'other' OR length(btrim(coalesce(resolution_note, ''))) > 0);

-- +goose Down
ALTER TABLE public.delivery_attempt_failure
    DROP CONSTRAINT delivery_attempt_failure_other_note,
    DROP CONSTRAINT delivery_attempt_failure_outcome_resolved,
    DROP COLUMN resolution_note,
    DROP COLUMN resolution_outcome;
