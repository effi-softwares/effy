-- +goose Up
-- 058 follow-up — mark an insight bucket when an order's LINES appear, not only when its status flips.
--
-- ⚠ THE HOLE THE CONTAINER TESTS FOUND, the first time they were ever executed. The 058 migration
-- marks a bucket dirty from `AFTER UPDATE OF status ON public."order"`, because that is how a real
-- order becomes paid: checkout writes it `pending_payment` and `FinalizeSucceeded` UPDATEs it to
-- `paid` (019). That path is correct and is proven by a passing test.
--
-- What it does NOT cover is an order that is INSERTED already paid — no UPDATE ever happens, so no
-- bucket is marked, so the rollup has no work to do and the order never appears in Insights. Nothing
-- in the live checkout does that today. Two things do:
--   * dev seeds and data imports, which write finished orders directly. An operator seeding a week
--     of orders and finding Insights empty would reasonably conclude the feature is broken.
--   * any future writer that creates a settled order in one statement.
--
-- The nightly reconciliation would eventually catch it and page (its correction threshold is zero),
-- which is the system working — but an alarm is a worse answer than not having the hole.
--
-- ⚠ WHY `order_item` AND NOT `order`. At the moment an order row is inserted its lines do not exist
-- yet, so marking there would recompute a bucket from zero lines and write zero — and nothing would
-- mark it again. The lines are the goods; marking when a line lands is correct whichever order the
-- two writes happen in:
--   * checkout (lines first, still unpaid): the recompute writes 0, which is true — the order is not
--     paid. The later status UPDATE marks it again and the figure becomes right.
--   * a directly-inserted paid order (status first, lines after): the line marks it, and the
--     recompute sees a paid order with goods. Right the first time.
--
-- Cost: one `ON CONFLICT DO NOTHING` insert per order line at checkout, into a table keyed exactly to
-- collapse them. The same two-statement limit the other trigger functions hold to (research R6), and
-- `triggers.guard.test.ts` enforces it.

-- +goose StatementBegin
CREATE FUNCTION public.shop_ops_order_item_added() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_placed timestamptz;
BEGIN
    SELECT COALESCE(o.placed_at, o.created_at) INTO v_placed
      FROM public."order" o
     WHERE o.id = NEW.order_id;

    PERFORM public.shop_ops_mark_dirty(NEW.shop_id, v_placed);
    RETURN NULL;
END;
$$;
-- +goose StatementEnd

COMMENT ON FUNCTION public.shop_ops_order_item_added() IS
    'Mark the insight bucket for the hour an order was placed as soon as one of its lines exists (058 follow-up). Covers the ordering the status trigger cannot: an order inserted already paid, which seeds and imports do.';

CREATE TRIGGER shop_ops_order_item_ins AFTER INSERT ON public.order_item
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_order_item_added();

-- Catch up anything already in the database that the status trigger missed — the same backfill the
-- 058 migration ran, re-run now that this ordering is covered. Idempotent.
INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT oi.shop_id, public.shop_local_hour(COALESCE(o.placed_at, o.created_at), s.timezone)
  FROM public.order_item oi
  JOIN public."order" o ON o.id = oi.order_id
  JOIN public.shop     s ON s.id = oi.shop_id
 WHERE o.status IN ('paid', 'canceled')
 GROUP BY 1, 2
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TRIGGER IF EXISTS shop_ops_order_item_ins ON public.order_item;
DROP FUNCTION IF EXISTS public.shop_ops_order_item_added();
