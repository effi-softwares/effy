-- Dev catalogue seed (101): products filed in the seeded category tree, across every department. Dev only.
--
--     psql "$DSN" -f db/seeds/101_catalogue_products_dev.sql
--
-- In one transaction:
--   • Seeds into the oldest active shop; with none it stops, having written nothing (a shop is never invented).
--     Refuses if a SEED101- stock code is already in the shop.
--   • Products are on sale at once: active, approved, no margin (customer price = shop price), no picture.
--   • Each is filed in a leaf and takes that leaf's storage, GST and 18+ defaults (two frozen, several chilled,
--     two 18+ among them). Every REQUIRED detail of the leaf's form is filled in (from the form itself, so the
--     seed follows the taxonomy); recommended details are left empty on purpose, so review's "Attention" block
--     and the shop's nudges have something to show.
--   • Options: Pack size (values are the variants' pack sizes), library attributes (Flavour, Colour, Scent, Ink
--     colour, Nappy size, Clothing size) whose values are also each variant's own detail, as applyVariantSet
--     writes them. Greek Yoghurt and Chocolate Block carry allergens that differ by flavour.
--   • Two extra placements ("also shown in"), as staff would make them.
--   • Each product's listing summary is set exactly as refreshListing (@effy/edge-shared/catalog) does.
--
-- No GST history row is written (product_gst_change needs a shop or Effy actor).

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE seed_shop ON COMMIT DROP AS
SELECT id AS shop_id FROM public.shop WHERE status = 'active' ORDER BY created_at, id LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seed_shop) THEN
        RAISE EXCEPTION '101 seed: there is no active shop to seed into. Nothing was written.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.product_variant v JOIN seed_shop s ON s.shop_id = v.shop_id WHERE v.sku LIKE 'SEED101-%') THEN
        RAISE EXCEPTION '101 seed: already seeded (SEED101- stock codes exist). Nothing was written.';
    END IF;
END
$$;

-- ── The products ────────────────────────────────────────────────────────────────────────────────
-- opt1/opt2: 'pack' (Pack size), an attribute key (a library variant option), or NULL (no such option).

CREATE TEMP TABLE seed_p (
    pkey text PRIMARY KEY, leaf text, name text, brand text, blurb text, unit_basis text, opt1 text, opt2 text
) ON COMMIT DROP;

INSERT INTO seed_p VALUES
    -- Fruit & Vegetables
    ('bananas',   'bananas',                      'Cavendish Bananas 1kg',     NULL,           'Ripen at home.',                         'per_kg',   NULL, NULL),
    ('apples',    'apples-and-pears',             'Pink Lady Apples',          NULL,           'Crisp and sweet.',                       'per_kg',   'pack', NULL),
    ('tomatoes',  'tomatoes',                     'Cherry Tomatoes 250g',      NULL,           'Sweet snacking tomatoes.',               'per_100g', NULL, NULL),
    ('spinach',   'leafy-greens',                 'Baby Spinach 120g',         NULL,           'Washed and ready to eat.',               'per_100g', NULL, NULL),
    -- Meat & Seafood
    ('mince',     'beef-mince',                   'Beef Mince',                NULL,           'Lean beef mince.',                       'per_kg',   'pack', NULL),
    ('chicken',   'chicken-breast',               'Chicken Breast Fillets',    NULL,           'Skinless chicken breast.',               'per_kg',   'pack', NULL),
    ('salmon',    'fish-fillets',                 'Atlantic Salmon Fillets',   NULL,           'Skin-on portions.',                      'per_kg',   NULL, NULL),
    -- Dairy, Eggs & Fridge
    ('milk',      'full-cream-milk',              'Full Cream Milk',           'Farmhouse',    'Fresh full cream milk.',                 'per_l',    'pack', NULL),
    ('yoghurt',   'greek-and-natural-yoghurt',    'Greek Yoghurt',             'Hilltop',      'Thick, strained Greek yoghurt.',         'per_kg',   'flavour', 'pack'),
    ('cheese',    'block-cheese',                 'Tasty Cheese Block',        'Hilltop',      'Mature cheddar.',                        'per_kg',   'pack', NULL),
    ('eggs',      'free-range-eggs',              'Free Range Eggs',           'Sunny Farm',   'Large free range eggs.',                 'each',     'pack', NULL),
    -- Bakery
    ('sourdough', 'sourdough',                    'Sourdough Loaf 750g',       'Effy Bakery',  'Slow fermented sourdough.',              'per_100g', NULL, NULL),
    ('croissant', 'pastries-and-croissants',      'Butter Croissants',         'Effy Bakery',  'All-butter croissants.',                 'each',     'pack', NULL),
    ('rolls',     'bread-rolls',                  'Crusty White Rolls 6 Pack', 'Effy Bakery',  'Baked fresh daily.',                     'each',     NULL, NULL),
    -- Pantry
    ('rice',      'rice',                         'Basmati Rice',              'Effy Pantry',  'Long grain basmati, aged for aroma.',    'per_kg',   'pack', NULL),
    ('pasta',     'pasta',                        'Spaghetti 500g',            'Effy Pantry',  'Bronze-cut durum wheat pasta.',          'per_100g', NULL, NULL),
    ('oliveoil',  'olive-oil',                    'Extra Virgin Olive Oil',    'Grove',        'Cold pressed.',                          'per_l',    'pack', NULL),
    ('honey',     'honey',                        'Pure Honey 500g',           'Bee Happy',    'Australian blended honey.',              'per_100g', NULL, NULL),
    -- Frozen
    ('icecream',  'ice-cream-tubs',               'Ice Cream Tub 2L',          'Creamery',     'Classic ice cream.',                     'per_l',    'flavour', NULL),
    ('peas',      'frozen-vegetables',            'Frozen Garden Peas',        'Snap Fresh',   'Snap frozen within hours.',              'per_kg',   'pack', NULL),
    -- Snacks & Confectionery
    ('chips',     'potato-chips',                 'Potato Chips 175g',         'Crunch',       'Kettle cooked.',                         'per_100g', 'flavour', NULL),
    ('chocolate', 'chocolate-blocks',             'Chocolate Block 180g',      'Cacao & Co',   'Smooth chocolate.',                      'per_100g', 'flavour', NULL),
    -- Drinks
    ('cola',      'cola',                         'Cola',                      'Fizz',         'Classic cola.',                          'per_l',    'pack', NULL),
    ('water',     'sparkling-water',              'Sparkling Water 1.25L',     'Spring Co',    'Lightly sparkling.',                     'per_l',    'flavour', NULL),
    ('coffee',    'ground-coffee',                'Ground Coffee',             'Roastery Co',  'Medium roast, ground for espresso.',     'per_100g', 'pack', NULL),
    -- Liquor (18+)
    ('shiraz',    'red-wine',                     'Barossa Shiraz 750mL',      'Hill Cellars', 'Rich, dark-fruited shiraz.',             'per_l',    NULL, NULL),
    ('lager',     'australian-beer',              'Pale Lager',                'Harbour',      'Crisp and refreshing.',                  'per_l',    'pack', NULL),
    -- Ready Meals & Deli
    ('lasagne',   'family-meals',                 'Beef Lasagne 1kg',          'Effy Kitchen', 'Heat and eat; serves four.',             'per_kg',   NULL, NULL),
    ('sushi',     'sushi',                        'Salmon Sushi Pack',         'Effy Kitchen', 'Made fresh this morning.',               'each',     NULL, NULL),
    -- Health & Wellness
    ('panadol',   'pain-relief',                  'Paracetamol 500mg Tablets', 'Relief',       'For fast pain relief.',                  'each',     'pack', NULL),
    ('multivit',  'multivitamins',                'Men''s Multivitamin',       'Vitality',     'Daily multivitamin.',                    'each',     NULL, NULL),
    -- Beauty & Personal Care
    ('shampoo',   'shampoo',                      'Daily Shampoo 400mL',       'Lather',       'For every hair type.',                   'per_l',    'scent', NULL),
    ('toothpaste','toothpaste',                   'Fresh Mint Toothpaste',     'Bright',       'Fluoride toothpaste.',                   'per_100g', NULL, NULL),
    -- Baby
    ('nappies',   'nappies',                      'Nappies',                   'Little Ones',  'Soft, absorbent nappies.',               'each',     'nappy_size', NULL),
    ('wipes',     'baby-wipes',                   'Baby Wipes',                'Little Ones',  'Fragrance free.',                        'each',     'pack', NULL),
    -- Pet
    ('dogfood',   'dry-dog-food',                 'Adult Dry Dog Food',        'Good Boy',     'Complete and balanced.',                 'per_kg',   'pack', NULL),
    ('litter',    'cat-litter',                   'Clumping Cat Litter',       'Whiskers',     'Low dust, odour control.',               'per_kg',   'pack', NULL),
    -- Household & Cleaning
    ('laundry',   'laundry-liquid',               'Laundry Liquid 2L',         'Sparkle',      'Front and top loader.',                  'per_l',    'scent', NULL),
    ('toiletpaper','toilet-paper',                'Toilet Paper',              'Softly',       '3 ply, 180 sheets a roll.',              'each',     'pack', NULL),
    -- Home & Kitchen
    ('fryingpan', 'frying-pans',                  'Non-stick Frying Pan 28cm', 'Chef''s Own',  'Induction ready.',                       NULL,       'colour', NULL),
    ('mug',       'mugs-and-cups',                'Stoneware Mug 400mL',       'Hearth',       'Dishwasher safe.',                       NULL,       'colour', NULL),
    -- Electronics
    ('charger',   'chargers-and-cables',          'USB-C Wall Charger 20W',    'Volt',         'Fast charging for phones and tablets.',  NULL,       'colour', NULL),
    ('earbuds',   'headphones-and-earbuds',       'Wireless Earbuds',          'Sonic',        'Up to 24 hours with the case.',          NULL,       'colour', NULL),
    -- Toys & Games
    ('bricks',    'building-and-construction',    'Building Bricks 500 Pieces','Blocko',       'Compatible classic bricks.',             NULL,       NULL, NULL),
    ('puzzle',    'jigsaw-puzzles',               'Jigsaw Puzzle 1000 Pieces', 'Puzzlers',     'A coastal scene.',                       NULL,       NULL, NULL),
    -- Clothing & Accessories
    ('tshirt',    't-shirts-and-polos',           'Cotton Crew T-Shirt',       'Basics',       '100% cotton.',                           NULL,       'colour', 'clothing_size'),
    -- Garden & Outdoor
    ('pottingmix','soil-and-potting-mix',         'Premium Potting Mix',       'Green Thumb',  'For pots and planters.',                 NULL,       'pack', NULL),
    ('hose',      'hoses-and-watering',           'Garden Hose 20m',           'Green Thumb',  'Kink resistant.',                        NULL,       'colour', NULL),
    -- Hardware & Tools
    ('drill',     'drills-and-drivers',           'Cordless Drill 18V',        'Torq',         'Battery and charger included.',          NULL,       NULL, NULL),
    ('screwdrivers','screwdrivers-and-spanners',  'Screwdriver Set 12 Piece',  'Torq',         'Magnetic tips.',                         NULL,       NULL, NULL),
    -- Office & Stationery
    ('pens',      'pens',                         'Ballpoint Pens 10 Pack',    'Inkwell',      'Medium point.',                          NULL,       'ink_colour', NULL),
    ('copypaper', 'copy-paper',                   'A4 Copy Paper 500 Sheets',  'Office Co',    '80 gsm.',                                NULL,       NULL, NULL),
    -- Sports & Fitness
    ('yogamat',   'yoga-and-pilates',             'Yoga Mat 6mm',              'Flow',         'Non-slip surface.',                      NULL,       'colour', NULL),
    ('dumbbells', 'weights-and-dumbbells',        'Hex Dumbbell',              'Iron Works',   'Rubber coated.',                         NULL,       'pack', NULL),
    -- Automotive
    ('engineoil', 'engine-oil',                   'Synthetic Engine Oil',      'Motorline',    '5W-30 full synthetic.',                  'per_l',    'pack', NULL),
    ('carwash',   'car-wash-and-wax',             'Car Wash & Wax 1L',         'Motorline',    'Wash and protect in one.',               'per_l',    'scent', NULL),
    -- Party & Entertaining
    ('balloons',  'balloons',                     'Party Balloons 25 Pack',    'Festa',        'Latex balloons.',                        NULL,       'colour', NULL),
    ('plates',    'party-plates-cups-and-napkins','Paper Plates',              'Festa',        'Sturdy 23cm plates.',                    'each',     'pack', NULL);

-- ── The variants ────────────────────────────────────────────────────────────────────────────────
-- v1/v2: option values in the order given (the selector's order). A Pack size value IS the variant's pack
-- size as `packLabel` says it ("500 g", "1 L", "12 pack"); an attribute value is the library value's label.

CREATE TEMP TABLE seed_v (
    pkey text, pos int, v1 text, v2 text, sku text, price numeric, was numeric,
    pack_qty numeric, pack_unit text, weight int, on_hand int
) ON COMMIT DROP;

INSERT INTO seed_v VALUES
    ('bananas', 0, NULL, NULL, 'SEED101-BAN', 3.90, NULL, 1, 'kg', 1000, 40),
    ('apples', 0, '1 kg', NULL, 'SEED101-APP-1', 4.90, NULL, 1, 'kg', 1000, 30),
    ('apples', 1, '2 kg', NULL, 'SEED101-APP-2', 8.90, NULL, 2, 'kg', 2000, 12),
    ('tomatoes', 0, NULL, NULL, 'SEED101-TOM', 3.50, NULL, 250, 'g', 260, 25),
    ('spinach', 0, NULL, NULL, 'SEED101-SPI', 3.00, NULL, 120, 'g', 130, 18),
    ('mince', 0, '500 g', NULL, 'SEED101-MIN-5', 7.00, NULL, 500, 'g', 520, 20),
    ('mince', 1, '1 kg', NULL, 'SEED101-MIN-1', 13.00, 15.00, 1, 'kg', 1030, 9),
    ('chicken', 0, '500 g', NULL, 'SEED101-CHK-5', 9.50, NULL, 500, 'g', 520, 22),
    ('chicken', 1, '1 kg', NULL, 'SEED101-CHK-1', 17.50, NULL, 1, 'kg', 1030, 3),
    ('salmon', 0, NULL, NULL, 'SEED101-SAL', 12.00, NULL, 250, 'g', 270, 14),
    ('milk', 0, '1 L', NULL, 'SEED101-MLK-1', 2.10, NULL, 1, 'l', 1060, 27),
    ('milk', 1, '2 L', NULL, 'SEED101-MLK-2', 3.60, NULL, 2, 'l', 2100, 34),
    ('yoghurt', 0, 'Plain', '500 g', 'SEED101-YOG-PL-5', 3.40, NULL, 500, 'g', 540, 39),
    ('yoghurt', 1, 'Plain', '1 kg', 'SEED101-YOG-PL-1', 5.80, NULL, 1, 'kg', 1060, 46),
    ('yoghurt', 2, 'Mango', '500 g', 'SEED101-YOG-MA-5', 4.50, NULL, 500, 'g', 540, 2),
    ('cheese', 0, '250 g', NULL, 'SEED101-CHE-250', 5.00, NULL, 250, 'g', 270, 23),
    ('cheese', 1, '500 g', NULL, 'SEED101-CHE-500', 8.50, NULL, 500, 'g', 520, 30),
    ('eggs', 0, '6 pack', NULL, 'SEED101-EGG-6', 4.20, NULL, 6, 'each', 380, 44),
    ('eggs', 1, '12 pack', NULL, 'SEED101-EGG-12', 7.20, NULL, 12, 'each', 760, 12),
    ('sourdough', 0, NULL, NULL, 'SEED101-SOUR', 6.50, NULL, 750, 'g', 760, 8),
    ('croissant', 0, '4 pack', NULL, 'SEED101-CRO-4', 5.00, NULL, 4, 'each', 280, 33),
    ('croissant', 1, '8 pack', NULL, 'SEED101-CRO-8', 9.00, NULL, 8, 'each', 560, 16),
    ('rolls', 0, NULL, NULL, 'SEED101-ROL', 4.00, NULL, 6, 'each', 420, 20),
    ('rice', 0, '1 kg', NULL, 'SEED101-RIC-1', 5.50, NULL, 1, 'kg', 1030, 3),
    ('rice', 1, '5 kg', NULL, 'SEED101-RIC-5', 21.00, 24.00, 5, 'kg', 5100, 0),
    ('pasta', 0, NULL, NULL, 'SEED101-PAS', 2.20, NULL, 500, 'g', 510, 36),
    ('oliveoil', 0, '500 mL', NULL, 'SEED101-OIL-5', 9.00, NULL, 500, 'ml', 560, 21),
    ('oliveoil', 1, '1 L', NULL, 'SEED101-OIL-1', 16.00, NULL, 1, 'l', 1080, 15),
    ('honey', 0, NULL, NULL, 'SEED101-HON', 7.50, NULL, 500, 'g', 600, 19),
    ('icecream', 0, 'Vanilla', NULL, 'SEED101-ICE-VA', 6.50, NULL, 2, 'l', 1100, 28),
    ('icecream', 1, 'Chocolate', NULL, 'SEED101-ICE-CH', 6.50, NULL, 2, 'l', 1100, 35),
    ('peas', 0, '500 g', NULL, 'SEED101-PEA-5', 2.50, NULL, 500, 'g', 520, 24),
    ('peas', 1, '1 kg', NULL, 'SEED101-PEA-1', 4.20, NULL, 1, 'kg', 1030, 17),
    ('chips', 0, 'Sea Salt', NULL, 'SEED101-CHI-SS', 4.00, NULL, 175, 'g', 200, 30),
    ('chips', 1, 'Salt & Vinegar', NULL, 'SEED101-CHI-SV', 4.00, NULL, 175, 'g', 200, 37),
    ('chocolate', 0, 'Original', NULL, 'SEED101-CHO-OR', 4.50, NULL, 180, 'g', 200, 44),
    ('chocolate', 1, 'Caramel', NULL, 'SEED101-CHO-CA', 3.50, 5.00, 180, 'g', 200, 21),
    ('cola', 0, '1.25 L', NULL, 'SEED101-COL-125', 2.50, NULL, 1.25, 'l', 1320, 25),
    ('cola', 1, '3.75 L', NULL, 'SEED101-COL-10', 9.00, 11.00, 3.75, 'l', 4100, 32),
    ('water', 0, 'Natural', NULL, 'SEED101-WAT-NA', 1.80, NULL, 1.25, 'l', 1300, 39),
    ('water', 1, 'Lemon', NULL, 'SEED101-WAT-LE', 2.20, NULL, 1.25, 'l', 1300, 46),
    ('coffee', 0, '250 g', NULL, 'SEED101-COF-250', 7.00, NULL, 250, 'g', 270, 20),
    ('coffee', 1, '1 kg', NULL, 'SEED101-COF-1K', 24.00, 28.00, 1, 'kg', 1040, 27),
    ('shiraz', 0, NULL, NULL, 'SEED101-SHZ', 18.00, 22.00, 750, 'ml', 1300, 18),
    ('lager', 0, '6 pack', NULL, 'SEED101-LAG-6', 22.00, NULL, 6, 'each', 2300, 12),
    ('lager', 1, '24 pack', NULL, 'SEED101-LAG-24', 55.00, NULL, 24, 'each', 9200, 6),
    ('lasagne', 0, NULL, NULL, 'SEED101-LAS', 14.00, NULL, 1, 'kg', 1050, 10),
    ('sushi', 0, NULL, NULL, 'SEED101-SUS', 9.50, NULL, 8, 'each', 300, 8),
    ('panadol', 0, '20 pack', NULL, 'SEED101-PAN-20', 3.50, NULL, 20, 'each', 30, 40),
    ('panadol', 1, '50 pack', NULL, 'SEED101-PAN-50', 7.00, NULL, 50, 'each', 60, 25),
    ('multivit', 0, NULL, NULL, 'SEED101-MUL', 19.00, NULL, 60, 'each', 150, 15),
    ('shampoo', 0, 'Original', NULL, 'SEED101-SHA-OR', 6.00, NULL, 400, 'ml', 450, 22),
    ('shampoo', 1, 'Coconut', NULL, 'SEED101-SHA-CO', 6.50, NULL, 400, 'ml', 450, 14),
    ('toothpaste', 0, NULL, NULL, 'SEED101-TOO', 3.20, NULL, 110, 'g', 140, 33),
    ('nappies', 0, 'Crawler', NULL, 'SEED101-NAP-CR', 16.00, 19.00, 44, 'each', 1400, 5),
    ('nappies', 1, 'Walker', NULL, 'SEED101-NAP-WA', 16.00, NULL, 40, 'each', 1450, 40),
    ('wipes', 0, '80 pack', NULL, 'SEED101-WIP-80', 3.00, NULL, 80, 'each', 450, 30),
    ('wipes', 1, '240 pack', NULL, 'SEED101-WIP-240', 8.00, NULL, 240, 'each', 1350, 18),
    ('dogfood', 0, '3 kg', NULL, 'SEED101-DOG-3', 22.00, NULL, 3, 'kg', 3100, 10),
    ('dogfood', 1, '10 kg', NULL, 'SEED101-DOG-10', 59.00, 65.00, 10, 'kg', 10200, 4),
    ('litter', 0, '5 kg', NULL, 'SEED101-LIT-5', 12.00, NULL, 5, 'kg', 5100, 16),
    ('litter', 1, '15 kg', NULL, 'SEED101-LIT-15', 30.00, NULL, 15, 'kg', 15200, 7),
    ('laundry', 0, 'Fresh', NULL, 'SEED101-LAU-FR', 14.00, NULL, 2, 'l', 2150, 20),
    ('laundry', 1, 'Lavender', NULL, 'SEED101-LAU-LA', 14.00, NULL, 2, 'l', 2150, 11),
    ('toiletpaper', 0, '12 pack', NULL, 'SEED101-TP-12', 9.00, NULL, 12, 'each', 1300, 25),
    ('toiletpaper', 1, '24 pack', NULL, 'SEED101-TP-24', 16.00, 19.00, 24, 'each', 2600, 13),
    ('fryingpan', 0, 'Black', NULL, 'SEED101-PAN-BK', 39.00, 49.00, NULL, NULL, 1300, 9),
    ('fryingpan', 1, 'Grey', NULL, 'SEED101-PAN-GY', 39.00, NULL, NULL, NULL, 1300, 6),
    ('mug', 0, 'White', NULL, 'SEED101-MUG-WH', 8.00, NULL, NULL, NULL, 450, 30),
    ('mug', 1, 'Blue', NULL, 'SEED101-MUG-BL', 8.00, NULL, NULL, NULL, 450, 22),
    ('charger', 0, 'White', NULL, 'SEED101-CHG-WH', 25.00, NULL, NULL, NULL, 120, 26),
    ('charger', 1, 'Black', NULL, 'SEED101-CHG-BK', 25.00, NULL, NULL, NULL, 120, 19),
    ('earbuds', 0, 'Black', NULL, 'SEED101-EAR-BK', 79.00, 99.00, NULL, NULL, 200, 12),
    ('earbuds', 1, 'White', NULL, 'SEED101-EAR-WH', 79.00, NULL, NULL, NULL, 200, 8),
    ('bricks', 0, NULL, NULL, 'SEED101-BRI', 29.00, NULL, NULL, NULL, 900, 10),
    ('puzzle', 0, NULL, NULL, 'SEED101-PUZ', 19.00, NULL, NULL, NULL, 700, 14),
    ('tshirt', 0, 'Black', 'M', 'SEED101-TEE-BK-M', 15.00, NULL, NULL, NULL, 200, 20),
    ('tshirt', 1, 'Black', 'L', 'SEED101-TEE-BK-L', 15.00, NULL, NULL, NULL, 210, 18),
    ('tshirt', 2, 'White', 'M', 'SEED101-TEE-WH-M', 15.00, NULL, NULL, NULL, 200, 25),
    ('pottingmix', 0, '25 L', NULL, 'SEED101-POT-25', 12.00, NULL, 25, 'l', 9000, 15),
    ('pottingmix', 1, '50 L', NULL, 'SEED101-POT-50', 21.00, NULL, 50, 'l', 18000, 6),
    ('hose', 0, 'Green', NULL, 'SEED101-HOS-GR', 45.00, NULL, NULL, NULL, 2500, 8),
    ('hose', 1, 'Grey', NULL, 'SEED101-HOS-GY', 45.00, NULL, NULL, NULL, 2500, 5),
    ('drill', 0, NULL, NULL, 'SEED101-DRL', 129.00, 149.00, NULL, NULL, 1800, 6),
    ('screwdrivers', 0, NULL, NULL, 'SEED101-SCR', 24.00, NULL, NULL, NULL, 800, 11),
    ('pens', 0, 'Blue', NULL, 'SEED101-PEN-BL', 5.00, NULL, NULL, NULL, 90, 40),
    ('pens', 1, 'Black', NULL, 'SEED101-PEN-BK', 5.00, NULL, NULL, NULL, 90, 36),
    ('copypaper', 0, NULL, NULL, 'SEED101-PAP', 8.50, NULL, NULL, NULL, 2500, 30),
    ('yogamat', 0, 'Purple', NULL, 'SEED101-YOG-PU', 35.00, NULL, NULL, NULL, 1200, 10),
    ('yogamat', 1, 'Black', NULL, 'SEED101-YOG-BK', 35.00, NULL, NULL, NULL, 1200, 7),
    ('dumbbells', 0, '5 kg', NULL, 'SEED101-DUM-5', 25.00, NULL, 5, 'kg', 5100, 9),
    ('dumbbells', 1, '10 kg', NULL, 'SEED101-DUM-10', 45.00, NULL, 10, 'kg', 10200, 4),
    ('engineoil', 0, '1 L', NULL, 'SEED101-OIL-1L', 18.00, NULL, 1, 'l', 950, 14),
    ('engineoil', 1, '5 L', NULL, 'SEED101-OIL-5L', 65.00, 75.00, 5, 'l', 4600, 8),
    ('carwash', 0, 'Original', NULL, 'SEED101-CAR-OR', 12.00, NULL, 1, 'l', 1100, 13),
    ('carwash', 1, 'Citrus', NULL, 'SEED101-CAR-CI', 12.00, NULL, 1, 'l', 1100, 10),
    ('balloons', 0, 'Multicolour', NULL, 'SEED101-BAL-MU', 6.00, NULL, NULL, NULL, 150, 24),
    ('balloons', 1, 'Gold', NULL, 'SEED101-BAL-GO', 7.00, NULL, NULL, NULL, 150, 15),
    ('plates', 0, '20 pack', NULL, 'SEED101-PLA-20', 4.00, NULL, 20, 'each', 600, 30),
    ('plates', 1, '50 pack', NULL, 'SEED101-PLA-50', 8.00, NULL, 50, 'each', 1500, 18);

-- ── Explicit details (beyond the filled-in required ones) ────────────────────────────────────────
-- vpos NULL = the whole product; a number = that variant (a detail that differs by flavour).
-- Choices by label; numbers in the attribute's first unit.

CREATE TEMP TABLE seed_d (
    pkey text, attr text, vpos int, labels text[], num numeric, txt text
) ON COMMIT DROP;

INSERT INTO seed_d VALUES
    -- Allergens differ by flavour (101 per-variant details).
    ('yoghurt',   'allergens', 0, ARRAY['Milk'], NULL, NULL),
    ('yoghurt',   'allergens', 1, ARRAY['Milk'], NULL, NULL),
    ('yoghurt',   'allergens', 2, ARRAY['Milk', 'Sulphites'], NULL, NULL),
    ('chocolate', 'allergens', 0, ARRAY['Milk', 'Soy'], NULL, NULL),
    ('chocolate', 'allergens', 1, ARRAY['Milk', 'Soy', 'Tree nuts'], NULL, NULL),
    ('cheese',    'allergens', NULL, ARRAY['Milk'], NULL, NULL),
    ('eggs',      'allergens', NULL, ARRAY['Eggs'], NULL, NULL),
    ('sourdough', 'allergens', NULL, ARRAY['Wheat (gluten)'], NULL, NULL),
    ('pasta',     'allergens', NULL, ARRAY['Wheat (gluten)'], NULL, NULL),
    ('salmon',    'allergens', NULL, ARRAY['Fish'], NULL, NULL),
    ('apples',    'country_of_origin', NULL, ARRAY['Australia'], NULL, NULL),
    ('shiraz',    'country_of_origin', NULL, ARRAY['Australia'], NULL, NULL),
    ('shiraz',    'alcohol_content', NULL, NULL, 14.5, NULL),
    ('lager',     'alcohol_content', NULL, NULL, 4.6, NULL);

-- Extra placements: browsed under a second leaf as well (staff's choice, never the shop's).
CREATE TEMP TABLE seed_place (pkey text, leaf text) ON COMMIT DROP;
INSERT INTO seed_place VALUES ('water', 'mixers'), ('chocolate', 'boxed-chocolates');

-- Every name above must be a seeded leaf, attribute and value: a typo stops here, before anything is written.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(x, ', ') INTO bad FROM (
        SELECT 'leaf ' || sp.leaf AS x FROM seed_p sp
         WHERE NOT EXISTS (SELECT 1 FROM public.category c JOIN public.category_resolved r ON r.category_id = c.id WHERE c.key = sp.leaf AND r.is_leaf)
        UNION ALL
        SELECT 'placement ' || pl.leaf FROM seed_place pl
         WHERE NOT EXISTS (SELECT 1 FROM public.category c JOIN public.category_resolved r ON r.category_id = c.id WHERE c.key = pl.leaf AND r.is_leaf)
        UNION ALL
        SELECT 'option ' || o.k || ' on ' || sp.pkey FROM seed_p sp CROSS JOIN LATERAL (VALUES (sp.opt1), (sp.opt2)) o(k)
         WHERE o.k IS NOT NULL AND o.k <> 'pack' AND NOT EXISTS (
            SELECT 1 FROM public.category c JOIN public.category_form f ON f.category_id = c.id
              JOIN public.attribute_definition ad ON ad.id = f.attribute_id
             WHERE c.key = sp.leaf AND ad.key = o.k AND ad.variant_option)
        UNION ALL
        SELECT 'value ' || x.label || ' of ' || x.k FROM (
            SELECT sp.opt1 AS k, sv.v1 AS label FROM seed_v sv JOIN seed_p sp USING (pkey) WHERE sp.opt1 NOT IN ('pack') AND sv.v1 IS NOT NULL
            UNION SELECT sp.opt2, sv.v2 FROM seed_v sv JOIN seed_p sp USING (pkey) WHERE sp.opt2 NOT IN ('pack') AND sv.v2 IS NOT NULL
            UNION SELECT d.attr, unnest(d.labels) FROM seed_d d WHERE d.labels IS NOT NULL
        ) x WHERE NOT EXISTS (
            SELECT 1 FROM public.attribute_allowed_value v JOIN public.attribute_definition ad ON ad.id = v.attribute_definition_id
             WHERE ad.key = x.k AND v.label = x.label AND v.status = 'active')
        UNION ALL
        SELECT 'detail ' || d.attr || ' on ' || d.pkey FROM seed_d d JOIN seed_p sp USING (pkey)
         WHERE NOT EXISTS (
            SELECT 1 FROM public.category c JOIN public.category_form f ON f.category_id = c.id
              JOIN public.attribute_definition ad ON ad.id = f.attribute_id
             WHERE c.key = sp.leaf AND ad.key = d.attr AND (d.vpos IS NULL OR ad.varies_by_variant))
    ) t;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION '101 seed: not in the seeded taxonomy: %. Nothing was written.', bad;
    END IF;
END
$$;

-- ── Write ───────────────────────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE seed_pid ON COMMIT DROP AS
SELECT sp.pkey, gen_random_uuid() AS product_id, c.id AS leaf_id FROM seed_p sp JOIN public.category c ON c.key = sp.leaf;

-- Storage, GST and 18+ are the leaf's resolved defaults, as a shop's new product takes them.
INSERT INTO public.product (
    id, shop_id, primary_category_id, name, brand, currency, short_description,
    status, approved_at, created_by, gst_status, storage, age_restricted, unit_basis)
SELECT i.product_id, s.shop_id, i.leaf_id, sp.name, sp.brand, 'AUD', sp.blurb,
       'active', now(), 'seed:101', coalesce(r.gst_status, 'taxable'), coalesce(r.storage, 'ambient'),
       coalesce(r.age_restricted, false), sp.unit_basis
FROM seed_p sp
JOIN seed_pid i ON i.pkey = sp.pkey
JOIN public.category_resolved r ON r.category_id = i.leaf_id
CROSS JOIN seed_shop s;

-- Options: Pack size, or the library attribute.
INSERT INTO public.product_option (product_id, "position", kind, attribute_id)
SELECT i.product_id, o.pos, CASE WHEN o.k = 'pack' THEN 'pack_size' ELSE 'attribute' END,
       (SELECT ad.id FROM public.attribute_definition ad WHERE ad.key = o.k)
FROM seed_p sp JOIN seed_pid i ON i.pkey = sp.pkey
CROSS JOIN LATERAL (VALUES (1, sp.opt1), (2, sp.opt2)) AS o (pos, k)
WHERE o.k IS NOT NULL;

-- Values in first-seen order; an attribute value names its library value, `value` is the label copy.
INSERT INTO public.product_option_value (option_id, value, "position", allowed_value_id)
SELECT o.id, x.label, (row_number() OVER (PARTITION BY o.id ORDER BY x.first_pos) - 1)::smallint,
       (SELECT v.id FROM public.attribute_allowed_value v WHERE v.attribute_definition_id = o.attribute_id AND v.label = x.label)
FROM (
    SELECT sv.pkey, 1 AS pos, sv.v1 AS label, min(sv.pos) AS first_pos FROM seed_v sv WHERE sv.v1 IS NOT NULL GROUP BY sv.pkey, sv.v1
    UNION ALL
    SELECT sv.pkey, 2, sv.v2, min(sv.pos) FROM seed_v sv WHERE sv.v2 IS NOT NULL GROUP BY sv.pkey, sv.v2
) x
JOIN seed_pid i ON i.pkey = x.pkey
JOIN public.product_option o ON o.product_id = i.product_id AND o."position" = x.pos;

INSERT INTO public.product_variant (
    product_id, shop_id, option1_value_id, option2_value_id, "position", sku,
    shop_price_amount, shop_compare_at_amount, price_amount, compare_at_amount,
    weight_grams, weight_is_assumed, pack_quantity, pack_unit, stock_tracked, stock_on_hand)
SELECT i.product_id, s.shop_id, v1.id, v2.id, sv.pos, sv.sku,
       sv.price, sv.was, sv.price, sv.was,
       sv.weight, false, sv.pack_qty, sv.pack_unit, true, sv.on_hand
FROM seed_v sv
JOIN seed_pid i ON i.pkey = sv.pkey
CROSS JOIN seed_shop s
LEFT JOIN public.product_option o1 ON o1.product_id = i.product_id AND o1."position" = 1
LEFT JOIN public.product_option_value v1 ON v1.option_id = o1.id AND v1.value = sv.v1
LEFT JOIN public.product_option o2 ON o2.product_id = i.product_id AND o2."position" = 2
LEFT JOIN public.product_option_value v2 ON v2.option_id = o2.id AND v2.value = sv.v2;

-- An attribute option's value is also each variant's own detail (filterable), as applyVariantSet writes it.
INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, variant_id, allowed_value_ids)
SELECT v.product_id, o.attribute_id, v.id, ARRAY[ov.allowed_value_id]
FROM public.product_variant v
JOIN seed_pid i ON i.product_id = v.product_id
JOIN public.product_option_value ov ON ov.id IN (v.option1_value_id, v.option2_value_id)
JOIN public.product_option o ON o.id = ov.option_id
WHERE o.kind = 'attribute';

-- The explicit details.
INSERT INTO public.product_attribute_value (
    product_id, attribute_definition_id, variant_id, allowed_value_ids, value_number, value_unit, value_base, value_text)
SELECT i.product_id, ad.id,
       (SELECT v.id FROM public.product_variant v WHERE v.product_id = i.product_id AND v."position" = d.vpos),
       CASE WHEN d.labels IS NULL THEN NULL ELSE ARRAY(
           SELECT av.id FROM public.attribute_allowed_value av
            WHERE av.attribute_definition_id = ad.id AND av.label = ANY (d.labels) ORDER BY av."position") END,
       d.num, CASE WHEN d.num IS NULL THEN NULL ELSE ad.units[1] END,
       CASE WHEN d.num IS NULL THEN NULL ELSE d.num END,
       d.txt
FROM seed_d d
JOIN seed_pid i ON i.pkey = d.pkey
JOIN public.attribute_definition ad ON ad.key = d.attr;

-- Every REQUIRED detail of the leaf's form that is still empty gets a plain answer, from the form itself
-- (the first value, "No", the smallest allowed number, "See pack"), so every product can be approved and
-- the seed follows the taxonomy as staff change it. A variant option's attribute is set by the option.
INSERT INTO public.product_attribute_value (
    product_id, attribute_definition_id, allowed_value_ids, value_boolean, value_number, value_unit, value_base,
    value_text, value_date, value_time)
SELECT i.product_id, ad.id,
       CASE WHEN ad.input_type IN ('single_select', 'multi_select') THEN ARRAY[(
           SELECT av.id FROM public.attribute_allowed_value av
            WHERE av.attribute_definition_id = ad.id AND av.status = 'active' ORDER BY av."position" LIMIT 1)] END,
       CASE WHEN ad.input_type = 'boolean' THEN false END,
       CASE WHEN ad.input_type = 'number' THEN n.num END,
       CASE WHEN ad.input_type = 'number' THEN ad.units[1] END,
       CASE WHEN ad.input_type = 'number' THEN n.num * n.factor END,
       CASE WHEN ad.input_type IN ('short_text', 'long_text') THEN 'See pack' END,
       CASE WHEN ad.input_type = 'date' THEN current_date END,
       CASE WHEN ad.input_type = 'time' THEN time '09:00' END
FROM seed_pid i
JOIN public.category_form f ON f.category_id = i.leaf_id AND f.level = 'required'
JOIN public.attribute_definition ad ON ad.id = f.attribute_id
CROSS JOIN LATERAL (
    SELECT u.factor,
           -- 1 of the first unit, raised to the minimum and kept under the maximum (both in base units).
           round(least(greatest(1, coalesce(ad.min_value / u.factor, 1)), coalesce(ad.max_value / u.factor, 1e9)), 3) AS num
      FROM (SELECT CASE ad.units[1]
                       WHEN 'mg' THEN 0.001 WHEN 'kg' THEN 1000 WHEN 'L' THEN 1000 WHEN 'cm' THEN 10 WHEN 'm' THEN 1000
                       WHEN 'in' THEN 25.4 WHEN 'm²' THEN 10000 WHEN 'kW' THEN 1000 WHEN 'TB' THEN 1000 WHEN 'h' THEN 60
                       WHEN 'd' THEN 1440 WHEN 'mo' THEN 43200 WHEN 'y' THEN 525600 ELSE 1 END::numeric AS factor) u
) n
WHERE NOT EXISTS (SELECT 1 FROM public.product_attribute_value x WHERE x.product_id = i.product_id AND x.attribute_definition_id = ad.id)
  AND NOT EXISTS (SELECT 1 FROM public.product_option o WHERE o.product_id = i.product_id AND o.attribute_id = ad.id);

INSERT INTO public.product_placement (product_id, category_id, created_by)
SELECT i.product_id, c.id, 'seed:101'
FROM seed_place pl JOIN seed_pid i ON i.pkey = pl.pkey JOIN public.category c ON c.key = pl.leaf;

-- A tracked variant's opening count is explained by a movement, as every count must be.
INSERT INTO public.stock_movement (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind)
SELECT v.product_id, v.id, v.shop_id, v.stock_on_hand, 0, v.stock_on_hand, 'tracking_enabled', 'system'
FROM public.product_variant v JOIN seed_pid i ON i.product_id = v.product_id
WHERE v.stock_tracked;

-- The listing summary, exactly as refreshListing computes it.
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
     ORDER BY v.product_id, v.price_amount, v."position"
) s
JOIN seed_pid i ON i.product_id = s.product_id
WHERE p.id = s.product_id;

-- Nothing seeded may be missing a required detail: approval would refuse it.
DO $$
DECLARE bad text;
BEGIN
    SELECT string_agg(p.name || ' (' || m.attribute_name || ')', ', ') INTO bad
      FROM public.product p CROSS JOIN LATERAL public.product_missing_required(p.id) m
     WHERE p.created_by = 'seed:101';
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION '101 seed: required details still empty: %', bad;
    END IF;
END
$$;

COMMIT;

SELECT (SELECT count(*) FROM public.product p WHERE p.created_by = 'seed:101') AS seeded_products,
       (SELECT count(*) FROM public.product_variant v WHERE v.sku LIKE 'SEED101-%') AS seeded_variants,
       (SELECT count(DISTINCT r.path_keys[1]) FROM public.product p JOIN public.category_resolved r ON r.category_id = p.primary_category_id
         WHERE p.created_by = 'seed:101') AS departments;
