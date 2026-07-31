-- +goose Up
-- 029-promotional-banner-carousel: where an advertised promotion appears on Home.
--
-- 028 gave a promotion an advertising facet — whether to show it, its copy, its artwork and its order.
-- It had exactly one placement: interleaved between merchandising sections. 029 adds a dedicated
-- offers carousel, which makes "where" a real question for the first time.
--
-- ⚠ EXCLUSIVE, never both (FR-027). Showing every advertised promotion in both placements needs no new
-- column at all, and is wrong at the only scale that matters: with three or four promotions live a
-- shopper meets the same offer twice on one screen, and the store reads as if it is shouting.
--
-- ⚠ THE DEFAULT IS A SAFETY CHOICE, NOT A COIN TOSS (FR-027a). An operator who marks a promotion
-- advertisable without thinking about placement gets the offers section — which is where a shopper
-- goes looking for offers. Defaulting to 'inline' would scatter unconsidered promotions through the
-- merchandising, where they interrupt rather than answer.
--
-- House style (007/009/019/027/028): text CHECK enum, no native PG enums, no triggers, COMMENT ON
-- everything. See specs/029-promotional-banner-carousel/data-model.md §2.

ALTER TABLE public.promo_code
    ADD COLUMN banner_placement text NOT NULL DEFAULT 'carousel'
        CHECK (banner_placement IN ('carousel', 'inline'));

COMMENT ON COLUMN public.promo_code.banner_placement IS 'carousel | inline — where an advertised promotion appears on Home (029 FR-027). EXCLUSIVE: a promotion appears in one placement, never both. Defaults to ''carousel'' deliberately, so an operator who advertises without choosing lands in the offers section rather than scattered through the merchandising.';

-- ⚠ banner_position (028) KEEPS its column and NARROWS its meaning: order WITHIN a placement. For
-- 'carousel' it is the swipe order; for 'inline' it remains the section index it always was. Recorded
-- here because the column's name no longer tells the whole story on its own.
COMMENT ON COLUMN public.promo_code.banner_position IS 'Order WITHIN the promotion''s placement (029). For banner_placement=''inline'' this is the Home section index it has been since 028 — 0 = above the first section. For ''carousel'' it is the swipe order. Out-of-range values are CLAMPED by the client, never dropped: a mistyped number must not silently unpublish a live promotion.';

-- The hot path reads advertised promotions ordered within a placement, so extend 028's partial index
-- to cover the placement it now filters on.
DROP INDEX IF EXISTS public.promo_code_advertised_idx;
CREATE INDEX promo_code_advertised_idx
    ON public.promo_code (banner_placement, banner_position, created_at)
    WHERE is_advertised;

-- +goose Down
-- Dev-iteration convenience only (003 forward-only in higher envs; db-down refused unless ENV=dev).
DROP INDEX IF EXISTS public.promo_code_advertised_idx;
CREATE INDEX promo_code_advertised_idx
    ON public.promo_code (banner_position, created_at)
    WHERE is_advertised;
ALTER TABLE public.promo_code DROP COLUMN IF EXISTS banner_placement;
