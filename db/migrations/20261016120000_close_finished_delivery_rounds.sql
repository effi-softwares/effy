-- +goose Up
-- Driver backlog A2 — close delivery rounds that finished and were never closed.
--
-- Until the driver service's proof and failure paths closed a round on its last drop (backlog A1),
-- the only writer of `driver_round.status = 'completed'` was hub check-in, which is collection only.
-- Every delivery round whose drops were all delivered or failed stayed open: first on the driver's
-- Today with nothing in it, and never in History.
--
-- One-off and idempotent. `updated_at` is set to the round's last settled drop, so History files the
-- run under the day it actually finished rather than the day this ran.
UPDATE public.driver_round dr
   SET status = 'completed',
       updated_at = COALESCE(
         (SELECT max(rs.completed_at) FROM public.round_stop rs WHERE rs.round_id = dr.id),
         dr.updated_at)
 WHERE dr.kind = 'delivery'
   AND dr.status IN ('planned', 'in_progress')
   AND EXISTS (SELECT 1 FROM public.round_stop rs WHERE rs.round_id = dr.id)
   AND NOT EXISTS (
         SELECT 1 FROM public.round_stop rs
          WHERE rs.round_id = dr.id AND rs.status NOT IN ('done', 'skipped'));

-- +goose Down
-- Nothing to undo: these rounds were finished, and reopening them would restore the defect.
SELECT 1;
