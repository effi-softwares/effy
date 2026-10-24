-- 099 Shop floor signals: how well a shop fulfils, rolled up per local hour beside its sales.
--
-- A portion FINISHES in the hour of its first `ready_for_pickup` event or its `unfulfillable` event,
-- whichever came first (reopening picking does not count it twice). Withdrawn portions never count.
-- Insights reads only these rollups (shop/src/insights/rollup-only.guard.test.ts); the rollup job fills
-- them from source (shop/src/insights/rollup.ts). The last 60 days are marked for that job here.

-- +goose Up
ALTER TABLE public.shop_sales_hour
    ADD COLUMN finished_orders integer DEFAULT 0 NOT NULL,
    ADD COLUMN finished_units_ordered integer DEFAULT 0 NOT NULL,
    ADD COLUMN finished_units_supplied integer DEFAULT 0 NOT NULL,
    ADD COLUMN ready_orders integer DEFAULT 0 NOT NULL,
    ADD COLUMN ready_seconds bigint DEFAULT 0 NOT NULL,
    ADD CONSTRAINT shop_sales_hour_finished_orders_check CHECK ((finished_orders >= 0)),
    ADD CONSTRAINT shop_sales_hour_finished_units_ordered_check CHECK ((finished_units_ordered >= 0)),
    ADD CONSTRAINT shop_sales_hour_finished_units_supplied_check
        CHECK (((finished_units_supplied >= 0) AND (finished_units_supplied <= finished_units_ordered))),
    ADD CONSTRAINT shop_sales_hour_ready_orders_check CHECK ((ready_orders >= 0)),
    ADD CONSTRAINT shop_sales_hour_ready_seconds_check CHECK ((ready_seconds >= 0));

-- Every hour of the last 60 days, for every active shop, goes back to the rollup job, which recomputes
-- each bucket whole (the new columns included). Idempotent.
INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT s.id, public.shop_local_hour(h, s.timezone)
  FROM public.shop s
 CROSS JOIN generate_series(now() - interval '60 days', now(), interval '1 hour') AS h
 WHERE s.status = 'active'
ON CONFLICT DO NOTHING;

-- +goose Down
ALTER TABLE public.shop_sales_hour
    DROP COLUMN ready_seconds,
    DROP COLUMN ready_orders,
    DROP COLUMN finished_units_supplied,
    DROP COLUMN finished_units_ordered,
    DROP COLUMN finished_orders;
