-- +goose Up
-- Two in-transit states for a customer drop (found during the first end-to-end walk, 2026-09-30).
--
-- ⚠ THE DEFECT: "Start this drop" DID NOTHING, AND SAID NOTHING. The driver app walks a drop through
-- STAGED → out_for_delivery → en_route → arrived → proof — 049's state machine, kept deliberately by 060.
-- 063 rebuilt the storage as `round_stop.status IN ('pending','arrived','done','skipped')`, and
-- `setDropStatus` mapped every value that was not 'arrived' back to 'pending'. So the first button wrote
-- the state the drop was already in, answered 200, the app re-read "staged", and the same button came
-- back. A driver could never reach the arrived screen, so could never capture proof, so no same-day order
-- could complete — and nothing failed anywhere.
--
-- ⚠ AN ENUM WIDENING, WHICH THIS REPO HAS SHIPPED DEFECTS THROUGH FOUR TIMES (053, 056, 057, 059). Every
-- reader was audited in the same change. The two that listed OPEN states by name — the driver's Today
-- "outstanding" filter and the dispatcher's "stops remaining" count — now name the FINISHED states
-- instead (`NOT IN ('done','skipped')`), 055's lesson, so a started drop cannot vanish from either and a
-- future state cannot fall through the same way.
--
-- Purely additive: existing rows are unaffected.
ALTER TABLE public.round_stop DROP CONSTRAINT round_stop_status_check;
ALTER TABLE public.round_stop ADD CONSTRAINT round_stop_status_check
    CHECK (status IN ('pending', 'out_for_delivery', 'en_route', 'arrived', 'done', 'skipped'));

-- +goose Down
-- Dev-only rollback. Fails if any row holds a new state, which is the correct outcome.
ALTER TABLE public.round_stop DROP CONSTRAINT round_stop_status_check;
ALTER TABLE public.round_stop ADD CONSTRAINT round_stop_status_check
    CHECK (status IN ('pending', 'arrived', 'done', 'skipped'));
