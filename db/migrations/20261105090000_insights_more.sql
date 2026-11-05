-- Insights redesign 2: the figures the new pages need, kept by the rollup job so the screen still reads prepared
-- figures only (rollup-only.guard.test.ts).
--
-- shop_sales_hour, by the hour orders were paid:
--   effy_orders / courier_orders  who takes them (the shop's two words: Effy driver, Courier)
--   returning_orders              orders from a customer who had bought this shop's goods before (counted, never named)
--   size_spread                   orders by how many of this shop's units they held: 1-2, 3-5, 6-10, 11-20, 21+
--
-- shop_run_figures, one row per Effy collection run that came to the shop: the packages its driver came for (`due`)
-- and the ones that were ready (`ready`, picked up). A package not ready is round_package.state = 'not_available'.
--
-- shop_picker_day, by the local day portions finished: who moved each portion to picking (its first `picking`
-- event), how many they finished, their time to ready, and the units they could not find.
--
-- shop_product_pair_day, by the local day orders were paid: pairs of this shop's products in the same order.
--
-- Recent hours are queued again, so the rollup job fills everything from source; nothing is computed here.

-- +goose Up
ALTER TABLE public.shop_sales_hour
    ADD COLUMN effy_orders integer DEFAULT 0 NOT NULL,
    ADD COLUMN courier_orders integer DEFAULT 0 NOT NULL,
    ADD COLUMN returning_orders integer DEFAULT 0 NOT NULL,
    ADD COLUMN size_spread integer[] DEFAULT '{0,0,0,0,0}' NOT NULL,
    ADD CONSTRAINT shop_sales_hour_effy_orders_check CHECK (effy_orders >= 0),
    ADD CONSTRAINT shop_sales_hour_courier_orders_check CHECK (courier_orders >= 0),
    ADD CONSTRAINT shop_sales_hour_returning_orders_check CHECK (returning_orders >= 0),
    ADD CONSTRAINT shop_sales_hour_size_spread_check CHECK (cardinality(size_spread) = 5);

CREATE TABLE public.shop_run_figures (
    shop_id uuid NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE,
    run_at timestamp with time zone NOT NULL,
    due integer NOT NULL,
    ready integer NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shop_run_figures_pkey PRIMARY KEY (shop_id, run_at),
    CONSTRAINT shop_run_figures_due_check CHECK (due >= 0),
    CONSTRAINT shop_run_figures_ready_check CHECK (ready >= 0 AND ready <= due)
);

CREATE TABLE public.shop_picker_day (
    shop_id uuid NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE,
    local_date date NOT NULL,
    staff_id uuid NOT NULL REFERENCES public.shop_staff(id) ON DELETE CASCADE,
    orders integer NOT NULL,
    ready_orders integer NOT NULL,
    ready_seconds bigint NOT NULL,
    cant_units integer NOT NULL,
    CONSTRAINT shop_picker_day_pkey PRIMARY KEY (shop_id, local_date, staff_id),
    CONSTRAINT shop_picker_day_counts_check CHECK (orders >= 0 AND ready_orders >= 0 AND ready_seconds >= 0 AND cant_units >= 0)
);

CREATE TABLE public.shop_product_pair_day (
    shop_id uuid NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE,
    local_date date NOT NULL,
    product_a uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
    product_b uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
    orders integer NOT NULL,
    CONSTRAINT shop_product_pair_day_pkey PRIMARY KEY (shop_id, local_date, product_a, product_b),
    CONSTRAINT shop_product_pair_day_order_check CHECK (product_a < product_b),
    CONSTRAINT shop_product_pair_day_orders_check CHECK (orders > 0)
);

CREATE INDEX shop_product_pair_day_b_idx ON public.shop_product_pair_day USING btree (product_b);

INSERT INTO public.insights_dirty (shop_id, bucket_start)
SELECT shop_id, bucket_start
  FROM public.shop_sales_hour
 WHERE bucket_start >= now() - interval '60 days'
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE public.shop_product_pair_day;
DROP TABLE public.shop_picker_day;
DROP TABLE public.shop_run_figures;

ALTER TABLE public.shop_sales_hour
    DROP CONSTRAINT shop_sales_hour_size_spread_check,
    DROP CONSTRAINT shop_sales_hour_returning_orders_check,
    DROP CONSTRAINT shop_sales_hour_courier_orders_check,
    DROP CONSTRAINT shop_sales_hour_effy_orders_check,
    DROP COLUMN size_spread,
    DROP COLUMN returning_orders,
    DROP COLUMN courier_orders,
    DROP COLUMN effy_orders;
