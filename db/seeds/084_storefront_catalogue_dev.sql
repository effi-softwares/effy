-- 084 storefront redesign — dev catalogue seed: the grocery aisles the storefront's menu is built
-- around, and enough products that every aisle has something in it. Dev only; never run in production.
--
--     psql "$DSN" -f db/seeds/084_storefront_catalogue_dev.sql
--
-- What it does, in one transaction:
--   1. THE AISLES. Eleven top-level aisles, their groups and their leaves — three levels, as the
--      header's All-aisles menu shows them. Upserted BY KEY, so the nine categories dev already has
--      (`pantry`, `bakery`, `cleaning`, …) are kept, renamed and moved rather than duplicated.
--      ⚠ `food` and `grocery` — dev's old top levels — are RETIRED once nothing is filed in them.
--   2. THE PRODUCTS DEV ALREADY HAS are re-filed under the leaf they belong to, by name. A product
--      whose name matches nothing stays exactly where it is.
--   3. NEW PRODUCTS (sku `SEED084-…`), on sale at once: active, approved, margin not set — the same
--      shape 067's backfill gave every product that predates approval. They have NO picture.
--
-- ⚠ THE NEW PRODUCTS BELONG TO AN EXISTING SHOP — the shop of dev's oldest product on sale — and
--   copy its product type. A shop is never invented here. With no such product it STOPS, having
--   written nothing.
-- ⚠ Stock is untracked on the new products, so they read as available everywhere.
--
-- Idempotent: categories upsert by key, products are skipped when their sku is already in the shop.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. The aisles ───────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE seed_category (key text PRIMARY KEY, parent_key text, name text NOT NULL, ord int NOT NULL) ON COMMIT DROP;

INSERT INTO seed_category (key, parent_key, name, ord) VALUES
    ('fruit_veg', NULL, 'Fruit & veg', 0),
    ('fruit', 'fruit_veg', 'Fruit', 0),
    ('fruit_apples_and_pears', 'fruit', 'Apples & pears', 0),
    ('fruit_bananas', 'fruit', 'Bananas', 10),
    ('fruit_citrus', 'fruit', 'Citrus', 20),
    ('fruit_berries', 'fruit', 'Berries', 30),
    ('vegetables', 'fruit_veg', 'Vegetables', 10),
    ('vegetables_leafy_greens', 'vegetables', 'Leafy greens', 0),
    ('vegetables_root_vegetables', 'vegetables', 'Root vegetables', 10),
    ('vegetables_tomatoes_and_capsicum', 'vegetables', 'Tomatoes & capsicum', 20),
    ('salad_herbs', 'fruit_veg', 'Salad & herbs', 20),
    ('salad_herbs_salad_bags', 'salad_herbs', 'Salad bags', 0),
    ('salad_herbs_fresh_herbs', 'salad_herbs', 'Fresh herbs', 10),
    ('organic_produce', 'fruit_veg', 'Organic', 30),
    ('organic_produce_organic_fruit', 'organic_produce', 'Organic fruit', 0),
    ('organic_produce_organic_vegetables', 'organic_produce', 'Organic vegetables', 10),
    ('dairy_eggs', NULL, 'Dairy & eggs', 10),
    ('milk', 'dairy_eggs', 'Milk', 0),
    ('milk_full_cream', 'milk', 'Full cream', 0),
    ('milk_light_and_skim', 'milk', 'Light & skim', 10),
    ('milk_long_life', 'milk', 'Long life', 20),
    ('plant_milk', 'dairy_eggs', 'Plant milk', 10),
    ('plant_milk_oat', 'plant_milk', 'Oat', 0),
    ('plant_milk_almond', 'plant_milk', 'Almond', 10),
    ('plant_milk_soy', 'plant_milk', 'Soy', 20),
    ('cheese', 'dairy_eggs', 'Cheese', 20),
    ('cheese_block', 'cheese', 'Block', 0),
    ('cheese_sliced', 'cheese', 'Sliced', 10),
    ('cheese_specialty', 'cheese', 'Specialty', 20),
    ('yoghurt', 'dairy_eggs', 'Yoghurt', 30),
    ('yoghurt_greek', 'yoghurt', 'Greek', 0),
    ('yoghurt_kids', 'yoghurt', 'Kids', 10),
    ('yoghurt_dairy_free', 'yoghurt', 'Dairy free', 20),
    ('eggs', 'dairy_eggs', 'Eggs', 40),
    ('eggs_free_range', 'eggs', 'Free range', 0),
    ('eggs_cage_free', 'eggs', 'Cage free', 10),
    ('butter_spreads', 'dairy_eggs', 'Butter & spreads', 50),
    ('butter_spreads_butter', 'butter_spreads', 'Butter', 0),
    ('butter_spreads_margarine', 'butter_spreads', 'Margarine', 10),
    ('chilled', 'dairy_eggs', 'Chilled desserts', 60),
    ('bakery', NULL, 'Bakery', 20),
    ('bread', 'bakery', 'Bread', 0),
    ('bread_white', 'bread', 'White', 0),
    ('bread_wholemeal_and_grain', 'bread', 'Wholemeal & grain', 10),
    ('bread_sourdough', 'bread', 'Sourdough', 20),
    ('rolls_wraps', 'bakery', 'Rolls & wraps', 10),
    ('rolls_wraps_rolls', 'rolls_wraps', 'Rolls', 0),
    ('rolls_wraps_wraps_and_flatbread', 'rolls_wraps', 'Wraps & flatbread', 10),
    ('sweet_bakery', 'bakery', 'Sweet bakery', 20),
    ('sweet_bakery_muffins_and_cakes', 'sweet_bakery', 'Muffins & cakes', 0),
    ('sweet_bakery_pastries', 'sweet_bakery', 'Pastries', 10),
    ('meat_seafood', NULL, 'Meat & seafood', 30),
    ('beef_lamb', 'meat_seafood', 'Beef & lamb', 0),
    ('beef_lamb_mince', 'beef_lamb', 'Mince', 0),
    ('beef_lamb_steak', 'beef_lamb', 'Steak', 10),
    ('beef_lamb_roasts', 'beef_lamb', 'Roasts', 20),
    ('poultry', 'meat_seafood', 'Poultry', 10),
    ('poultry_chicken_breast', 'poultry', 'Chicken breast', 0),
    ('poultry_chicken_thigh', 'poultry', 'Chicken thigh', 10),
    ('poultry_whole_chicken', 'poultry', 'Whole chicken', 20),
    ('pork_bacon', 'meat_seafood', 'Pork & bacon', 20),
    ('pork_bacon_bacon', 'pork_bacon', 'Bacon', 0),
    ('pork_bacon_sausages', 'pork_bacon', 'Sausages', 10),
    ('seafood', 'meat_seafood', 'Seafood', 30),
    ('seafood_salmon', 'seafood', 'Salmon', 0),
    ('seafood_white_fish', 'seafood', 'White fish', 10),
    ('seafood_prawns', 'seafood', 'Prawns', 20),
    ('pantry', NULL, 'Pantry', 40),
    ('pasta_rice', 'pantry', 'Pasta, rice & noodles', 0),
    ('pasta_rice_pasta', 'pasta_rice', 'Pasta', 0),
    ('pasta_rice_rice', 'pasta_rice', 'Rice', 10),
    ('pasta_rice_noodles', 'pasta_rice', 'Noodles', 20),
    ('canned', 'pantry', 'Canned food', 10),
    ('canned_tomatoes', 'canned', 'Tomatoes', 0),
    ('canned_beans_and_legumes', 'canned', 'Beans & legumes', 10),
    ('canned_soup', 'canned', 'Soup', 20),
    ('breakfast', 'pantry', 'Breakfast', 20),
    ('breakfast_cereal', 'breakfast', 'Cereal', 0),
    ('breakfast_oats_and_muesli', 'breakfast', 'Oats & muesli', 10),
    ('breakfast_spreads', 'breakfast', 'Spreads', 20),
    ('baking', 'pantry', 'Baking', 30),
    ('baking_flour', 'baking', 'Flour', 0),
    ('baking_sugar', 'baking', 'Sugar', 10),
    ('baking_baking_mixes', 'baking', 'Baking mixes', 20),
    ('oils_sauces', 'pantry', 'Oils & sauces', 40),
    ('oils_sauces_oils', 'oils_sauces', 'Oils', 0),
    ('oils_sauces_pasta_sauce', 'oils_sauces', 'Pasta sauce', 10),
    ('oils_sauces_condiments', 'oils_sauces', 'Condiments', 20),
    ('snacks', NULL, 'Snacks', 50),
    ('chips', 'snacks', 'Chips', 0),
    ('chips_potato_chips', 'chips', 'Potato chips', 0),
    ('chips_corn_chips', 'chips', 'Corn chips', 10),
    ('biscuits', 'snacks', 'Biscuits', 10),
    ('biscuits_sweet_biscuits', 'biscuits', 'Sweet biscuits', 0),
    ('biscuits_crackers', 'biscuits', 'Crackers', 10),
    ('chocolate', 'snacks', 'Chocolate', 20),
    ('chocolate_blocks', 'chocolate', 'Blocks', 0),
    ('chocolate_bars', 'chocolate', 'Bars', 10),
    ('nuts', 'snacks', 'Nuts & dried fruit', 30),
    ('nuts_nuts', 'nuts', 'Nuts', 0),
    ('nuts_dried_fruit', 'nuts', 'Dried fruit', 10),
    ('beverages', NULL, 'Drinks', 60),
    ('juice', 'beverages', 'Juice', 0),
    ('juice_fruit_juice', 'juice', 'Fruit juice', 0),
    ('juice_chilled_juice', 'juice', 'Chilled juice', 10),
    ('soft_drinks', 'beverages', 'Soft drinks', 10),
    ('soft_drinks_cola', 'soft_drinks', 'Cola', 0),
    ('soft_drinks_mineral_water', 'soft_drinks', 'Mineral water', 10),
    ('soft_drinks_kombucha', 'soft_drinks', 'Kombucha', 20),
    ('coffee_tea', 'beverages', 'Coffee & tea', 20),
    ('coffee_tea_coffee', 'coffee_tea', 'Coffee', 0),
    ('coffee_tea_tea', 'coffee_tea', 'Tea', 10),
    ('coffee_tea_cold_coffee', 'coffee_tea', 'Cold coffee', 20),
    ('water', 'beverages', 'Water', 30),
    ('water_still_water', 'water', 'Still water', 0),
    ('water_sparkling_water', 'water', 'Sparkling water', 10),
    ('frozen', NULL, 'Frozen', 70),
    ('frozen_veg', 'frozen', 'Frozen vegetables', 0),
    ('frozen_veg_vegetables', 'frozen_veg', 'Vegetables', 0),
    ('frozen_veg_chips_and_wedges', 'frozen_veg', 'Chips & wedges', 10),
    ('frozen_meals', 'frozen', 'Frozen meals', 10),
    ('frozen_meals_pizza', 'frozen_meals', 'Pizza', 0),
    ('frozen_meals_ready_meals', 'frozen_meals', 'Ready meals', 10),
    ('ice_cream', 'frozen', 'Ice cream', 20),
    ('ice_cream_tubs', 'ice_cream', 'Tubs', 0),
    ('ice_cream_sticks_and_cones', 'ice_cream', 'Sticks & cones', 10),
    ('meals', NULL, 'Deli & ready meals', 80),
    ('ready_meals', 'meals', 'Ready meals', 0),
    ('ready_meals_chilled_meals', 'ready_meals', 'Chilled meals', 0),
    ('ready_meals_sushi', 'ready_meals', 'Sushi', 10),
    ('sandwiches', 'meals', 'Sandwiches', 10),
    ('sandwiches_toasties', 'sandwiches', 'Toasties', 0),
    ('sandwiches_sandwiches_and_wraps', 'sandwiches', 'Sandwiches & wraps', 10),
    ('deli', 'meals', 'Deli', 20),
    ('deli_sliced_meats', 'deli', 'Sliced meats', 0),
    ('deli_dips_and_antipasto', 'deli', 'Dips & antipasto', 10),
    ('household', NULL, 'Household', 90),
    ('cleaning', 'household', 'Cleaning', 0),
    ('cleaning_laundry', 'cleaning', 'Laundry', 0),
    ('cleaning_dishwashing', 'cleaning', 'Dishwashing', 10),
    ('cleaning_surface_cleaners', 'cleaning', 'Surface cleaners', 20),
    ('paper_goods', 'household', 'Paper goods', 10),
    ('paper_goods_toilet_paper', 'paper_goods', 'Toilet paper', 0),
    ('paper_goods_paper_towel', 'paper_goods', 'Paper towel', 10),
    ('paper_goods_tissues', 'paper_goods', 'Tissues', 20),
    ('kitchen_bags', 'household', 'Bags & wraps', 20),
    ('kitchen_bags_bin_liners', 'kitchen_bags', 'Bin liners', 0),
    ('kitchen_bags_food_wrap', 'kitchen_bags', 'Food wrap', 10),
    ('baby_kids', NULL, 'Baby & kids', 100),
    ('nappies', 'baby_kids', 'Nappies & wipes', 0),
    ('nappies_nappies', 'nappies', 'Nappies', 0),
    ('nappies_wipes', 'nappies', 'Wipes', 10),
    ('baby_food', 'baby_kids', 'Baby food', 10),
    ('baby_food_pouches', 'baby_food', 'Pouches', 0),
    ('baby_food_formula', 'baby_food', 'Formula', 10),
    ('kids_snacks', 'baby_kids', 'Kids'' snacks', 20),
    ('kids_snacks_lunchbox_snacks', 'kids_snacks', 'Lunchbox snacks', 0);

-- Top level first.
INSERT INTO public.category (key, name, parent_id, display_order, status)
SELECT s.key, s.name, NULL, s.ord, 'active'
FROM seed_category s
WHERE s.parent_key IS NULL
ON CONFLICT (key) DO UPDATE
   SET name = EXCLUDED.name, parent_id = NULL, display_order = EXCLUDED.display_order,
       status = 'active', updated_at = now();

-- Then everything with a parent — TWICE, because a leaf's parent (a group) only exists after the
-- first pass. The second pass re-writes the groups to the same values and adds the leaves.
INSERT INTO public.category (key, name, parent_id, display_order, status)
SELECT s.key, s.name, p.id, s.ord, 'active'
FROM seed_category s
JOIN public.category p ON p.key = s.parent_key
ON CONFLICT (key) DO UPDATE
   SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, display_order = EXCLUDED.display_order,
       status = 'active', updated_at = now();

INSERT INTO public.category (key, name, parent_id, display_order, status)
SELECT s.key, s.name, p.id, s.ord, 'active'
FROM seed_category s
JOIN public.category p ON p.key = s.parent_key
ON CONFLICT (key) DO UPDATE
   SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, display_order = EXCLUDED.display_order,
       status = 'active', updated_at = now();

-- ── 2. Re-file the products dev already has ─────────────────────────────────────────────────────

UPDATE public.product p
   SET primary_category_id = c.id, updated_at = now()
FROM (VALUES
    ('%Juice%', 'juice_fruit_juice'),
    ('%Laundry Powder%', 'cleaning_laundry'),
    ('%Bin Liners%', 'kitchen_bags_bin_liners'),
    ('%Long Grain%Rice%', 'pasta_rice_rice'),
    ('%Diced Tomatoes%', 'canned_tomatoes'),
    ('%Spaghetti%', 'pasta_rice_pasta'),
    ('%Olive Oil%', 'oils_sauces_oils'),
    ('%Paper Towel%', 'paper_goods_paper_towel'),
    ('%Spray n%', 'cleaning_surface_cleaners'),
    ('%Toilet Tissue%', 'paper_goods_toilet_paper'),
    ('%White Sugar%', 'baking_sugar'),
    ('%Rolled Oats%', 'breakfast_oats_and_muesli'),
    ('%Dishwashing%', 'cleaning_dishwashing'),
    ('%Cold Brew%', 'coffee_tea_cold_coffee'),
    ('%Cereal%', 'breakfast_cereal'),
    ('%Kombucha%', 'soft_drinks_kombucha'),
    ('%Biscuits%', 'biscuits_sweet_biscuits'),
    ('%Toastie%', 'sandwiches_toasties'),
    ('%Sushi%', 'ready_meals_sushi'),
    ('%Chips%', 'chips_potato_chips'),
    ('%Baked Beans%', 'canned_beans_and_legumes')
) AS m (pattern, category_key)
JOIN public.category c ON c.key = m.category_key
WHERE p.name ILIKE m.pattern
  AND p.primary_category_id <> c.id;

-- Dev's old top levels, once nothing is filed in them and nothing active hangs under them.
UPDATE public.category c
   SET status = 'retired', updated_at = now()
WHERE c.key IN ('food', 'grocery')
  AND NOT EXISTS (SELECT 1 FROM public.product p WHERE p.primary_category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.category k WHERE k.parent_id = c.id AND k.status = 'active');

-- ── 3. New products ─────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE seed_template ON COMMIT DROP AS
SELECT shop_id, product_type_id, created_by
FROM public.product
WHERE status = 'active' AND approved_at IS NOT NULL
ORDER BY created_at ASC, id ASC
LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seed_template) THEN
        RAISE EXCEPTION '084 seed: dev has no product on sale to take a shop and product type from. Nothing was written.';
    END IF;
END
$$;

INSERT INTO public.product (
    shop_id, product_type_id, primary_category_id, name, sku,
    price_amount, shop_price_amount, compare_at_amount, shop_compare_at_amount,
    short_description, status, approved_at, created_by)
SELECT t.shop_id, t.product_type_id, c.id, v.name, v.sku,
       v.price, v.price, v.was, v.was,
       v.blurb, 'active', now(), t.created_by
FROM (VALUES
    ('SEED084-001', 'milk_full_cream', 'Full Cream Milk 2L', 3.60::numeric, NULL::numeric, 'Fresh full cream milk.'),
    ('SEED084-002', 'milk_full_cream', 'Full Cream Milk 1L', 2.10::numeric, NULL::numeric, 'Fresh full cream milk.'),
    ('SEED084-003', 'milk_full_cream', 'Jersey Full Cream Milk 1.5L', 4.80::numeric, 5.50::numeric, 'Rich, creamy jersey milk.'),
    ('SEED084-004', 'milk_light_and_skim', 'Light Milk 2L', 3.60::numeric, NULL::numeric, 'Reduced fat milk.'),
    ('SEED084-005', 'milk_light_and_skim', 'Skim Milk 1L', 2.10::numeric, NULL::numeric, 'Fat free milk.'),
    ('SEED084-006', 'milk_long_life', 'Long Life Full Cream Milk 1L', 1.80::numeric, NULL::numeric, 'UHT milk that keeps in the pantry.'),
    ('SEED084-007', 'milk_long_life', 'Long Life Lactose Free Milk 1L', 2.90::numeric, NULL::numeric, 'Lactose free UHT milk.'),
    ('SEED084-008', 'plant_milk_oat', 'Oat Milk Barista 1L', 3.00::numeric, 4.00::numeric, 'Oat milk made to steam and pour.'),
    ('SEED084-009', 'plant_milk_oat', 'Oat Milk Original 2L', 5.20::numeric, NULL::numeric, 'Everyday oat milk.'),
    ('SEED084-010', 'plant_milk_almond', 'Almond Milk Unsweetened 1L', 2.80::numeric, NULL::numeric, 'No added sugar.'),
    ('SEED084-011', 'plant_milk_soy', 'Soy Milk Original 1L', 2.40::numeric, NULL::numeric, 'Calcium enriched soy milk.'),
    ('SEED084-012', 'cheese_block', 'Tasty Cheese Block 500g', 8.50::numeric, NULL::numeric, 'Mature cheddar.'),
    ('SEED084-013', 'cheese_block', 'Mild Cheddar Block 250g', 5.00::numeric, NULL::numeric, 'Smooth, mild cheddar.'),
    ('SEED084-014', 'cheese_sliced', 'Tasty Cheese Slices 12 Pack', 5.50::numeric, 6.50::numeric, 'Sandwich-ready slices.'),
    ('SEED084-015', 'cheese_specialty', 'Double Cream Brie 200g', 7.00::numeric, NULL::numeric, 'Soft-ripened brie.'),
    ('SEED084-016', 'cheese_specialty', 'Greek Style Feta 200g', 5.20::numeric, NULL::numeric, 'Crumbly, salty feta.'),
    ('SEED084-017', 'yoghurt_greek', 'Greek Yoghurt Natural 1kg', 5.80::numeric, NULL::numeric, 'Thick, strained yoghurt.'),
    ('SEED084-018', 'yoghurt_greek', 'Greek Yoghurt Honey 500g', 4.50::numeric, NULL::numeric, 'Greek yoghurt with honey.'),
    ('SEED084-019', 'yoghurt_kids', 'Kids Yoghurt Pouches Strawberry 4 Pack', 4.80::numeric, NULL::numeric, 'No added sugar.'),
    ('SEED084-020', 'yoghurt_dairy_free', 'Coconut Yoghurt Vanilla 500g', 6.90::numeric, NULL::numeric, 'Dairy free coconut yoghurt.'),
    ('SEED084-021', 'eggs_free_range', 'Free Range Eggs 12 Pack', 7.20::numeric, NULL::numeric, 'Large free range eggs.'),
    ('SEED084-022', 'eggs_free_range', 'Free Range Eggs 6 Pack', 4.20::numeric, NULL::numeric, 'Large free range eggs.'),
    ('SEED084-023', 'eggs_cage_free', 'Cage Free Eggs 12 Pack', 5.90::numeric, NULL::numeric, 'Barn laid eggs.'),
    ('SEED084-024', 'butter_spreads_butter', 'Salted Butter 250g', 4.90::numeric, NULL::numeric, 'Churned Australian butter.'),
    ('SEED084-025', 'butter_spreads_butter', 'Unsalted Butter 250g', 4.90::numeric, NULL::numeric, 'For baking and cooking.'),
    ('SEED084-026', 'butter_spreads_margarine', 'Olive Oil Spread 500g', 4.00::numeric, NULL::numeric, 'Soft table spread.'),
    ('SEED084-027', 'fruit_apples_and_pears', 'Royal Gala Apples 1kg', 4.90::numeric, NULL::numeric, 'Crisp and sweet.'),
    ('SEED084-028', 'fruit_apples_and_pears', 'Packham Pears 1kg', 4.50::numeric, NULL::numeric, 'Juicy green pears.'),
    ('SEED084-029', 'fruit_bananas', 'Cavendish Bananas 1kg', 3.90::numeric, NULL::numeric, 'Ripen at home.'),
    ('SEED084-030', 'fruit_citrus', 'Navel Oranges 3kg', 6.00::numeric, 7.50::numeric, 'Seedless and easy to peel.'),
    ('SEED084-031', 'fruit_berries', 'Strawberries 250g', 4.50::numeric, NULL::numeric, 'Sweet local strawberries.'),
    ('SEED084-032', 'vegetables_leafy_greens', 'Baby Spinach 120g', 3.00::numeric, NULL::numeric, 'Washed and ready.'),
    ('SEED084-033', 'vegetables_root_vegetables', 'Carrots 1kg', 2.40::numeric, NULL::numeric, 'Crunchy carrots.'),
    ('SEED084-034', 'vegetables_root_vegetables', 'Brushed Potatoes 2kg', 4.50::numeric, NULL::numeric, 'Good for mashing and roasting.'),
    ('SEED084-035', 'vegetables_tomatoes_and_capsicum', 'Truss Tomatoes 500g', 4.20::numeric, NULL::numeric, 'Ripened on the vine.'),
    ('SEED084-036', 'salad_herbs_salad_bags', 'Mixed Leaf Salad 200g', 3.50::numeric, NULL::numeric, 'Washed mixed leaves.'),
    ('SEED084-037', 'salad_herbs_fresh_herbs', 'Fresh Basil Bunch', 3.00::numeric, NULL::numeric, 'Fragrant fresh basil.'),
    ('SEED084-038', 'bread_white', 'White Sandwich Loaf 700g', 3.80::numeric, NULL::numeric, 'Soft white bread.'),
    ('SEED084-039', 'bread_wholemeal_and_grain', 'Multigrain Loaf 700g', 4.20::numeric, NULL::numeric, 'Seeded multigrain bread.'),
    ('SEED084-040', 'bread_sourdough', 'Sourdough Loaf 750g', 6.50::numeric, NULL::numeric, 'Slow fermented sourdough.'),
    ('SEED084-041', 'rolls_wraps_rolls', 'Crusty Bread Rolls 6 Pack', 3.50::numeric, NULL::numeric, 'Baked fresh.'),
    ('SEED084-042', 'rolls_wraps_wraps_and_flatbread', 'Wholemeal Wraps 8 Pack', 4.00::numeric, NULL::numeric, 'Soft wholemeal wraps.'),
    ('SEED084-043', 'sweet_bakery_muffins_and_cakes', 'Blueberry Muffins 4 Pack', 5.50::numeric, NULL::numeric, 'Baked with real blueberries.'),
    ('SEED084-044', 'sweet_bakery_pastries', 'Butter Croissants 4 Pack', 5.00::numeric, NULL::numeric, 'All-butter croissants.'),
    ('SEED084-045', 'beef_lamb_mince', 'Beef Mince 500g', 8.00::numeric, NULL::numeric, 'Lean beef mince.'),
    ('SEED084-046', 'beef_lamb_steak', 'Porterhouse Steak 2 Pack', 18.00::numeric, 21.00::numeric, 'Grass fed porterhouse.'),
    ('SEED084-047', 'poultry_chicken_breast', 'Chicken Breast Fillets 500g', 9.50::numeric, NULL::numeric, 'Skinless chicken breast.'),
    ('SEED084-048', 'poultry_chicken_thigh', 'Chicken Thigh Fillets 500g', 8.50::numeric, NULL::numeric, 'Skinless chicken thigh.'),
    ('SEED084-049', 'pork_bacon_bacon', 'Short Cut Bacon 250g', 6.00::numeric, NULL::numeric, 'Rindless short cut bacon.'),
    ('SEED084-050', 'pork_bacon_sausages', 'Pork Sausages 6 Pack', 7.50::numeric, NULL::numeric, 'Classic pork sausages.'),
    ('SEED084-051', 'seafood_salmon', 'Salmon Fillets 2 Pack', 11.00::numeric, NULL::numeric, 'Skin-on Atlantic salmon.'),
    ('SEED084-052', 'seafood_prawns', 'Cooked Prawns 300g', 12.50::numeric, NULL::numeric, 'Peeled and ready to eat.'),
    ('SEED084-053', 'pasta_rice_pasta', 'Penne Pasta 500g', 2.20::numeric, NULL::numeric, 'Durum wheat penne.'),
    ('SEED084-054', 'pasta_rice_rice', 'Basmati Rice 2kg', 6.90::numeric, NULL::numeric, 'Long grain basmati.'),
    ('SEED084-055', 'pasta_rice_noodles', 'Egg Noodles 400g', 2.80::numeric, NULL::numeric, 'Quick-cook egg noodles.'),
    ('SEED084-056', 'canned_soup', 'Tomato Soup 420g', 2.50::numeric, NULL::numeric, 'Ready to heat.'),
    ('SEED084-057', 'breakfast_spreads', 'Strawberry Jam 500g', 4.00::numeric, NULL::numeric, 'Made with whole fruit.'),
    ('SEED084-058', 'breakfast_spreads', 'Peanut Butter Crunchy 375g', 4.50::numeric, 5.20::numeric, 'Roasted peanuts, nothing else.'),
    ('SEED084-059', 'baking_flour', 'Plain Flour 1kg', 2.00::numeric, NULL::numeric, 'All-purpose flour.'),
    ('SEED084-060', 'oils_sauces_pasta_sauce', 'Tomato & Basil Pasta Sauce 500g', 3.50::numeric, NULL::numeric, 'Slow cooked tomato sauce.'),
    ('SEED084-061', 'oils_sauces_condiments', 'Tomato Sauce 500mL', 3.20::numeric, NULL::numeric, 'The barbecue staple.'),
    ('SEED084-062', 'chips_corn_chips', 'Corn Chips Original 230g', 3.50::numeric, NULL::numeric, 'Stone-ground corn chips.'),
    ('SEED084-063', 'biscuits_crackers', 'Water Crackers 125g', 2.20::numeric, NULL::numeric, 'Thin, crisp crackers.'),
    ('SEED084-064', 'chocolate_blocks', 'Dark Chocolate 180g', 3.50::numeric, 5.00::numeric, '70% cocoa.'),
    ('SEED084-065', 'chocolate_blocks', 'Milk Chocolate Block 180g', 4.50::numeric, NULL::numeric, 'Smooth milk chocolate.'),
    ('SEED084-066', 'nuts_nuts', 'Roasted Almonds 400g', 9.00::numeric, NULL::numeric, 'Dry roasted, unsalted.'),
    ('SEED084-067', 'soft_drinks_cola', 'Cola 1.25L', 2.50::numeric, NULL::numeric, 'Classic cola.'),
    ('SEED084-068', 'soft_drinks_mineral_water', 'Lemon Mineral Water 1.25L', 2.20::numeric, NULL::numeric, 'Lightly sparkling.'),
    ('SEED084-069', 'coffee_tea_coffee', 'Coffee Beans 500g', 12.00::numeric, 14.00::numeric, 'Medium roast whole beans.'),
    ('SEED084-070', 'coffee_tea_tea', 'English Breakfast Tea 100 Bags', 5.50::numeric, NULL::numeric, 'A strong morning cup.'),
    ('SEED084-071', 'water_sparkling_water', 'Sparkling Water 10 Pack', 7.00::numeric, NULL::numeric, 'Ten 375mL cans.'),
    ('SEED084-072', 'water_still_water', 'Spring Water 12 x 600mL', 6.50::numeric, NULL::numeric, 'Still spring water.'),
    ('SEED084-073', 'frozen_veg_vegetables', 'Frozen Peas 1kg', 3.50::numeric, NULL::numeric, 'Snap frozen garden peas.'),
    ('SEED084-074', 'frozen_veg_chips_and_wedges', 'Frozen Straight Cut Chips 1kg', 4.50::numeric, NULL::numeric, 'Oven bake chips.'),
    ('SEED084-075', 'frozen_meals_pizza', 'Frozen Margherita Pizza 400g', 6.00::numeric, NULL::numeric, 'Stone baked base.'),
    ('SEED084-076', 'ice_cream_tubs', 'Vanilla Ice Cream 2L', 6.50::numeric, NULL::numeric, 'Classic vanilla.'),
    ('SEED084-077', 'deli_sliced_meats', 'Shaved Leg Ham 200g', 5.50::numeric, NULL::numeric, 'Thinly shaved ham.'),
    ('SEED084-078', 'deli_dips_and_antipasto', 'Hommus Dip 200g', 3.50::numeric, NULL::numeric, 'Chickpea and tahini dip.'),
    ('SEED084-079', 'ready_meals_chilled_meals', 'Butter Chicken with Rice 350g', 7.50::numeric, NULL::numeric, 'Heat and eat.'),
    ('SEED084-080', 'cleaning_surface_cleaners', 'Multipurpose Cleaner 750mL', 4.00::numeric, NULL::numeric, 'For kitchen and bathroom.'),
    ('SEED084-081', 'paper_goods_tissues', 'Facial Tissues 224 Pack', 2.80::numeric, NULL::numeric, 'Soft 2 ply tissues.'),
    ('SEED084-082', 'kitchen_bags_food_wrap', 'Cling Wrap 60m', 3.60::numeric, NULL::numeric, 'Keeps food fresh.'),
    ('SEED084-083', 'nappies_nappies', 'Nappies Crawler 44 Pack', 16.00::numeric, 19.00::numeric, 'For 6 to 11 kg.'),
    ('SEED084-084', 'nappies_wipes', 'Baby Wipes Fragrance Free 80 Pack', 3.50::numeric, NULL::numeric, 'Gentle on skin.'),
    ('SEED084-085', 'baby_food_pouches', 'Apple & Pear Puree Pouch 120g', 2.00::numeric, NULL::numeric, 'From 4 months.'),
    ('SEED084-086', 'kids_snacks_lunchbox_snacks', 'Fruit Bars 8 Pack', 4.50::numeric, NULL::numeric, 'Lunchbox-sized fruit bars.')
) AS v (sku, category_key, name, price, was, blurb)
JOIN public.category c ON c.key = v.category_key
CROSS JOIN seed_template t
WHERE NOT EXISTS (SELECT 1 FROM public.product p WHERE p.shop_id = t.shop_id AND p.sku = v.sku);

COMMIT;

-- What is there now.
SELECT (SELECT count(*) FROM public.category WHERE status = 'active')                       AS active_categories,
       (SELECT count(*) FROM public.category WHERE status = 'active' AND parent_id IS NULL) AS aisles,
       (SELECT count(*) FROM public.product WHERE sku LIKE 'SEED084-%')                     AS seeded_products,
       (SELECT count(*) FROM public.product WHERE status = 'active')                        AS products_on_sale;
