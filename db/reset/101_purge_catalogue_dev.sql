-- 101 — empty the catalogue so the category-driven catalogue migration can run. DEV ONLY, operator-run.
--
--     make purge-orders ENV=dev                                   -- orders first (this script refuses otherwise)
--     psql "$(bash infra/scripts/db-dsn.sh dev)" -f db/reset/101_purge_catalogue_dev.sql
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

TRUNCATE public.customer_list_entry,
         public.customer_saved_item,
         public.cart_item,
         public.cart_saved_item,
         public.stock_movement,
         public.shop_product_sales_day,
         public.product_change_media,
         public.product_change,
         public.product_gst_change,
         public.product_attribute_value,
         public.product_section,
         public.product_variant,
         public.product_option_value,
         public.product_option,
         public.product_media,
         public.product;

COMMIT;
