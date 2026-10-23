-- Dev catalogue seed: The grocery aisles the storefront's menu is built around, three levels deep (aisles,
-- groups, leaves), as the header's All-aisles menu shows them. Upserted by key, so re-running is safe.
-- Run before 098_variant_catalogue_dev.sql. Dev only.
--
--     psql "$DSN" -f db/seeds/084_storefront_catalogue_dev.sql

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

COMMIT;

-- What is there now.
SELECT (SELECT count(*) FROM public.category WHERE status = 'active')                       AS active_categories,
       (SELECT count(*) FROM public.category WHERE status = 'active' AND parent_id IS NULL) AS aisles,
       (SELECT count(*) FROM public.product WHERE status = 'active')                        AS products_on_sale;
