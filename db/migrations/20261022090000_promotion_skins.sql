-- +goose Up
-- 095 — PROMOTION SKINS: how a promotion looks in each place it is shown, designed by staff.
--
-- A skin is one layout from a closed list plus a settings document whose shape, validation and readability
-- check are declared once in `@effy/shared-types` (promotion-skins.ts); the admin service is the only
-- writer and refuses an unreadable skin. Promotions gain pictures. Display groups gain a size and default
-- skins; each member may choose its own skin and picture.
--
-- ⚠ NOTHING A SHOPPER SEES CHANGES WITH THIS MIGRATION. Every group defaults to the built-in `classic`
-- skin — "draw this place exactly as before 095" — and every member wears its group's default. The aisles
-- menu, which read `home.banners` (home-hero + home-between), now reads `mega-nav`, seeded with the same
-- promotions in the same order.
--
-- No trigger: the platform forbids triggers that can abort a write; every rule that is not a CHECK or a
-- foreign key is enforced in the admin service.

CREATE TABLE public.promotion_skin (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
    layout     text NOT NULL CHECK (layout IN ('classic', 'panel', 'header_card', 'full_picture', 'picture_beside', 'tile', 'strip')),
    settings   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
    version    int NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by text NOT NULL,
    updated_by text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX promotion_skin_name_key ON public.promotion_skin (lower(btrim(name)));
-- Exactly one built-in skin.
CREATE UNIQUE INDEX promotion_skin_one_classic ON public.promotion_skin ((true)) WHERE layout = 'classic';
COMMENT ON TABLE public.promotion_skin IS 'How a promotion looks (095): a layout + settings (SkinSettings, @effy/shared-types). Written by the admin service only, which checks readability. The classic skin is built in: never updated or removed.';

CREATE TABLE public.promotion_image (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotion (id) ON DELETE CASCADE,
    storage_key  text NOT NULL UNIQUE CHECK (storage_key LIKE 'promotions/%'),
    width        int NOT NULL CHECK (width > 0),
    height       int NOT NULL CHECK (height > 0),
    alt          text NOT NULL CHECK (length(btrim(alt)) BETWEEN 1 AND 150),
    focus_x      numeric(4, 3) NOT NULL DEFAULT 0.5 CHECK (focus_x BETWEEN 0 AND 1),
    focus_y      numeric(4, 3) NOT NULL DEFAULT 0.5 CHECK (focus_y BETWEEN 0 AND 1),
    position     int NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_image_promotion_idx ON public.promotion_image (promotion_id, position);
COMMENT ON TABLE public.promotion_image IS 'A picture attached to a promotion (095), under the public promotions/ prefix. At most 10 per promotion (admin service, under the promotion row lock).';

-- ── the skins ───────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.promotion_skin (name, layout, settings, created_by) VALUES ('Classic', 'classic', '{}'::jsonb, 'migration:095');

-- Starting points staff can pick or duplicate (`starterSettings` in promotion-skins.ts; each passes skinContrast).
INSERT INTO public.promotion_skin (name, layout, settings, created_by) VALUES
    ('Panel — Effy blue', 'panel', '{"background":{"colour":"#1d4ed8","picture":"none"},"label":{"show":true,"words":"auto","colour":"#ffffff","size":"xs","tracking":"wide"},"headline":{"colour":"#ffffff","size":"xl","weight":"semibold","lines":2},"supporting":{"show":true,"colour":"#ffffff","size":"sm","weight":"regular","lines":2},"button":{"style":"filled","fill":"#ffffff","text":"#111827","words":"auto","icon":true},"chip":{"show":true,"style":"dashed","fill":"#ffffff","text":"#ffffff"},"decorations":{"show":true,"set":"food","colour":"#ffffff","strength":0.2},"align":"start","shape":{"radius":"xl","spacing":"regular","outline":null}}'::jsonb, 'migration:095'),
    ('Header card — Effy orange', 'header_card', '{"background":{"colour":"#c2410c","picture":"none"},"label":{"show":true,"words":"auto","colour":"#ffffff","size":"xs","tracking":"wide"},"headline":{"colour":"#ffffff","size":"xl","weight":"semibold","lines":2},"supporting":{"show":true,"colour":"#52525b","size":"sm","weight":"regular","lines":2},"button":{"style":"link","fill":"#ffffff","text":"#1d4ed8","words":"auto","icon":true},"chip":{"show":false,"style":"filled","fill":"#f4f4f5","text":"#18181b"},"decorations":{"show":true,"set":"food","colour":"#ffffff","strength":0.2},"align":"start","shape":{"radius":"xl","spacing":"regular","outline":null},"body":{"colour":"#ffffff","tagColour":"#18181b"}}'::jsonb, 'migration:095'),
    ('Full picture — dark tint', 'full_picture', '{"background":{"colour":"#18181b","picture":"show","tint":{"colour":"#000000","strength":0.6}},"label":{"show":true,"words":"auto","colour":"#ffffff","size":"xs","tracking":"wide"},"headline":{"colour":"#ffffff","size":"xl","weight":"semibold","lines":2},"supporting":{"show":true,"colour":"#ffffff","size":"sm","weight":"regular","lines":2},"button":{"style":"filled","fill":"#ffffff","text":"#111827","words":"auto","icon":true},"chip":{"show":true,"style":"dashed","fill":"#ffffff","text":"#ffffff"},"decorations":{"show":false,"set":"food","colour":"#ffffff","strength":0.2},"align":"start","shape":{"radius":"xl","spacing":"regular","outline":null},"textCorner":"bottom-start"}'::jsonb, 'migration:095'),
    ('Picture beside — white', 'picture_beside', '{"background":{"colour":"#ffffff","picture":"show"},"label":{"show":true,"words":"auto","colour":"#1d4ed8","size":"xs","tracking":"wide"},"headline":{"colour":"#18181b","size":"xl","weight":"semibold","lines":2},"supporting":{"show":true,"colour":"#52525b","size":"sm","weight":"regular","lines":2},"button":{"style":"filled","fill":"#1d4ed8","text":"#ffffff","words":"auto","icon":true},"chip":{"show":true,"style":"dashed","fill":"#ffffff","text":"#18181b"},"decorations":{"show":false,"set":"food","colour":"#ffffff","strength":0.2},"align":"start","shape":{"radius":"xl","spacing":"regular","outline":"#e4e4e7"},"pictureSide":"end","pictureFit":"cover"}'::jsonb, 'migration:095'),
    ('Tile — Effy blue', 'tile', '{"background":{"colour":"#1d4ed8","picture":"none"},"label":{"show":true,"words":"auto","colour":"#ffffff","size":"xs","tracking":"wide"},"headline":{"colour":"#ffffff","size":"lg","weight":"semibold","lines":2},"supporting":{"show":false,"colour":"#ffffff","size":"sm","weight":"regular","lines":2},"button":{"style":"none","fill":"#ffffff","text":"#111827","words":"auto","icon":true},"chip":{"show":false,"style":"dashed","fill":"#ffffff","text":"#ffffff"},"decorations":{"show":true,"set":"food","colour":"#ffffff","strength":0.2},"align":"start","shape":{"radius":"xl","spacing":"regular","outline":null}}'::jsonb, 'migration:095'),
    ('Strip — Effy blue', 'strip', '{"background":{"colour":"#1d4ed8","picture":"none"},"label":{"show":false,"words":"auto","colour":"#ffffff","size":"xs","tracking":"wide"},"headline":{"colour":"#ffffff","size":"md","weight":"semibold","lines":1},"supporting":{"show":false,"colour":"#ffffff","size":"sm","weight":"regular","lines":2},"button":{"style":"link","fill":"#ffffff","text":"#ffffff","words":"auto","icon":true},"chip":{"show":true,"style":"dashed","fill":"#ffffff","text":"#ffffff"},"decorations":{"show":false,"set":"food","colour":"#ffffff","strength":0.2},"align":"start","shape":{"radius":"lg","spacing":"compact","outline":null}}'::jsonb, 'migration:095');

-- ── groups: a size and default skins ─────────────────────────────────────────────────────────────
ALTER TABLE public.promotion_group
    ADD COLUMN size                 text NULL CHECK (size IN ('large', 'medium', 'small', 'strip')),
    ADD COLUMN default_skin_id      uuid NULL REFERENCES public.promotion_skin (id) ON DELETE RESTRICT,
    ADD COLUMN default_code_skin_id uuid NULL REFERENCES public.promotion_skin (id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.promotion_group.default_code_skin_id IS 'The skin a promotion WITH a shared code wears here unless it chooses one; NULL = default_skin_id (095).';

INSERT INTO public.promotion_group (key, name, description, sort) VALUES
    ('mega-nav', 'Aisles menu', 'The offers in the website''s All aisles menu.', 60)
ON CONFLICT (key) DO NOTHING;

UPDATE public.promotion_group SET size = CASE key
        WHEN 'home-hero'    THEN 'large'
        WHEN 'home-side'    THEN 'medium'
        WHEN 'home-between' THEN 'medium'
        WHEN 'offers'       THEN 'medium'
        WHEN 'cart'         THEN 'strip'
        WHEN 'mega-nav'     THEN 'small'
        ELSE 'medium' END,
    default_skin_id = (SELECT id FROM public.promotion_skin WHERE layout = 'classic');

ALTER TABLE public.promotion_group
    ALTER COLUMN size SET NOT NULL,
    ALTER COLUMN default_skin_id SET NOT NULL;

-- ── members: a skin and a picture of their own ──────────────────────────────────────────────────
ALTER TABLE public.promotion_group_member
    ADD COLUMN skin_id  uuid NULL REFERENCES public.promotion_skin (id) ON DELETE RESTRICT,
    ADD COLUMN image_id uuid NULL REFERENCES public.promotion_image (id) ON DELETE SET NULL;
COMMENT ON COLUMN public.promotion_group_member.skin_id IS 'NULL = the group''s default (095).';
COMMENT ON COLUMN public.promotion_group_member.image_id IS 'NULL = the best-fitting picture of the promotion (095).';
CREATE INDEX promotion_group_member_skin_idx ON public.promotion_group_member (skin_id) WHERE skin_id IS NOT NULL;

-- The aisles menu showed home.banners — home-hero, then home-between — so mega-nav starts with them.
INSERT INTO public.promotion_group_member (group_id, promotion_id, position)
SELECT (SELECT id FROM public.promotion_group WHERE key = 'mega-nav'), promotion_id, (row_number() OVER (ORDER BY g_sort, position) - 1)::int
  FROM (SELECT DISTINCT ON (m.promotion_id) m.promotion_id, g.sort AS g_sort, m.position
          FROM public.promotion_group_member m
          JOIN public.promotion_group g ON g.id = m.group_id
         WHERE g.key IN ('home-hero', 'home-between')
         ORDER BY m.promotion_id, g.sort, m.position) first_place
ON CONFLICT DO NOTHING;

-- ── shoppers read, never write ──────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.promotion_skin, public.promotion_image FROM effy_shopper;

-- +goose Down
ALTER TABLE public.promotion_group_member DROP COLUMN image_id, DROP COLUMN skin_id;
DELETE FROM public.promotion_group_member WHERE group_id = (SELECT id FROM public.promotion_group WHERE key = 'mega-nav');
DELETE FROM public.promotion_group WHERE key = 'mega-nav';
ALTER TABLE public.promotion_group DROP COLUMN default_code_skin_id, DROP COLUMN default_skin_id, DROP COLUMN size;
DROP TABLE public.promotion_image;
DROP TABLE public.promotion_skin;
