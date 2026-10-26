-- 101 — empty the catalogue so the category-driven catalogue migration can run. DEV ONLY, operator-run.
--
--     make purge-orders ENV=dev                                   -- orders first (this script refuses otherwise)
--     psql "$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)" -f db/reset/101_purge_catalogue_dev.sql
--     make db-up ENV=dev                                          -- <ts>_category_catalogue.sql refuses a non-empty catalogue
--
-- Removes every product and everything that points at one: cart and saved lines, saved items and their list
-- entries, stock history, sales rollups, pending changes, GST history, pictures' rows, sections, options,
-- variants, details. Promotions that target a product or a category are removed whole, because without
-- their targets they would widen to everything. Accounts, shops, brand-targeted promotions and media files in
-- S3 are not touched (an orphaned `products/` object is never addressed again).

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public."order") THEN
        RAISE EXCEPTION '101 purge: orders still exist. Run `make purge-orders ENV=dev` first. Nothing was removed.';
    END IF;
END
$$;

SELECT 'products' AS what, count(*) FROM public.product
UNION ALL SELECT 'variants', count(*) FROM public.product_variant
UNION ALL SELECT 'cart lines', count(*) FROM public.cart_item
UNION ALL SELECT 'saved items', count(*) FROM public.customer_saved_item
UNION ALL SELECT 'promotions targeting products or categories',
                 count(DISTINCT promotion_id) FROM public.promotion_target WHERE target_type IN ('product', 'category');

DELETE FROM public.promotion
 WHERE id IN (SELECT promotion_id FROM public.promotion_target WHERE target_type IN ('product', 'category'));

-- DELETE, children before parents, not TRUNCATE: TRUNCATE refuses any table another table's foreign key
-- names (order_item → product_variant) even when that table is empty, and with no orders left nothing
-- points here any more. A row something still references stops the whole transaction, removing nothing.
DELETE FROM public.customer_list_entry;
DELETE FROM public.customer_saved_item;
DELETE FROM public.cart_item;
DELETE FROM public.cart_saved_item;
DELETE FROM public.stock_movement;
DELETE FROM public.shop_product_sales_day;
DELETE FROM public.product_change_media;
DELETE FROM public.product_change;
DELETE FROM public.product_gst_change;
DELETE FROM public.product_attribute_value;
DELETE FROM public.product_section;
DELETE FROM public.product_variant;
DELETE FROM public.product_option_value;
DELETE FROM public.product_option;
DELETE FROM public.product_media;
DELETE FROM public.product;

SELECT 'products left' AS what, count(*) FROM public.product;

COMMIT;
