-- 105 Unit pricing for every kind of product (specs/105-category-driven-variants, User Story 5).
--
-- Effy sells household goods as well as food, so a comparison price can be per metre (cling wrap, foil), per square
-- metre (wrapping paper) or per 100 sheets (toilet paper, tissues), and small packs per 10 g (spices) or per 10 mL
-- (perfume). The values are @effy/shared-types UNIT_BASES and PACK_UNITS; the pairing rule (a unit goes only with
-- bases of its own measure) lives there. Only widens two checks: every existing value stays valid.

-- +goose Up
ALTER TABLE public.product
    DROP CONSTRAINT product_unit_basis_check,
    ADD CONSTRAINT product_unit_basis_check CHECK (unit_basis IS NULL OR unit_basis = ANY (ARRAY[
        'per_10g', 'per_100g', 'per_kg', 'per_10ml', 'per_100ml', 'per_l', 'per_m', 'per_m2', 'per_100_sheets', 'each']));
ALTER TABLE public.product_variant
    DROP CONSTRAINT product_variant_pack_unit_check,
    ADD CONSTRAINT product_variant_pack_unit_check CHECK (pack_unit IS NULL OR pack_unit = ANY (ARRAY[
        'g', 'kg', 'ml', 'l', 'm', 'm2', 'sheets', 'each']));

-- +goose Down
-- Only safe while no product uses a new value; refuses otherwise (the check fails), which is the point.
ALTER TABLE public.product
    DROP CONSTRAINT product_unit_basis_check,
    ADD CONSTRAINT product_unit_basis_check CHECK (unit_basis IS NULL OR unit_basis = ANY (ARRAY[
        'per_100g', 'per_kg', 'per_100ml', 'per_l', 'each']));
ALTER TABLE public.product_variant
    DROP CONSTRAINT product_variant_pack_unit_check,
    ADD CONSTRAINT product_variant_pack_unit_check CHECK (pack_unit IS NULL OR pack_unit = ANY (ARRAY[
        'g', 'kg', 'ml', 'l', 'each']));
