-- 108 Information banners: a fifth promotion kind, `banner`, that carries no offer (specs/108-information-banners).
--
-- • A banner lives in public.promotion like an offer, so display groups, pictures, skins, the state function and the
--   activity log work unchanged.
-- • The offer-only columns (trigger, value_type, applies_to) become nullable. promotion_banner_shape_ck says a banner
--   has none of an offer's settings and an offer has all three, so any reader that forgets the new kind fails loudly
--   instead of treating a banner as an automatic offer.
-- • An offer's destination is derived from what its discount covers; a banner has nothing to cover, so it stores its
--   own: link_kind plus an aisle or a product. Deleting the aisle or product leaves the banner (its tile becomes
--   non-tappable) rather than the banner blocking the delete.
-- • Codes, chosen customers, targets and uses never hold a banner's id: the one admin writer refuses them and the
--   engine never selects a banner (no aborting triggers, by the platform's rule).
--
-- Additive for every existing row: each is an offer and keeps its three columns set.

-- +goose Up
ALTER TABLE public.promotion
    DROP CONSTRAINT promotion_kind_check,
    ADD CONSTRAINT promotion_kind_check CHECK (kind = ANY (ARRAY['cart', 'item', 'bxgy', 'delivery', 'banner'])),
    ALTER COLUMN trigger DROP NOT NULL,
    ALTER COLUMN value_type DROP NOT NULL,
    ALTER COLUMN applies_to DROP NOT NULL,
    ADD COLUMN link_kind text,
    ADD COLUMN link_category_id uuid REFERENCES public.category(id) ON DELETE SET NULL,
    ADD COLUMN link_product_id uuid REFERENCES public.product(id) ON DELETE SET NULL,
    ADD CONSTRAINT promotion_link_kind_check CHECK (link_kind IS NULL OR link_kind = ANY (ARRAY['search', 'sale', 'category', 'product'])),
    -- A banner always says where a tap goes; an offer never stores it (its destination comes from its targets).
    ADD CONSTRAINT promotion_link_ck CHECK (
        (kind = 'banner') = (link_kind IS NOT NULL)
        AND (link_category_id IS NULL OR link_kind = 'category')
        AND (link_product_id IS NULL OR link_kind = 'product')),
    ADD CONSTRAINT promotion_banner_shape_ck CHECK (
        CASE WHEN kind = 'banner' THEN
            trigger IS NULL AND value_type IS NULL AND applies_to IS NULL
            AND percent_off IS NULL AND amount_off IS NULL AND max_discount_amount IS NULL
            AND bxgy_buy_qty IS NULL AND bxgy_get_qty IS NULL AND bxgy_max_per_order IS NULL
            AND audience = 'everyone' AND min_subtotal_amount = 0 AND min_quantity IS NULL
            AND max_uses IS NULL AND max_uses_per_customer IS NULL AND budget_amount IS NULL
            AND NOT combinable
        ELSE
            trigger IS NOT NULL AND value_type IS NOT NULL AND applies_to IS NOT NULL
        END),
    -- An offer's value rule, unchanged; a banner has no value.
    DROP CONSTRAINT promotion_value_chk,
    ADD CONSTRAINT promotion_value_chk CHECK (kind = 'banner'
        OR ((value_type = 'percent') AND (percent_off IS NOT NULL) AND (amount_off IS NULL))
        OR ((value_type = 'amount') AND (amount_off IS NOT NULL) AND (percent_off IS NULL) AND (max_discount_amount IS NULL))
        OR ((value_type = 'free') AND (percent_off IS NULL) AND (amount_off IS NULL) AND (max_discount_amount IS NULL)
            AND (kind = ANY (ARRAY['delivery', 'bxgy'])))),
    DROP CONSTRAINT promotion_applies_to_chk,
    ADD CONSTRAINT promotion_applies_to_chk CHECK (kind = 'banner'
        OR ((kind = ANY (ARRAY['cart', 'delivery'])) = (applies_to = 'cart')));

CREATE INDEX promotion_link_category_idx ON public.promotion (link_category_id) WHERE link_category_id IS NOT NULL;
CREATE INDEX promotion_link_product_idx ON public.promotion (link_product_id) WHERE link_product_id IS NOT NULL;

-- +goose Down
-- Only while no banner exists (the restored NOT NULLs and kind check refuse one, which is the point).
DROP INDEX public.promotion_link_product_idx;
DROP INDEX public.promotion_link_category_idx;
ALTER TABLE public.promotion
    DROP CONSTRAINT promotion_applies_to_chk,
    ADD CONSTRAINT promotion_applies_to_chk CHECK (((kind = ANY (ARRAY['cart', 'delivery'])) = (applies_to = 'cart'))),
    DROP CONSTRAINT promotion_value_chk,
    ADD CONSTRAINT promotion_value_chk CHECK ((((value_type = 'percent') AND (percent_off IS NOT NULL) AND (amount_off IS NULL))
        OR ((value_type = 'amount') AND (amount_off IS NOT NULL) AND (percent_off IS NULL) AND (max_discount_amount IS NULL))
        OR ((value_type = 'free') AND (percent_off IS NULL) AND (amount_off IS NULL) AND (max_discount_amount IS NULL)
            AND (kind = ANY (ARRAY['delivery', 'bxgy']))))),
    DROP CONSTRAINT promotion_banner_shape_ck,
    DROP CONSTRAINT promotion_link_ck,
    DROP CONSTRAINT promotion_link_kind_check,
    DROP COLUMN link_product_id,
    DROP COLUMN link_category_id,
    DROP COLUMN link_kind,
    ALTER COLUMN applies_to SET NOT NULL,
    ALTER COLUMN value_type SET NOT NULL,
    ALTER COLUMN trigger SET NOT NULL,
    DROP CONSTRAINT promotion_kind_check,
    ADD CONSTRAINT promotion_kind_check CHECK (kind = ANY (ARRAY['cart', 'item', 'bxgy', 'delivery']));
