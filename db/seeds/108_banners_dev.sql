-- Information banners dev seed (108): generic Effy banners in every display group, none of them an offer, on a range of
-- skins. DEV ONLY, run with `make seed-banners ENV=dev`.
--
--   Home hero (large)          Range · Delivery promise · Free delivery
--   Home side cards (medium)   Local shops · Household essentials     (compact skins: the hero is as tall as these)
--   Between Home sections      Tech and gadgets · Fresh bread · Pets  (all Panels, so the row is even)
--   Offers page (medium)       Free delivery · Party supplies · On sale
--   Cart (strip)               Free delivery · Search                 (no surface reads this group yet)
--   Aisles menu (small)        Fresh fruit & veg · Shop electronics   (short words, plain tiles)
--
-- 13 banners in 15 places: a banner may sit in several groups, wearing a different skin in each. Nine skins are added
-- (green, night, warm sand and sky variants of the 095 layouts); each was checked with skinProblems (valid settings, every
-- text readable on its ground) before it was written here.
--
-- No banner types a fact a setting owns: the free-delivery amount is a live value, filled from the active plan each time it is
-- shown (no free amount hides that banner). The order minimum is not used: a banner naming it is hidden while there is none. No pictures: the skins give the look, and pictures
-- are uploaded in back-office.
--
-- Re-runnable: the banner and skin ids are fixed (55555555-… and 66666666-…); banners are removed and written again,
-- skins upserted. Needs the migrations (groups and the 095 skins come from the baseline). An aisle the catalogue seed has
-- not created falls back to search, with a NOTICE.

\set ON_ERROR_STOP on

BEGIN;

-- ── Skins ───────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.promotion_skin (id, name, layout, settings, version, created_by, updated_by) VALUES
    ('66666666-0000-0000-0000-000000000001', 'Panel — Effy green', 'panel', '{"align": "start", "background": {"colour": "#047857", "picture": "none"}, "button": {"fill": "#ffffff", "icon": true, "style": "filled", "text": "#047857", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#ffffff"}, "decorations": {"colour": "#ffffff", "set": "produce", "show": true, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 2, "size": "xl", "weight": "semibold"}, "label": {"colour": "#ffffff", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#ffffff", "lines": 2, "show": true, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000002', 'Panel — night', 'panel', '{"align": "start", "background": {"colour": "#18181b", "picture": "none"}, "button": {"fill": "#2563eb", "icon": true, "style": "filled", "text": "#ffffff", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#ffffff"}, "decorations": {"colour": "#ffffff", "set": "food", "show": false, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 2, "size": "xl", "weight": "semibold"}, "label": {"colour": "#93c5fd", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#d4d4d8", "lines": 2, "show": true, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000003', 'Panel — warm sand', 'panel', '{"align": "start", "background": {"colour": "#fff7ed", "picture": "none"}, "button": {"fill": "#c2410c", "icon": true, "style": "filled", "text": "#ffffff", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#7c2d12"}, "decorations": {"colour": "#c2410c", "set": "bakery", "show": true, "strength": 0.15}, "headline": {"colour": "#7c2d12", "lines": 2, "size": "xl", "weight": "semibold"}, "label": {"colour": "#c2410c", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#9a3412", "lines": 2, "show": true, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000004', 'Tile — Effy green', 'tile', '{"align": "start", "background": {"colour": "#047857", "picture": "none"}, "button": {"fill": "#ffffff", "icon": true, "style": "none", "text": "#111827", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#ffffff"}, "decorations": {"colour": "#ffffff", "set": "produce", "show": true, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 2, "size": "lg", "weight": "semibold"}, "label": {"colour": "#ffffff", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#ffffff", "lines": 2, "show": false, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000005', 'Tile — night', 'tile', '{"align": "start", "background": {"colour": "#18181b", "picture": "none"}, "button": {"fill": "#ffffff", "icon": true, "style": "none", "text": "#111827", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#ffffff"}, "decorations": {"colour": "#ffffff", "set": "food", "show": false, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 2, "size": "lg", "weight": "semibold"}, "label": {"colour": "#93c5fd", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#ffffff", "lines": 2, "show": false, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000006', 'Tile — sky', 'tile', '{"align": "start", "background": {"colour": "#e0f2fe", "picture": "none"}, "button": {"fill": "#ffffff", "icon": true, "style": "none", "text": "#111827", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#0c4a6e"}, "decorations": {"colour": "#0369a1", "set": "food", "show": false, "strength": 0.2}, "headline": {"colour": "#0c4a6e", "lines": 2, "size": "lg", "weight": "semibold"}, "label": {"colour": "#0369a1", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#0c4a6e", "lines": 2, "show": false, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000007', 'Header card — Effy green', 'header_card', '{"align": "start", "background": {"colour": "#047857", "picture": "none"}, "body": {"colour": "#ffffff", "tagColour": "#18181b"}, "button": {"fill": "#ffffff", "icon": true, "style": "link", "text": "#047857", "words": "auto"}, "chip": {"fill": "#f4f4f5", "show": false, "style": "filled", "text": "#18181b"}, "decorations": {"colour": "#ffffff", "set": "produce", "show": true, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 2, "size": "xl", "weight": "semibold"}, "label": {"colour": "#ffffff", "show": true, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "xl", "spacing": "regular"}, "supporting": {"colour": "#52525b", "lines": 2, "show": true, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000008', 'Strip — Effy green', 'strip', '{"align": "start", "background": {"colour": "#047857", "picture": "none"}, "button": {"fill": "#ffffff", "icon": true, "style": "link", "text": "#ffffff", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#ffffff"}, "decorations": {"colour": "#ffffff", "set": "food", "show": false, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 1, "size": "md", "weight": "semibold"}, "label": {"colour": "#ffffff", "show": false, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "lg", "spacing": "compact"}, "supporting": {"colour": "#ffffff", "lines": 2, "show": false, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners'),
    ('66666666-0000-0000-0000-000000000009', 'Strip — night', 'strip', '{"align": "start", "background": {"colour": "#18181b", "picture": "none"}, "button": {"fill": "#ffffff", "icon": true, "style": "link", "text": "#93c5fd", "words": "auto"}, "chip": {"fill": "#ffffff", "show": false, "style": "dashed", "text": "#ffffff"}, "decorations": {"colour": "#ffffff", "set": "food", "show": false, "strength": 0.2}, "headline": {"colour": "#ffffff", "lines": 1, "size": "md", "weight": "semibold"}, "label": {"colour": "#ffffff", "show": false, "size": "xs", "tracking": "wide", "words": "auto"}, "shape": {"outline": null, "radius": "lg", "spacing": "compact"}, "supporting": {"colour": "#ffffff", "lines": 2, "show": false, "size": "sm", "weight": "regular"}}'::jsonb, 1, 'seed:banners', 'seed:banners')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, layout = EXCLUDED.layout, settings = EXCLUDED.settings,
    version = public.promotion_skin.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now();

-- ── Banners ─────────────────────────────────────────────────────────────────────────────────────────
DELETE FROM public.promotion_group_member WHERE promotion_id::text LIKE '55555555-0000-0000-0000-0000000000__';
DELETE FROM public.promotion WHERE id::text LIKE '55555555-0000-0000-0000-0000000000__';

CREATE TEMP TABLE seed_banner (
    id uuid, name text, headline text, supporting_line text, label text, link_kind text, aisle_key text
) ON COMMIT DROP;

INSERT INTO seed_banner VALUES
    ('55555555-0000-0000-0000-000000000001', 'Range',
     'Groceries to home appliances, from one place',
     'Fresh food, household essentials, electronics and more, delivered by Effy.', 'New on Effy', 'category', 'home-and-kitchen'),
    ('55555555-0000-0000-0000-000000000002', 'Delivery promise',
     'Delivered by Effy, when it suits you',
     'Choose a delivery window today or later in the week.', 'Delivered by Effy', 'search', NULL),
    ('55555555-0000-0000-0000-000000000003', 'Free delivery',
     'Free delivery over {free_delivery_amount}',
     'Every order of {free_delivery_amount} or more is delivered free by Effy.', NULL, 'sale', NULL),
    ('55555555-0000-0000-0000-000000000004', 'Local shops',
     'Fresh from Melbourne shops, every day',
     'Fruit, veg, bread and more, packed by local shops near you.', NULL, 'category', 'fruit-and-vegetables'),
    ('55555555-0000-0000-0000-000000000005', 'Household essentials',
     'Household essentials, sorted',
     'Cleaning, laundry and paper goods, delivered with your groceries.', NULL, 'category', 'household-and-cleaning'),
    ('55555555-0000-0000-0000-000000000006', 'Tech and gadgets',
     'Tech and gadgets, delivered',
     'Headphones, chargers, TVs and more from the Electronics aisle.', NULL, 'category', 'electronics'),
    ('55555555-0000-0000-0000-000000000007', 'Fresh bread',
     'Fresh bread from local bakeries',
     'Sourdough, rolls, wraps and more.', NULL, 'category', 'bakery'),
    ('55555555-0000-0000-0000-000000000008', 'Pets',
     'Everything for your pets',
     'Food, litter and treats, delivered to your door.', NULL, 'category', 'pet'),
    -- No live value here: a banner naming the order minimum is hidden while there is none (dev has none).
    ('55555555-0000-0000-0000-000000000009', 'Party supplies',
     'Party supplies, delivered',
     'Balloons, mixers, ice and everything for the table.', NULL, 'category', 'party-and-entertaining'),
    ('55555555-0000-0000-0000-000000000010', 'On sale',
     'Everything on sale, in one place',
     'Browse every product with a lower price right now.', NULL, 'sale', NULL),
    ('55555555-0000-0000-0000-000000000011', 'Search',
     'Forgot something? Search everything Effy sells',
     NULL, NULL, 'search', NULL),
    -- Short words for the aisles menu's small tiles.
    ('55555555-0000-0000-0000-000000000012', 'Aisles menu - fruit and veg',
     'Fresh fruit & veg', NULL, NULL, 'category', 'fruit-and-vegetables'),
    ('55555555-0000-0000-0000-000000000013', 'Aisles menu - electronics',
     'Shop electronics', NULL, NULL, 'category', 'electronics');

-- Where each is shown, in order, and the skin it wears there (it must fit the group's size: layoutFits).
CREATE TEMP TABLE seed_place (banner_no int, group_key text, ord int, skin_id uuid) ON COMMIT DROP;
INSERT INTO seed_place VALUES
    (1,  'home-hero',    1, '073ee152-7ead-49d9-94af-f897ca1c35da'),  -- Panel - Effy blue
    (2,  'home-hero',    2, '66666666-0000-0000-0000-000000000001'),  -- Panel - Effy green
    (3,  'home-hero',    3, '66666666-0000-0000-0000-000000000002'),  -- Panel - night
    (4,  'home-side',    1, '66666666-0000-0000-0000-000000000003'),  -- Panel - warm sand
    (5,  'home-side',    2, 'b050729f-ecfb-4be9-9411-9a8584b3b664'),  -- Tile - Effy blue
    (6,  'home-between', 1, '66666666-0000-0000-0000-000000000002'),  -- Panel - night
    (7,  'home-between', 2, '66666666-0000-0000-0000-000000000003'),  -- Panel - warm sand
    (8,  'home-between', 3, '66666666-0000-0000-0000-000000000001'),  -- Panel - Effy green
    (3,  'offers',       1, '66666666-0000-0000-0000-000000000004'),  -- Tile - Effy green
    (9,  'offers',       2, '66666666-0000-0000-0000-000000000006'),  -- Tile - sky
    (10, 'offers',       3, '66666666-0000-0000-0000-000000000005'),  -- Tile - night
    (3,  'cart',         1, '66666666-0000-0000-0000-000000000008'),  -- Strip - Effy green
    (11, 'cart',         2, '66666666-0000-0000-0000-000000000009'),  -- Strip - night
    (12, 'mega-nav',     1, '66666666-0000-0000-0000-000000000005'),  -- Tile - night (no decorations: a small tile)
    (13, 'mega-nav',     2, '66666666-0000-0000-0000-000000000006');  -- Tile - sky (no decorations)

DO $$
DECLARE
    missing text;
    misfit text;
BEGIN
    SELECT string_agg(s.aisle_key, ', ') INTO missing
      FROM seed_banner s
     WHERE s.aisle_key IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.category c WHERE c.key = s.aisle_key AND c.status = 'active');
    IF missing IS NOT NULL THEN
        RAISE NOTICE 'seed-banners: aisle(s) % not found (run make seed-catalogue); those banners lead to search instead.', missing;
    END IF;
    -- The layouts each group size takes (LAYOUT_FITS in @effy/shared-types/promotion-skins.ts).
    SELECT string_agg(k.name || ' in ' || g.key, ', ') INTO misfit
      FROM seed_place p
      JOIN public.promotion_group g ON g.key = p.group_key
      JOIN public.promotion_skin k ON k.id = p.skin_id
     WHERE NOT (k.layout = 'classic'
             OR (k.layout = 'panel' AND g.size IN ('large', 'medium'))
             OR (k.layout = 'header_card' AND g.size IN ('medium', 'small'))
             OR (k.layout = 'full_picture' AND g.size IN ('large', 'medium'))
             OR (k.layout = 'picture_beside' AND g.size IN ('large', 'medium', 'strip'))
             OR (k.layout = 'tile' AND g.size IN ('small', 'medium'))
             OR (k.layout = 'strip' AND g.size = 'strip'));
    IF misfit IS NOT NULL THEN
        RAISE EXCEPTION 'seed-banners: skin(s) that do not fit their group: %', misfit;
    END IF;
END
$$;

-- Through the same columns the admin writer uses; the shape CHECK refuses anything an offer would carry.
INSERT INTO public.promotion (id, name, kind, headline, supporting_line, label, link_kind, link_category_id, published_at, created_by, updated_by)
SELECT s.id, s.name, 'banner', s.headline, s.supporting_line, s.label,
       CASE WHEN s.link_kind = 'category' AND c.id IS NULL THEN 'search' ELSE s.link_kind END,
       c.id, now(), 'seed:banners', 'seed:banners'
  FROM seed_banner s
  LEFT JOIN public.category c ON c.key = s.aisle_key AND c.status = 'active';

-- After whatever each group already holds, in the seed's order.
INSERT INTO public.promotion_group_member (group_id, promotion_id, position, skin_id)
SELECT g.id, ('55555555-0000-0000-0000-0000000000' || lpad(p.banner_no::text, 2, '0'))::uuid,
       coalesce((SELECT max(m.position) FROM public.promotion_group_member m WHERE m.group_id = g.id), -1) + p.ord,
       p.skin_id
  FROM seed_place p
  JOIN public.promotion_group g ON g.key = p.group_key;

SELECT g.name AS "group", m.position + 1 AS position, p.headline, p.link_kind AS "a tap leads to",
       coalesce(c.name, '-') AS aisle, k.name AS skin
  FROM public.promotion p
  JOIN public.promotion_group_member m ON m.promotion_id = p.id
  JOIN public.promotion_group g ON g.id = m.group_id
  LEFT JOIN public.category c ON c.id = p.link_category_id
  LEFT JOIN public.promotion_skin k ON k.id = m.skin_id
 WHERE p.id::text LIKE '55555555-0000-0000-0000-0000000000__'
 ORDER BY g.sort, m.position;

COMMIT;
