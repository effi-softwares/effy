-- +goose Up
-- 057 Amendment A3 — the shop order console: tags and internal notes on a shop's order portion, and
-- the audit vocabulary that records them.
--
-- ⚠ BOTH HANG OFF THE PORTION (shop_fulfillment), NOT THE ORDER. A two-shop order is two portions,
-- and one shop's notes about its shelf are nobody else's business — and never the customer's. Keyed
-- on the portion, cross-shop visibility is structurally impossible: every read is already scoped
-- `sf.shop_id = <caller's shop>` and these tables have no other way in.
--
-- ⚠ THE AUDIT GOES INTO fulfillment_event, NOT A SECOND LOG. That table is already the portion's
-- sole accountability record (020 FR-019b) and back-office's order history reads it. A separate
-- "console event" table would be two logs answering one question — the shape 033/052/053 each paid
-- for. So the CHECK is WIDENED by two members, and every reader was audited first (053 and 056 each
-- shipped a defect through an enum widening):
--   * edge-api/orders history projection — has an `ELSE fe.event_type` arm that would have rendered
--     the raw wire value; given explicit WHEN arms in the same change.
--   * edge-api/orders arrival + core-api refunds cancel — WRITERS of 'state_changed' only; unaffected.
--   * edge-api/shop fulfillments — writer; its EventInput type is widened alongside.
-- House style: raw SQL, COMMENT ON everything.

-- ── Tags ────────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.fulfillment_tag (
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    tag                 text NOT NULL CHECK (btrim(tag) <> '' AND char_length(tag) <= 32),
    created_by_staff_id uuid REFERENCES public.shop_staff (id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_fulfillment_id, tag)
);
COMMENT ON TABLE public.fulfillment_tag IS
    'A shop''s own label on its order portion (057 A3) — "fragile", "call first". Shop-scoped through the portion. Written as an absolute set (PUT), so a retried save is idempotent; the change itself is recorded in fulfillment_event as tags_changed.';
COMMENT ON COLUMN public.fulfillment_tag.tag IS
    'Stored as the operator typed it, trimmed. Uniqueness is per portion and case-sensitive by design: the service lower-cases before writing, so the constraint and the rule agree.';

CREATE INDEX fulfillment_tag_tag_idx ON public.fulfillment_tag (tag);

-- ── Internal notes ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.fulfillment_note (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    body                text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 2000),
    author_staff_id     uuid REFERENCES public.shop_staff (id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fulfillment_note IS
    'An internal note a shop operator left on its order portion (057 A3). Append-only: never updated or deleted, so a note someone acted on cannot be quietly rewritten afterwards. Never shown to the customer or to another shop.';
COMMENT ON COLUMN public.fulfillment_note.author_staff_id IS
    'NULLABLE + ON DELETE SET NULL, the fulfillment_event rule: the note survives its author''s record. NULL means "the person is gone", never "nobody wrote it".';

CREATE INDEX fulfillment_note_portion_idx ON public.fulfillment_note (shop_fulfillment_id, created_at DESC);

-- ── The audit vocabulary ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fulfillment_event DROP CONSTRAINT fulfillment_event_event_type_check;
ALTER TABLE public.fulfillment_event ADD CONSTRAINT fulfillment_event_event_type_check
    CHECK (event_type IN (
        'state_changed', 'item_gathered', 'item_unavailable', 'item_restored',
        'note_added', 'tags_changed'));

ALTER TABLE public.fulfillment_event ADD COLUMN detail text;
COMMENT ON COLUMN public.fulfillment_event.detail IS
    'Free text for the 057 A3 console events: the resulting tag set for tags_changed (comma-separated, "" when cleared). NULL for every other event type. ⚠ A note''s BODY is never copied here — it lives in fulfillment_note and the log only records that one was added.';

-- +goose Down
-- Forward-only platform (constitution): dev single-step rollback only, and LOSSY — tags and notes are
-- dropped, and console events are deleted before the CHECK is narrowed back.
DELETE FROM public.fulfillment_event WHERE event_type IN ('note_added', 'tags_changed');
ALTER TABLE public.fulfillment_event DROP COLUMN IF EXISTS detail;
ALTER TABLE public.fulfillment_event DROP CONSTRAINT fulfillment_event_event_type_check;
ALTER TABLE public.fulfillment_event ADD CONSTRAINT fulfillment_event_event_type_check
    CHECK (event_type IN ('state_changed', 'item_gathered', 'item_unavailable', 'item_restored'));
DROP TABLE IF EXISTS public.fulfillment_note;
DROP TABLE IF EXISTS public.fulfillment_tag;
