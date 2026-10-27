-- 102 Back-office product catalogue: Effy sees every product, holds one off sale, and creates products
-- for a shop — one at a time or by importing a list.
--
-- • A hold is four columns on product. Holding sets status 'unavailable' (remembering the status before),
--   so every storefront reader — they sell only 'active' — drops the product with no change, and the CHECK
--   below means no route, present or future, can put a held product on sale.
-- • content_owner: 'effy' while Effy is still finishing a product it created — a draft that never enters the
--   review queue and carries the margin Effy set at creation. Effy approves it the moment it is complete; it
--   then goes on sale and becomes the shop's. created_via / import_id record where a product came from.
-- • product_import / product_import_row: one uploaded list for one shop, each row's check result.
-- Hold and release history is in admin.audit_log, like every other staff decision on a product.

-- +goose Up
CREATE TABLE public.product_import (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    shop_id uuid NOT NULL REFERENCES public.shop(id),
    file_name text NOT NULL,
    file_sha256 text NOT NULL,
    -- The sheet's header row, as parsed by the browser; each row's cells are read against it.
    columns jsonb NOT NULL,
    margin_kind text NOT NULL,
    margin_value numeric(12,4) NOT NULL,
    state text DEFAULT 'checking' NOT NULL,
    row_count integer DEFAULT 0 NOT NULL,
    ready_count integer DEFAULT 0 NOT NULL,
    created_count integer DEFAULT 0 NOT NULL,
    left_out_count integer DEFAULT 0 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_at timestamp with time zone,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_import_state_check CHECK (state IN ('checking', 'checked', 'creating', 'done', 'failed')),
    CONSTRAINT product_import_margin_kind_check CHECK (margin_kind IN ('percent', 'amount')),
    CONSTRAINT product_import_margin_value_check CHECK (margin_value >= 0),
    CONSTRAINT product_import_sha_check CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT product_import_columns_check CHECK (jsonb_typeof(columns) = 'array'),
    CONSTRAINT product_import_counts_check
        CHECK (row_count >= 0 AND ready_count >= 0 AND created_count >= 0 AND left_out_count >= 0)
);
CREATE INDEX product_import_shop_idx ON public.product_import (shop_id, created_at DESC);
CREATE INDEX product_import_created_idx ON public.product_import (created_at DESC);
CREATE INDEX product_import_sha_idx ON public.product_import (shop_id, file_sha256);

CREATE TABLE public.product_import_row (
    import_id uuid NOT NULL REFERENCES public.product_import(id) ON DELETE CASCADE,
    row_number integer NOT NULL,
    product_key text NOT NULL,
    cells jsonb NOT NULL,
    result text DEFAULT 'pending' NOT NULL,
    problems jsonb DEFAULT '[]'::jsonb NOT NULL,
    staged_media jsonb DEFAULT '[]'::jsonb NOT NULL,
    product_id uuid REFERENCES public.product(id) ON DELETE SET NULL,
    PRIMARY KEY (import_id, row_number),
    CONSTRAINT product_import_row_number_check CHECK (row_number >= 2),
    CONSTRAINT product_import_row_result_check CHECK (result IN ('pending', 'ready', 'not_ready', 'created', 'left_out')),
    CONSTRAINT product_import_row_cells_check CHECK (jsonb_typeof(cells) = 'array'),
    CONSTRAINT product_import_row_problems_check CHECK (jsonb_typeof(problems) = 'array'),
    CONSTRAINT product_import_row_media_check CHECK (jsonb_typeof(staged_media) = 'array')
);
CREATE INDEX product_import_row_product_idx ON public.product_import_row (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.product
    ADD COLUMN held_at timestamp with time zone,
    ADD COLUMN held_by text,
    ADD COLUMN held_reason text,
    ADD COLUMN held_prior_status text,
    ADD COLUMN content_owner text DEFAULT 'shop' NOT NULL,
    ADD COLUMN created_via text DEFAULT 'shop' NOT NULL,
    ADD COLUMN import_id uuid REFERENCES public.product_import(id),
    ADD CONSTRAINT product_hold_shape_ck CHECK (
        (held_at IS NULL) = (held_by IS NULL)
        AND (held_at IS NULL) = (held_reason IS NULL)
        AND (held_at IS NULL) = (held_prior_status IS NULL)),
    ADD CONSTRAINT product_held_prior_status_ck
        CHECK (held_prior_status IS NULL OR held_prior_status IN ('draft', 'active', 'unavailable')),
    ADD CONSTRAINT product_held_reason_ck
        CHECK (held_reason IS NULL OR (char_length(btrim(held_reason)) BETWEEN 1 AND 500)),
    -- The guarantee: a held product is never on sale, whichever route tries.
    ADD CONSTRAINT product_held_not_active_ck CHECK (held_at IS NULL OR status <> 'active'),
    ADD CONSTRAINT product_held_not_archived_ck CHECK (held_at IS NULL OR status <> 'archived'),
    ADD CONSTRAINT product_content_owner_ck CHECK (content_owner IN ('shop', 'effy')),
    -- Effy's unfinished product: never approved yet, never in the queue, its margin already chosen.
    ADD CONSTRAINT product_effy_owned_draft_ck
        CHECK (content_owner = 'shop' OR (approved_at IS NULL AND review_state = 'none' AND margin_kind IS NOT NULL)),
    ADD CONSTRAINT product_created_via_ck CHECK (created_via IN ('shop', 'effy', 'import')),
    ADD CONSTRAINT product_import_origin_ck CHECK ((created_via = 'import') = (import_id IS NOT NULL));

CREATE INDEX product_held_idx ON public.product (held_at) WHERE held_at IS NOT NULL;
CREATE INDEX product_import_idx ON public.product (import_id) WHERE import_id IS NOT NULL;
CREATE INDEX product_updated_idx ON public.product (updated_at DESC, id);
-- The cross-shop SKU search; the per-shop unique index cannot serve a search without a shop.
CREATE INDEX product_variant_sku_lower_idx ON public.product_variant (lower(sku))
    WHERE sku IS NOT NULL AND state <> 'removed';

ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check CHECK (type IN (
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
    'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
    'run_changed', 'run_withdrawn', 'run_opens_soon',
    'shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported'));

-- +goose Down
DELETE FROM public.notification_request
 WHERE type IN ('shop_product_held', 'shop_product_released', 'shop_product_added_by_effy', 'shop_products_imported');
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check CHECK (type IN (
    'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered', 'shop_new_order', 'run_assigned',
    'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed', 'shop_product_approved',
    'shop_product_sent_back', 'points_credited', 'points_expiring', 'order_with_courier', 'order_delivery_changed',
    'run_changed', 'run_withdrawn', 'run_opens_soon'));

DROP INDEX public.product_variant_sku_lower_idx;
DROP INDEX public.product_updated_idx;
DROP INDEX public.product_import_idx;
DROP INDEX public.product_held_idx;
-- A held product goes back to the status it had; the hold itself is lost (one-way for holds).
UPDATE public.product
   SET status = held_prior_status, held_at = NULL, held_by = NULL, held_reason = NULL, held_prior_status = NULL
 WHERE held_at IS NOT NULL;
ALTER TABLE public.product
    DROP COLUMN import_id,
    DROP COLUMN created_via,
    DROP COLUMN content_owner,
    DROP COLUMN held_prior_status,
    DROP COLUMN held_reason,
    DROP COLUMN held_by,
    DROP COLUMN held_at;
DROP TABLE public.product_import_row;
DROP TABLE public.product_import;
