-- +goose Up
-- 098 (amendment) — every size is COUNTED unless a shop chooses otherwise.
--
-- Until now a new variant started untracked, and an untracked variant is "not counted" (054): always
-- buyable. That made a size nobody had entered stock for sellable without limit — the opposite of
-- what an operator expects. From now on the one writer (`applyVariantSet`) creates a variant tracked at
-- zero, so it cannot be bought until the shop adds stock; a shop can still switch counting off for a
-- made-to-order item.
--
-- This migration brings the sizes that already exist into line: every untracked variant becomes
-- tracked at ZERO. A previous count is NOT reused — it stopped being maintained the moment tracking
-- went off, so it is not a fact about the shelf. Each change is explained by a movement, as every count
-- must be (054).
--
-- ⚠ Shoppers stop being able to buy these sizes until a shop adds stock. In dev that is the intent.

INSERT INTO public.stock_movement
    (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind, note)
SELECT v.product_id, v.id, v.shop_id, 0, 0, 0, 'tracking_enabled', 'system',
       '098: sizes are counted by default — add stock to sell this size'
  FROM public.product_variant v
 WHERE NOT v.stock_tracked
   AND v.state <> 'removed';

UPDATE public.product_variant
   SET stock_tracked = true,
       stock_on_hand = 0,
       updated_at    = now()
 WHERE NOT stock_tracked
   AND state <> 'removed';

-- +goose Down
-- Nothing to undo: which sizes a shop had deliberately left uncounted is not recorded anywhere, so
-- switching any back off would be a guess. A shop switches counting off per size in shop-web.
SELECT 1;
