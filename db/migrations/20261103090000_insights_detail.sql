-- Insights redesign: two figures the rollups did not carry, so Insights can keep reading prepared figures only.
--
-- `ready_spread` counts the orders that finished in an hour by how long they took from payment to ready (under 10,
-- 10-20, 20-30, 30-40, 40-60, over 60 minutes). `unavailable_units` is what a shop could not supply of a product, on
-- the day it sold. Recent hours are queued again, so the rollup job fills both from source; nothing is computed here.

-- +goose Up
ALTER TABLE public.shop_sales_hour
    ADD COLUMN ready_spread integer[] DEFAULT '{0,0,0,0,0,0}' NOT NULL,
    ADD CONSTRAINT shop_sales_hour_ready_spread_check CHECK (cardinality(ready_spread) = 6);

ALTER TABLE public.shop_product_sales_day
    ADD COLUMN unavailable_units integer DEFAULT 0 NOT NULL,
    ADD CONSTRAINT shop_product_sales_day_unavailable_units_check CHECK (unavailable_units >= 0);

INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT shop_id, bucket_start
  FROM public.shop_sales_hour
 WHERE bucket_start >= now() - interval '60 days'
ON CONFLICT DO NOTHING;

-- +goose Down
ALTER TABLE public.shop_product_sales_day
    DROP CONSTRAINT shop_product_sales_day_unavailable_units_check,
    DROP COLUMN unavailable_units;

ALTER TABLE public.shop_sales_hour
    DROP CONSTRAINT shop_sales_hour_ready_spread_check,
    DROP COLUMN ready_spread;
