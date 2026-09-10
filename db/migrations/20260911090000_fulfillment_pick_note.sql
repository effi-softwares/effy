-- +goose Up
-- 057 Amendment A3 (revision 2) — item-level picking in the shop order console.
--
-- The console now picks per LINE (tick the whole line, or "Adjust" it to part-picked / unavailable
-- with an optional note for the team). The line's state is still the two absolute counts 020 already
-- keeps (`gathered_quantity`, `unavailable_quantity`) — no new state column, because "picked in full",
-- "part picked", "unavailable" and "not picked" are all DERIVED from those two numbers and the ordered
-- quantity, and a stored label beside them would be a second answer free to disagree.
--
-- What IS new is the note: "Unavailable · supplier short" has to survive a reload, and the activity
-- log records the note at the moment it was written (fulfillment_event.detail), which is history, not
-- the line's current state.

ALTER TABLE public.fulfillment_item
    ADD COLUMN pick_note text CHECK (pick_note IS NULL OR (btrim(pick_note) <> '' AND char_length(pick_note) <= 500));

COMMENT ON COLUMN public.fulfillment_item.pick_note IS
    'The picker''s note on this line, from the console''s "Adjust this line" (057 A3). Current state only — each note is also written, as it was said, into fulfillment_event.detail. Never shown to the customer.';

-- +goose Down
-- Dev single-step rollback only; lossy (the notes survive in fulfillment_event.detail).
ALTER TABLE public.fulfillment_item DROP COLUMN IF EXISTS pick_note;
