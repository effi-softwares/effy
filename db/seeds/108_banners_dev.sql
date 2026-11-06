-- Information banners dev seed (108): four generic Effy banners, none of them an offer. DEV ONLY, run with
-- `make seed-banners ENV=dev`.
--
--   Home hero        1  Groceries to home appliances, from one place   → the Home & Kitchen aisle   (Panel - Effy blue)
--                    2  Delivered by Effy, when it suits you           → search                     (Panel - Effy blue)
--   Home side cards  1  Free delivery over {free_delivery_amount}      → the sale page              (Tile - Effy blue)
--                    2  Fresh from Melbourne shops, every day          → Fruit & Vegetables         (Header card - Effy orange)
--
-- No banner types a fact a setting owns: the free-delivery amount is a live value, filled from the active Effy delivery
-- plan each time it is shown (no free amount → the banner is not shown). No pictures: the skins give the look, and
-- pictures are uploaded in back-office.
--
-- Re-runnable: the four fixed ids are removed and written again. Needs the migrations (display groups and skins come
-- from the baseline). An aisle the catalogue seed has not created falls back to search, with a NOTICE.

\set ON_ERROR_STOP on

BEGIN;

DELETE FROM public.promotion_group_member WHERE promotion_id::text LIKE '55555555-0000-0000-0000-00000000000_';
DELETE FROM public.promotion WHERE id::text LIKE '55555555-0000-0000-0000-00000000000_';

CREATE TEMP TABLE seed_banner (
    id uuid, name text, headline text, supporting_line text, label text,
    link_kind text, aisle_key text, group_key text, skin_id uuid, ord int
) ON COMMIT DROP;

INSERT INTO seed_banner VALUES
    ('55555555-0000-0000-0000-000000000001', 'Range - home hero',
     'Groceries to home appliances, from one place',
     'Fresh food, household essentials, electronics and more, delivered by Effy.', 'New on Effy',
     'category', 'home-and-kitchen', 'home-hero', '073ee152-7ead-49d9-94af-f897ca1c35da', 1),
    ('55555555-0000-0000-0000-000000000002', 'Delivery promise - home hero',
     'Delivered by Effy, when it suits you',
     'Choose a delivery window today or later in the week.', NULL,
     'search', NULL, 'home-hero', '073ee152-7ead-49d9-94af-f897ca1c35da', 2),
    ('55555555-0000-0000-0000-000000000003', 'Free delivery - home side',
     'Free delivery over {free_delivery_amount}',
     'Every order of {free_delivery_amount} or more is delivered free by Effy.', NULL,
     'sale', NULL, 'home-side', 'b050729f-ecfb-4be9-9411-9a8584b3b664', 1),
    ('55555555-0000-0000-0000-000000000004', 'Local shops - home side',
     'Fresh from Melbourne shops, every day',
     'Fruit, veg, bread and more, packed by local shops near you.', NULL,
     'category', 'fruit-and-vegetables', 'home-side', '9cce1ae2-a6e5-4cd6-81da-a2f210a30584', 2);

DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(s.aisle_key, ', ') INTO missing
      FROM seed_banner s
     WHERE s.aisle_key IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.category c WHERE c.key = s.aisle_key AND c.status = 'active');
    IF missing IS NOT NULL THEN
        RAISE NOTICE 'seed-banners: aisle(s) % not found (run make seed-catalogue); those banners lead to search instead.', missing;
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

-- After whatever the group already holds, in the seed's order.
INSERT INTO public.promotion_group_member (group_id, promotion_id, position, skin_id)
SELECT g.id, s.id,
       coalesce((SELECT max(m.position) FROM public.promotion_group_member m WHERE m.group_id = g.id), -1) + s.ord,
       s.skin_id
  FROM seed_banner s
  JOIN public.promotion_group g ON g.key = s.group_key;

SELECT g.name AS "group", m.position + 1 AS position, p.headline, p.link_kind AS "a tap leads to",
       coalesce(c.name, '-') AS aisle, k.name AS skin
  FROM public.promotion p
  JOIN public.promotion_group_member m ON m.promotion_id = p.id
  JOIN public.promotion_group g ON g.id = m.group_id
  LEFT JOIN public.category c ON c.id = p.link_category_id
  LEFT JOIN public.promotion_skin k ON k.id = m.skin_id
 WHERE p.id::text LIKE '55555555-0000-0000-0000-00000000000_'
 ORDER BY g.sort, m.position;

COMMIT;
