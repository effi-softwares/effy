-- 114 Hold stock at checkout (specs/114-checkout-stock-holds).
--
-- • stock_hold: units of one counted size held for one unpaid order, written at payment start. A row counts only
--   while `held_until > now()` - it runs out by itself, so nothing sweeps it. Rows are deleted when the order ends
--   (paid, abandoned, failed) or its next payment start replaces them, so the table only ever holds unpaid orders'
--   rows. One writer: @effy/edge-shared/stock `holds.ts`; "left to sell" (shelf minus other customers' live holds)
--   is read only through `lib/availability.ts`. A hold never changes `product_variant.stock_on_hand`.
--   `customer_id` is the order's, kept here so a shopper's own holds can be left out without a join.
-- • housekeeping_settings.stock_hold_min: how long a new hold lasts (admins set it on Settings › Clean-ups).
-- Additive: code from before 114 neither reads nor writes either.

-- +goose Up
CREATE TABLE public.stock_hold (
    order_id uuid NOT NULL REFERENCES public."order"(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES public.product_variant(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.customer(id),
    quantity integer NOT NULL,
    held_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (order_id, variant_id),
    CONSTRAINT stock_hold_quantity_check CHECK (quantity > 0)
);
CREATE INDEX stock_hold_variant_idx ON public.stock_hold (variant_id, held_until);
CREATE INDEX stock_hold_customer_idx ON public.stock_hold (customer_id);

ALTER TABLE public.housekeeping_settings ADD COLUMN stock_hold_min integer DEFAULT 15 NOT NULL;
ALTER TABLE public.housekeeping_settings ADD CONSTRAINT housekeeping_settings_stock_hold_check
    CHECK (stock_hold_min BETWEEN 5 AND 60);

-- Shoppers' role (commerce) holds and finalises, so `stock_hold` keeps its default grants.

-- +goose Down
ALTER TABLE public.housekeeping_settings DROP CONSTRAINT housekeeping_settings_stock_hold_check;
ALTER TABLE public.housekeeping_settings DROP COLUMN stock_hold_min;
DROP TABLE public.stock_hold;
