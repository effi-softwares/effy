-- T088a — SC-004 latency verification seed (THROWAWAY; operator-run against dev, then removed).
--
-- Inserts 10,000 products into the FIRST shop, then times the first-page + total-count list query
-- (the path GET /shop/v1/products runs) and asserts it stays well under 1s at 10k+/shop.
-- Run AFTER `make db-up ENV=dev` and after at least one shop exists (009). Clean up at the end.
--
--   psql "$DSN" -f specs/016-shop-product-catalog/perf-seed.sql
--
-- Requires: a row in public.shop, and the 016 seed (product_type + category present).

\timing on

DO $$
DECLARE
  v_shop uuid;
  v_type uuid;
  v_cat  uuid;
BEGIN
  SELECT id INTO v_shop FROM public.shop ORDER BY created_at LIMIT 1;
  SELECT id INTO v_type FROM public.product_type WHERE key = 'packaged_grocery';
  SELECT id INTO v_cat  FROM public.category WHERE key = 'pantry';
  IF v_shop IS NULL OR v_type IS NULL OR v_cat IS NULL THEN
    RAISE EXCEPTION 'need a shop + the 016 seed (packaged_grocery / pantry) present';
  END IF;

  INSERT INTO public.product
    (shop_id, product_type_id, primary_category_id, name, sku, brand,
     price_amount, short_description, status, created_by)
  SELECT v_shop, v_type, v_cat,
         'Perf Product ' || g,
         'PERF-' || g,
         (ARRAY['Acme','Globex','Umbrella','Initech','Soylent'])[1 + (g % 5)],
         (1 + (g % 5000))::numeric / 100,
         'A seeded product for latency testing number ' || g,
         'active',
         'perf-seed'
  FROM generate_series(1, 10000) AS g;
END $$;

ANALYZE public.product;

-- The exact shape GET /shop/v1/products issues for the first page (recent, desc), incl. count OVER.
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT p.id, p.name, p.brand,
       (SELECT storage_key FROM public.product_media m WHERE m.product_id = p.id AND m.is_primary LIMIT 1),
       pt.name, c.name, p.price_amount::text, p.currency, p.status, p.sku, p.updated_at,
       count(*) OVER() AS total
  FROM public.product p
  JOIN public.product_type pt ON pt.id = p.product_type_id
  JOIN public.category c ON c.id = p.primary_category_id
 WHERE p.shop_id = (SELECT id FROM public.shop ORDER BY created_at LIMIT 1)
 ORDER BY p.created_at DESC
 LIMIT 20 OFFSET 0;

-- A trigram search variant (the `q` path).
EXPLAIN (ANALYZE, BUFFERS, TIMING)
SELECT count(*) OVER() AS total, p.id
  FROM public.product p
 WHERE p.shop_id = (SELECT id FROM public.shop ORDER BY created_at LIMIT 1)
   AND lower(p.name || ' ' || coalesce(p.sku,'') || ' ' || coalesce(p.brand,'') || ' ' || p.short_description)
       LIKE '%' || lower('globex') || '%'
 LIMIT 20;

-- ── Cleanup (remove the throwaway rows) ──────────────────────────────────────────────────────────
DELETE FROM public.product WHERE created_by = 'perf-seed';
ANALYZE public.product;

\echo 'SC-004 check: both EXPLAIN ANALYZE "Execution Time" lines must be < 1000 ms. Rows removed.'
