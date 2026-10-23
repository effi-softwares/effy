-- Dev catalogue seed: Products with variants, on the aisles 084_storefront_catalogue_dev.sql creates. Dev only.
--
--     psql "$DSN" -f db/seeds/084_storefront_catalogue_dev.sql     -- aisles first
--     psql "$DSN" -f db/seeds/098_variant_catalogue_dev.sql
--
-- In one transaction:
--   • Seeds into the oldest active shop; with none it stops, having written nothing (a shop is never invented).
--   • Products are on sale at once: Active, approved, no margin (customer price = shop price), no picture.
--   • Three shapes, so every screen has something to show:
--       – no options          (one variant, no selector)               e.g. Sourdough Loaf
--       – one option, Size     (with a unit basis and pack sizes)      e.g. Basmati Rice 500 g / 1 kg / 5 kg
--       – two options          (not every combination exists)          e.g. Greek Yoghurt Flavour × Size
--   • Every variant is stock-counted: Some low and one at zero, so "Sold out" and the restock list show.
--   • Each product's listing summary is set exactly as refreshListing (@effy/edge-shared/catalog) does.
--
-- No GST history row is written (product_gst_change needs a shop or Effy actor). Refuses if a SEED098-
-- stock code is already in the shop.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE seed_shop ON COMMIT DROP AS
SELECT id AS shop_id FROM public.shop WHERE status = 'active' ORDER BY created_at, id LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seed_shop) THEN
        RAISE EXCEPTION '098 seed: there is no active shop to seed into. Nothing was written.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.product_variant v JOIN seed_shop s ON s.shop_id = v.shop_id WHERE v.sku LIKE 'SEED098-%') THEN
        RAISE EXCEPTION '098 seed: already seeded (SEED098- stock codes exist). Nothing was written.';
    END IF;
END
$$;

-- ── The products ────────────────────────────────────────────────────────────────────────────────
-- Opt1/opt2 are the option NAMES (NULL = no such option).

CREATE TEMP TABLE seed_p (
    pkey text PRIMARY KEY, category_key text, type_key text, name text, brand text, blurb text,
    gst text, unit_basis text, opt1 text, opt2 text
) ON COMMIT DROP;

INSERT INTO seed_p VALUES
    ('rice',     'pasta_rice_rice',          'packaged_grocery', 'Basmati Rice',            'Effy Pantry', 'Long grain basmati, aged for aroma.',  'gst_free', 'per_kg',    'Size', NULL),
    ('milk',     'milk_full_cream',          'beverage',         'Full Cream Milk',         'Farmhouse',   'Fresh full cream milk.',               'gst_free', 'per_l',     'Size', NULL),
    ('oatmilk',  'plant_milk_oat',           'beverage',         'Oat Milk',                'Oatly Fields','Oat milk for coffee and cereal.',      'gst_free', 'per_l',     'Style', 'Size'),
    ('yoghurt',  'yoghurt_greek',            'packaged_grocery', 'Greek Yoghurt',           'Hilltop',     'Thick, strained Greek yoghurt.',       'gst_free', 'per_kg',    'Flavour', 'Size'),
    ('cheese',   'cheese_block',             'packaged_grocery', 'Tasty Cheese Block',      'Hilltop',     'Mature cheddar.',                      'gst_free', 'per_kg',    'Size', NULL),
    ('eggs',     'eggs_free_range',          'packaged_grocery', 'Free Range Eggs',         'Sunny Farm',  'Large free range eggs.',               'gst_free', 'each',      'Pack', NULL),
    ('butter',   'butter_spreads_butter',    'packaged_grocery', 'Butter 250g',             'Farmhouse',   'Churned Australian butter.',           'gst_free', 'per_100g',  'Type', NULL),
    ('apples',   'fruit_apples_and_pears',   'packaged_grocery', 'Royal Gala Apples',       NULL,          'Crisp and sweet.',                     'gst_free', 'per_kg',    'Size', NULL),
    ('bananas',  'fruit_bananas',            'packaged_grocery', 'Cavendish Bananas 1kg',   NULL,          'Ripen at home.',                       'gst_free', 'per_kg',    NULL, NULL),
    ('sourdough','bread_sourdough',          'prepared_food',    'Sourdough Loaf 750g',     'Effy Bakery', 'Slow fermented sourdough.',            'gst_free', 'per_100g',  NULL, NULL),
    ('croissant','sweet_bakery_pastries',    'prepared_food',    'Butter Croissants',       'Effy Bakery', 'All-butter croissants.',               'gst_free', 'each',      'Pack', NULL),
    ('mince',    'beef_lamb_mince',          'packaged_grocery', 'Beef Mince',              NULL,          'Lean beef mince.',                     'gst_free', 'per_kg',    'Fat', 'Size'),
    ('chicken',  'poultry_chicken_breast',   'packaged_grocery', 'Chicken Breast Fillets',  NULL,          'Skinless chicken breast.',             'gst_free', 'per_kg',    'Size', NULL),
    ('pasta',    'pasta_rice_pasta',         'packaged_grocery', 'Durum Wheat Pasta 500g',  'Effy Pantry', 'Bronze-cut durum wheat pasta.',        'gst_free', 'per_100g',  'Shape', NULL),
    ('coffee',   'coffee_tea_coffee',        'packaged_grocery', 'Coffee',                  'Roastery Co', 'Medium roast.',                        'gst_free', 'per_100g',  'Grind', 'Size'),
    ('tea',      'coffee_tea_tea',           'packaged_grocery', 'English Breakfast Tea',   'Teahouse',    'A strong morning cup.',                'gst_free', 'each',      'Box', NULL),
    ('cola',     'soft_drinks_cola',         'beverage',         'Cola',                    'Fizz',        'Classic cola.',                        'taxable',  'per_l',     'Pack', NULL),
    ('water',    'water_sparkling_water',    'beverage',         'Sparkling Water',         'Spring Co',   'Lightly sparkling.',                   'taxable',  'per_l',     'Flavour', NULL),
    ('chips',    'chips_potato_chips',       'packaged_grocery', 'Potato Chips 175g',       'Crunch',      'Kettle cooked.',                       'taxable',  'per_100g',  'Flavour', NULL),
    ('chocolate','chocolate_blocks',         'packaged_grocery', 'Chocolate Block 180g',    'Cacao & Co',  'Smooth chocolate.',                    'taxable',  'per_100g',  'Type', NULL),
    ('icecream', 'ice_cream_tubs',           'packaged_grocery', 'Ice Cream Tub 2L',        'Creamery',    'Classic ice cream.',                   'taxable',  'per_l',     'Flavour', NULL),
    ('cleaner',  'cleaning_surface_cleaners','household',        'Multipurpose Cleaner',    'Sparkle',     'For kitchen and bathroom.',            'taxable',  'per_l',     'Scent', 'Size'),
    ('tissues',  'paper_goods_tissues',      'household',        'Facial Tissues 224 Pack', 'Softly',      'Soft 2 ply tissues.',                  'taxable',  'each',      NULL, NULL),
    ('nappies',  'nappies_nappies',          'household',        'Nappies',                 'Little Ones', 'Soft, absorbent nappies.',             'taxable',  'each',      'Size', NULL);

-- ── The variants ────────────────────────────────────────────────────────────────────────────────
-- V1/v2 are option VALUES in the order given (that order is the selector's order). Pos = display order.

CREATE TEMP TABLE seed_v (
    pkey text, pos int, v1 text, v2 text, sku text, price numeric, was numeric,
    pack_qty numeric, pack_unit text, weight int, tracked boolean, on_hand int
) ON COMMIT DROP;

INSERT INTO seed_v VALUES
    ('rice', 0, '500 g', NULL, 'SEED098-RICE-500',  3.20, NULL,  500, 'g',  520, true, 40),
    ('rice', 1, '1 kg',  NULL, 'SEED098-RICE-1K',   5.50, NULL,    1, 'kg', 1030, true, 3),
    ('rice', 2, '5 kg',  NULL, 'SEED098-RICE-5K',  21.00, 24.00,   5, 'kg', 5100, true, 0),
    ('milk', 0, '1 L',   NULL, 'SEED098-MILK-1L',   2.10, NULL,    1, 'l',  1060, true, 27),
    ('milk', 1, '2 L',   NULL, 'SEED098-MILK-2L',   3.60, NULL,    2, 'l',  2100, true, 34),
    ('milk', 2, '3 L',   NULL, 'SEED098-MILK-3L',   4.90, NULL,    3, 'l',  3150, true, 41),
    ('oatmilk', 0, 'Original', '1 L', 'SEED098-OAT-OR-1', 3.00, NULL, 1, 'l', 1050, true, 48),
    ('oatmilk', 1, 'Original', '2 L', 'SEED098-OAT-OR-2', 5.20, NULL, 2, 'l', 2080, true, 25),
    ('oatmilk', 2, 'Barista',  '1 L', 'SEED098-OAT-BA-1', 3.40, 4.00, 1, 'l', 1050, true, 32),
    ('yoghurt', 0, 'Natural', '500 g', 'SEED098-YOG-NA-5', 3.40, NULL, 500, 'g', 540, true, 39),
    ('yoghurt', 1, 'Natural', '1 kg',  'SEED098-YOG-NA-1', 5.80, NULL,   1, 'kg', 1060, true, 46),
    ('yoghurt', 2, 'Honey',   '500 g', 'SEED098-YOG-HO-5', 4.50, NULL, 500, 'g', 540, true, 2),
    ('cheese', 0, '250 g', NULL, 'SEED098-CHE-250', 5.00, NULL, 250, 'g', 270, true, 23),
    ('cheese', 1, '500 g', NULL, 'SEED098-CHE-500', 8.50, NULL, 500, 'g', 520, true, 30),
    ('cheese', 2, '1 kg',  NULL, 'SEED098-CHE-1K', 15.00, 17.00, 1, 'kg', 1030, true, 37),
    ('eggs', 0, '6 pack',  NULL, 'SEED098-EGG-6',  4.20, NULL,  6, 'each', 380, true, 44),
    ('eggs', 1, '12 pack', NULL, 'SEED098-EGG-12', 7.20, NULL, 12, 'each', 760, true, 12),
    ('eggs', 2, '30 pack', NULL, 'SEED098-EGG-30', 15.00, NULL, 30, 'each', 1900, true, 21),
    ('butter', 0, 'Salted',   NULL, 'SEED098-BUT-SA', 4.90, NULL, 250, 'g', 260, true, 28),
    ('butter', 1, 'Unsalted', NULL, 'SEED098-BUT-UN', 4.90, NULL, 250, 'g', 260, true, 35),
    ('apples', 0, '1 kg', NULL, 'SEED098-APP-1K', 4.90, NULL, 1, 'kg', 1000, true, 42),
    ('apples', 1, '2 kg', NULL, 'SEED098-APP-2K', 8.90, NULL, 2, 'kg', 2000, true, 49),
    ('bananas', 0, NULL, NULL, 'SEED098-BAN', 3.90, NULL, 1, 'kg', 1000, true, 26),
    ('sourdough', 0, NULL, NULL, 'SEED098-SOUR', 6.50, NULL, 750, 'g', 760, true, 8),
    ('croissant', 0, '4 pack', NULL, 'SEED098-CRO-4', 5.00, NULL, 4, 'each', 280, true, 33),
    ('croissant', 1, '8 pack', NULL, 'SEED098-CRO-8', 9.00, NULL, 8, 'each', 560, true, 40),
    ('mince', 0, 'Regular',   '500 g', 'SEED098-MIN-RE-5', 7.00, NULL, 500, 'g', 520, true, 47),
    ('mince', 1, 'Regular',   '1 kg',  'SEED098-MIN-RE-1', 13.00, NULL, 1, 'kg', 1030, true, 24),
    ('mince', 2, 'Lean',      '500 g', 'SEED098-MIN-LE-5', 8.50, NULL, 500, 'g', 520, true, 31),
    ('mince', 3, 'Lean',      '1 kg',  'SEED098-MIN-LE-1', 16.00, 18.00, 1, 'kg', 1030, true, 38),
    ('chicken', 0, '500 g', NULL, 'SEED098-CHK-500', 9.50, NULL, 500, 'g', 520, true, 45),
    ('chicken', 1, '1 kg',  NULL, 'SEED098-CHK-1K', 17.50, NULL, 1, 'kg', 1030, true, 22),
    ('pasta', 0, 'Penne',     NULL, 'SEED098-PAS-PEN', 2.20, NULL, 500, 'g', 510, true, 29),
    ('pasta', 1, 'Spaghetti', NULL, 'SEED098-PAS-SPA', 2.20, NULL, 500, 'g', 510, true, 36),
    ('pasta', 2, 'Fusilli',   NULL, 'SEED098-PAS-FUS', 2.40, NULL, 500, 'g', 510, true, 43),
    ('coffee', 0, 'Whole beans', '250 g', 'SEED098-COF-WB-2', 7.00, NULL, 250, 'g', 270, true, 20),
    ('coffee', 1, 'Whole beans', '1 kg',  'SEED098-COF-WB-1', 24.00, 28.00, 1, 'kg', 1040, true, 27),
    ('coffee', 2, 'Ground',      '250 g', 'SEED098-COF-GR-2', 7.00, NULL, 250, 'g', 270, true, 34),
    ('tea', 0, '50 bags',  NULL, 'SEED098-TEA-50', 3.20, NULL, 50, 'each', 120, true, 41),
    ('tea', 1, '100 bags', NULL, 'SEED098-TEA-100', 5.50, NULL, 100, 'each', 240, true, 48),
    ('cola', 0, '1.25 L bottle', NULL, 'SEED098-COLA-125', 2.50, NULL, 1.25, 'l', 1320, true, 25),
    ('cola', 1, '10 x 375 mL',  NULL, 'SEED098-COLA-10', 9.00, 11.00, 3.75, 'l', 4100, true, 32),
    ('water', 0, 'Natural', NULL, 'SEED098-WAT-NA', 1.80, NULL, 1.25, 'l', 1300, true, 39),
    ('water', 1, 'Lemon',   NULL, 'SEED098-WAT-LE', 2.20, NULL, 1.25, 'l', 1300, true, 46),
    ('water', 2, 'Lime',    NULL, 'SEED098-WAT-LI', 2.20, NULL, 1.25, 'l', 1300, true, 23),
    ('chips', 0, 'Sea salt',      NULL, 'SEED098-CHI-SS', 4.00, NULL, 175, 'g', 200, true, 30),
    ('chips', 1, 'Salt & vinegar',NULL, 'SEED098-CHI-SV', 4.00, NULL, 175, 'g', 200, true, 37),
    ('chocolate', 0, 'Milk', NULL, 'SEED098-CHO-MI', 4.50, NULL, 180, 'g', 200, true, 44),
    ('chocolate', 1, 'Dark', NULL, 'SEED098-CHO-DA', 3.50, 5.00, 180, 'g', 200, true, 21),
    ('icecream', 0, 'Vanilla',   NULL, 'SEED098-ICE-VA', 6.50, NULL, 2, 'l', 1100, true, 28),
    ('icecream', 1, 'Chocolate', NULL, 'SEED098-ICE-CH', 6.50, NULL, 2, 'l', 1100, true, 35),
    ('cleaner', 0, 'Lemon',     '750 mL', 'SEED098-CLE-LE-7', 4.00, NULL, 750, 'ml', 820, true, 42),
    ('cleaner', 1, 'Lemon',     '2 L',    'SEED098-CLE-LE-2', 9.00, NULL, 2, 'l', 2150, true, 49),
    ('cleaner', 2, 'Eucalyptus','750 mL', 'SEED098-CLE-EU-7', 4.00, NULL, 750, 'ml', 820, true, 26),
    ('tissues', 0, NULL, NULL, 'SEED098-TIS', 2.80, NULL, 224, 'each', 450, true, 33),
    ('nappies', 0, 'Crawler 6–11 kg', NULL, 'SEED098-NAP-CR', 16.00, 19.00, 44, 'each', 1400, true, 5),
    ('nappies', 1, 'Walker 10–15 kg', NULL, 'SEED098-NAP-WA', 16.00, NULL, 40, 'each', 1450, true, 40);

-- ── Write ───────────────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE seed_pid ON COMMIT DROP AS
SELECT sp.pkey, gen_random_uuid() AS product_id FROM seed_p sp;

INSERT INTO public.product (
    id, shop_id, product_type_id, primary_category_id, name, brand, currency, short_description,
    status, approved_at, created_by, gst_status, unit_basis)
SELECT i.product_id, s.shop_id, t.id, c.id, sp.name, sp.brand, 'AUD', sp.blurb,
       'active', now(), 'seed:098', sp.gst, sp.unit_basis
FROM seed_p sp
JOIN seed_pid i ON i.pkey = sp.pkey
JOIN public.category c ON c.key = sp.category_key
JOIN public.product_type t ON t.key = sp.type_key
CROSS JOIN seed_shop s;

-- Options (position 1 and 2), then their values in first-seen order.
INSERT INTO public.product_option (product_id, position, name)
SELECT i.product_id, o.position, o.name
FROM seed_p sp JOIN seed_pid i ON i.pkey = sp.pkey
CROSS JOIN LATERAL (VALUES (1, sp.opt1), (2, sp.opt2)) AS o (position, name)
WHERE o.name IS NOT NULL;

INSERT INTO public.product_option_value (option_id, value, position)
SELECT o.id, x.value, (row_number() OVER (PARTITION BY o.id ORDER BY x.first_pos) - 1)::smallint
FROM (
    SELECT sv.pkey, 1 AS position, sv.v1 AS value, min(sv.pos) AS first_pos FROM seed_v sv WHERE sv.v1 IS NOT NULL GROUP BY sv.pkey, sv.v1
    UNION ALL
    SELECT sv.pkey, 2, sv.v2, min(sv.pos) FROM seed_v sv WHERE sv.v2 IS NOT NULL GROUP BY sv.pkey, sv.v2
) x
JOIN seed_pid i ON i.pkey = x.pkey
JOIN public.product_option o ON o.product_id = i.product_id AND o.position = x.position;

INSERT INTO public.product_variant (
    product_id, shop_id, option1_value_id, option2_value_id, position, sku,
    shop_price_amount, shop_compare_at_amount, price_amount, compare_at_amount,
    weight_grams, weight_is_assumed, pack_quantity, pack_unit, stock_tracked, stock_on_hand)
SELECT i.product_id, s.shop_id, v1.id, v2.id, sv.pos, sv.sku,
       sv.price, sv.was, sv.price, sv.was,
       sv.weight, false, sv.pack_qty, sv.pack_unit, sv.tracked, sv.on_hand
FROM seed_v sv
JOIN seed_pid i ON i.pkey = sv.pkey
CROSS JOIN seed_shop s
LEFT JOIN public.product_option o1 ON o1.product_id = i.product_id AND o1.position = 1
LEFT JOIN public.product_option_value v1 ON v1.option_id = o1.id AND v1.value = sv.v1
LEFT JOIN public.product_option o2 ON o2.product_id = i.product_id AND o2.position = 2
LEFT JOIN public.product_option_value v2 ON v2.option_id = o2.id AND v2.value = sv.v2;

-- A tracked variant's opening count is explained by a movement, as every count must be.
INSERT INTO public.stock_movement (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind)
SELECT v.product_id, v.id, v.shop_id, v.stock_on_hand, 0, v.stock_on_hand, 'tracking_enabled', 'system'
FROM public.product_variant v JOIN seed_pid i ON i.product_id = v.product_id
WHERE v.stock_tracked;

-- The listing summary, exactly as refreshListing computes it (R4).
UPDATE public.product p
   SET list_price_amount = s.min_price,
       list_compare_at_amount = s.min_was,
       price_varies = s.varies
FROM (
    SELECT DISTINCT ON (v.product_id)
           v.product_id, v.price_amount AS min_price, v.compare_at_amount AS min_was,
           (min(v.price_amount) OVER w) <> (max(v.price_amount) OVER w) AS varies
      FROM public.product_variant v
     WHERE v.state = 'active'
    WINDOW w AS (PARTITION BY v.product_id)
     ORDER BY v.product_id, v.price_amount, v.position
) s
JOIN seed_pid i ON i.product_id = s.product_id
WHERE p.id = s.product_id;

COMMIT;

SELECT (SELECT count(*) FROM public.product p WHERE p.created_by = 'seed:098') AS seeded_products,
       (SELECT count(*) FROM public.product_variant v WHERE v.sku LIKE 'SEED098-%') AS seeded_variants;
