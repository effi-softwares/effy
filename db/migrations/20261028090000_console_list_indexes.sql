-- +goose NO TRANSACTION
-- 103 Console lists: indexes only — no table, column or data changes.
--
-- Every console list now searches, sorts and pages on the server (specs/103-console-data-tables). These are the
-- indexes the growing lists lacked: the back-office Orders list orders by (created_at, id) and searches order
-- numbers and customer emails with ILIKE '%…%'; Customers browses and searches emails; product lists search
-- a size's shop code. Small staff-sized tables (shops, vehicles, promotions) are deliberately not indexed for
-- search: a scan of tens of rows is cheaper than the index.
--
-- Each index is built CONCURRENTLY (no write lock on a live table), so this file runs outside a transaction.
-- If a build is interrupted it leaves an INVALID index; re-running drops nothing, so drop it by name and run
-- again (IF NOT EXISTS would otherwise keep the invalid one).

-- +goose Up
-- The Orders list's keyset order (newest first, id as the tie-break). Today only (customer_id, created_at).
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_created_id_idx ON public."order" USING btree (created_at DESC, id DESC);

-- Orders search: order number and customer email, anywhere in the text.
CREATE INDEX CONCURRENTLY IF NOT EXISTS order_number_trgm_idx ON public."order" USING gin (order_number public.gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS customer_email_trgm_idx ON public.customer USING gin ((email::text) public.gin_trgm_ops);

-- Customers browse: newest first with id as the tie-break.
CREATE INDEX CONCURRENTLY IF NOT EXISTS customer_created_id_idx ON public.customer USING btree (created_at DESC, id DESC);

-- Product lists search a size's shop code (SKU).
CREATE INDEX CONCURRENTLY IF NOT EXISTS product_variant_sku_trgm_idx ON public.product_variant USING gin (sku public.gin_trgm_ops) WHERE (sku IS NOT NULL);

-- Coverage postcodes are searched by prefix; the unique constraint's index cannot serve LIKE 'x%' under a
-- non-C collation.
CREATE INDEX CONCURRENTLY IF NOT EXISTS delivery_zone_postcode_prefix_idx ON public.delivery_zone_postcode USING btree (postcode text_pattern_ops);

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS public.delivery_zone_postcode_prefix_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.product_variant_sku_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.customer_created_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.customer_email_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.order_number_trgm_idx;
DROP INDEX CONCURRENTLY IF EXISTS public.order_created_id_idx;
