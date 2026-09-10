-- +goose Up
-- 057-shop-web-redesign (amendment): purchasing is DEFERRED, and removed rather than left dormant.
--
-- The design revision of 2026-09-10 drops the console's Restock screen entirely — suppliers, purchase
-- orders, receiving against an order. Inventory management stays where it already lives (Catalog and
-- each product's detail). Purchasing will return later as its own feature, with its own spec, and
-- there is no reason to assume it will want this schema: a schema nothing reads is a design decision
-- made in advance for a feature nobody has specified yet.
--
-- ⚠ THIS DROPS EVERYTHING 20260902044144_shop_console_redesign.sql ADDED FOR PURCHASING, AND NOTHING
-- ELSE. That migration's other half — `refund.actor_kind` gaining 'shop' — is the shop refund, which
-- stays. It is not touched here.
--
-- ⚠ DESTRUCTIVE BY DESIGN. Any supplier / purchase-order rows are discarded. The feature was never
-- deployed or walked, so in dev these are test rows at most. Stock counts are UNAFFECTED: a receive
-- against a purchase order wrote an ordinary `stock_movement` (reason 'received') and moved
-- `stock_on_hand`; only the citation column pointing back at the order line goes.
--
-- Order matters: the dependents first (the movement's citation, then lines → orders → suppliers, and
-- the product's pointer at a supplier) so no FK is left pointing at a dropped table.

DROP INDEX IF EXISTS public.stock_movement_purchase_order_line_id_idx;
ALTER TABLE public.stock_movement DROP COLUMN IF EXISTS purchase_order_line_id;

DROP INDEX IF EXISTS public.product_supplier_id_idx;
ALTER TABLE public.product DROP COLUMN IF EXISTS supplier_id;

DROP TABLE IF EXISTS public.purchase_order_line;
DROP TABLE IF EXISTS public.purchase_order;
DROP TABLE IF EXISTS public.supplier;

-- +goose Down
-- Dev-only single-step down (003). Restores the SHAPE only — the dropped rows are gone for good.
-- Mirrors 20260902044144_shop_console_redesign.sql; see that file for the reasoning on each column.
CREATE TABLE public.supplier (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    name          text NOT NULL CHECK (btrim(name) <> ''),
    contact_email text,
    contact_phone text,
    notes         text,
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT supplier_name_uq UNIQUE (shop_id, name)
);
CREATE INDEX supplier_shop_id_idx ON public.supplier (shop_id);

ALTER TABLE public.product
    ADD COLUMN supplier_id uuid REFERENCES public.supplier (id) ON DELETE SET NULL;
CREATE INDEX product_supplier_id_idx ON public.product (supplier_id);

CREATE TABLE public.purchase_order (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id        uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    supplier_id    uuid NOT NULL REFERENCES public.supplier (id) ON DELETE RESTRICT,
    reference      text NOT NULL CHECK (btrim(reference) <> ''),
    status         text NOT NULL DEFAULT 'draft' CHECK (status IN (
                       'draft', 'submitted', 'partially_received', 'received', 'cancelled')),
    currency       char(3) NOT NULL DEFAULT 'AUD',
    note           text,
    created_by_sub text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    submitted_at   timestamptz,
    closed_at      timestamptz,
    CONSTRAINT purchase_order_reference_uq UNIQUE (shop_id, reference),
    CONSTRAINT purchase_order_submitted_at_ck
        CHECK ((status = 'draft') = (submitted_at IS NULL)),
    CONSTRAINT purchase_order_closed_at_ck
        CHECK ((status IN ('received', 'cancelled')) = (closed_at IS NOT NULL))
);
CREATE INDEX purchase_order_shop_id_idx ON public.purchase_order (shop_id);
CREATE INDEX purchase_order_supplier_id_idx ON public.purchase_order (supplier_id);
CREATE INDEX purchase_order_shop_status_idx ON public.purchase_order (shop_id, status, created_at DESC);

CREATE TABLE public.purchase_order_line (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id uuid NOT NULL REFERENCES public.purchase_order (id) ON DELETE CASCADE,
    product_id        uuid NOT NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    ordered_quantity  int NOT NULL CHECK (ordered_quantity > 0),
    received_quantity int NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    unit_cost         numeric(12, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT purchase_order_line_product_uq UNIQUE (purchase_order_id, product_id)
);
CREATE INDEX purchase_order_line_order_id_idx ON public.purchase_order_line (purchase_order_id);
CREATE INDEX purchase_order_line_product_id_idx ON public.purchase_order_line (product_id);

ALTER TABLE public.stock_movement
    ADD COLUMN purchase_order_line_id uuid REFERENCES public.purchase_order_line (id) ON DELETE SET NULL;
CREATE INDEX stock_movement_purchase_order_line_id_idx
    ON public.stock_movement (purchase_order_line_id)
    WHERE purchase_order_line_id IS NOT NULL;
