-- 101 — replace the whole catalogue with a tiny starter set. DEV ONLY, operator-run.
--
--     make purge-orders ENV=dev                                   -- orders first (this script refuses otherwise)
--     psql "$(AWS_PROFILE=ef infra/scripts/db-dsn.sh dev)" -f db/reset/101_minimal_catalogue_dev.sql
--
-- Removes every product (and everything that points at one), every category, every attribute and every
-- attachment — the seeded 25-department tree included. Promotions that target a product or a category are
-- removed whole, because without their targets they would widen to everything. Then adds:
--   • Dairy & Eggs (chilled, GST-free) › Milk (the one leaf)
--   • two attributes on Dairy & Eggs: Country of origin (single choice, required, a filter) and
--     Organic (yes/no, recommended, a filter)
--   • one product in the oldest active shop: Full Cream Milk 2 L, approved and on sale, 20 in stock.
-- Accounts, shops, brand-targeted promotions and media files in S3 are not touched. One transaction: any
-- failure removes nothing.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE seed_shop ON COMMIT DROP AS
SELECT id AS shop_id FROM public.shop WHERE status = 'active' ORDER BY created_at, id LIMIT 1;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public."order") THEN
        RAISE EXCEPTION '101 minimal: orders still exist. Run `make purge-orders ENV=dev` first. Nothing was removed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM seed_shop) THEN
        RAISE EXCEPTION '101 minimal: there is no active shop for the product. Nothing was removed.';
    END IF;
END
$$;

-- ── 1. Empty the catalogue ─────────────────────────────────────────────────────────────────────────
DELETE FROM public.promotion
 WHERE id IN (SELECT promotion_id FROM public.promotion_target WHERE target_type IN ('product', 'category'));

-- Children before parents (DELETE, not TRUNCATE: order_item names product_variant).
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
DELETE FROM public.product_placement;
DELETE FROM public.product_section;
DELETE FROM public.product_variant;
DELETE FROM public.product_option_value;
DELETE FROM public.product_option;
DELETE FROM public.product_media;
DELETE FROM public.product;

-- ── 2. Empty the taxonomy ──────────────────────────────────────────────────────────────────────────
DELETE FROM public.category_attribute;
DELETE FROM public.attribute_allowed_value;
DELETE FROM public.attribute_definition;
-- parent_id is ON DELETE RESTRICT: deepest first.
DELETE FROM public.category c USING public.category_resolved r WHERE r.category_id = c.id AND r.depth = 5;
DELETE FROM public.category c USING public.category_resolved r WHERE r.category_id = c.id AND r.depth = 4;
DELETE FROM public.category c USING public.category_resolved r WHERE r.category_id = c.id AND r.depth = 3;
DELETE FROM public.category c USING public.category_resolved r WHERE r.category_id = c.id AND r.depth = 2;
-- Retired categories are not in category_resolved; unlink everything, then the rest goes in one statement.
UPDATE public.category SET parent_id = NULL WHERE parent_id IS NOT NULL;
DELETE FROM public.category;

-- ── 3. The starter taxonomy ────────────────────────────────────────────────────────────────────────
INSERT INTO public.category (key, parent_id, name, "position", icon, synonyms, default_storage, default_gst_status, default_age_restricted)
VALUES ('dairy-and-eggs', NULL, 'Dairy & Eggs', 10, 'milk', ARRAY['dairy']::text[], 'chilled', 'gst_free', false);

INSERT INTO public.category (key, parent_id, name, "position", icon, synonyms)
SELECT 'milk', c.id, 'Milk', 10, 'milk', ARRAY['full cream', 'skim', 'lite milk']::text[]
  FROM public.category c WHERE c.key = 'dairy-and-eggs';

INSERT INTO public.attribute_definition (key, name, input_type, help_text, filterable, customer_visible)
VALUES ('country_of_origin', 'Country of origin', 'single_select', 'Where the product was made or grown.', true, true),
       ('organic', 'Organic', 'boolean', 'Certified organic.', true, true);

INSERT INTO public.attribute_allowed_value (attribute_definition_id, label, "position")
SELECT ad.id, v.label, v.pos
  FROM public.attribute_definition ad
 CROSS JOIN (VALUES ('Australia', 0), ('New Zealand', 1), ('Imported', 2)) AS v (label, pos)
 WHERE ad.key = 'country_of_origin';

INSERT INTO public.category_attribute (category_id, attribute_id, level, hidden, section, "position")
SELECT c.id, ad.id, a.level, false, 'Details', a.pos
  FROM (VALUES ('country_of_origin', 'required', 10), ('organic', 'recommended', 20)) AS a (attr, level, pos)
  JOIN public.attribute_definition ad ON ad.key = a.attr
  JOIN public.category c ON c.key = 'dairy-and-eggs';

SELECT public.rebuild_category_derived();

-- ── 4. The product ─────────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE seed_pid ON COMMIT DROP AS
SELECT gen_random_uuid() AS product_id, c.id AS leaf_id FROM public.category c WHERE c.key = 'milk';

-- Storage, GST and 18+ are the leaf's resolved defaults, as a shop's new product takes them.
INSERT INTO public.product (
    id, shop_id, primary_category_id, name, brand, currency, short_description,
    status, approved_at, created_by, gst_status, storage, age_restricted, unit_basis)
SELECT i.product_id, s.shop_id, i.leaf_id, 'Full Cream Milk 2L', 'Farmhouse', 'AUD', 'Fresh full cream milk.',
       'active', now(), 'seed:101', r.gst_status, r.storage, r.age_restricted, 'per_l'
  FROM seed_pid i
  JOIN public.category_resolved r ON r.category_id = i.leaf_id
 CROSS JOIN seed_shop s;

INSERT INTO public.product_variant (
    product_id, shop_id, "position", sku, shop_price_amount, price_amount,
    weight_grams, weight_is_assumed, pack_quantity, pack_unit, stock_tracked, stock_on_hand)
SELECT i.product_id, s.shop_id, 0, 'SEED101-MILK-2L', 3.60, 3.60, 2100, false, 2, 'l', true, 20
  FROM seed_pid i CROSS JOIN seed_shop s;

INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, allowed_value_ids)
SELECT i.product_id, ad.id, ARRAY[av.id]
  FROM seed_pid i
  JOIN public.attribute_definition ad ON ad.key = 'country_of_origin'
  JOIN public.attribute_allowed_value av ON av.attribute_definition_id = ad.id AND av.label = 'Australia';

INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_boolean)
SELECT i.product_id, ad.id, false
  FROM seed_pid i JOIN public.attribute_definition ad ON ad.key = 'organic';

-- A tracked variant's opening count is explained by a movement, as every count must be.
INSERT INTO public.stock_movement (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind)
SELECT v.product_id, v.id, v.shop_id, v.stock_on_hand, 0, v.stock_on_hand, 'tracking_enabled', 'system'
  FROM public.product_variant v JOIN seed_pid i ON i.product_id = v.product_id;

-- The listing summary, as refreshListing computes it for one variant.
UPDATE public.product p SET list_price_amount = 3.60, list_compare_at_amount = NULL, price_varies = false
  FROM seed_pid i WHERE p.id = i.product_id;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.product p CROSS JOIN LATERAL public.product_missing_required(p.id) m) THEN
        RAISE EXCEPTION '101 minimal: the product is missing a required detail. Nothing was changed.';
    END IF;
END
$$;

COMMIT;

SELECT (SELECT count(*) FROM public.category) AS categories,
       (SELECT count(*) FROM public.attribute_definition) AS attributes,
       (SELECT count(*) FROM public.product) AS products,
       (SELECT count(*) FROM public.product_variant) AS variants;
