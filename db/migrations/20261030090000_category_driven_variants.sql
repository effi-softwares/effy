-- 105 Variants only from category attributes (specs/105-category-driven-variants).
--
-- • A product's options are exactly the library attributes its category offers as variant options. The platform's
--   own option, "Pack size" (product_option.kind = 'pack_size', its values the variants' pack sizes), is gone:
--   `kind` is dropped, every option names an attribute, every option value names one of its values.
-- • A variant's pack_quantity / pack_unit stay — its net quantity, read only for unit pricing — and unit pricing
--   covers household goods too: pack units m, m2 and sheets; bases per 10 g, per 10 mL, per metre, per square
--   metre and per 100 sheets.
-- • The seeded clothing "Size" attribute (101's `clothing_size`, XXS–4XL) is removed with its values and the
--   categories' attachments to it.
--
-- Dev data first (research R2): products that use Pack size or clothing Size are deleted, with the cart lines,
-- saved lines and promotion targets that refuse their deletion. A product an order line names cannot be deleted
-- (order history is kept), so it is kept with its first variant only — the others are removed as when a shop
-- stops selling a variant — and no options. Order lines keep their own variant_label copy.
--
-- One-way: fix forward.

-- +goose Up
-- +goose StatementBegin
DO $$
DECLARE
    clothing uuid := (SELECT id FROM public.attribute_definition WHERE key = 'clothing_size');
    kept_names text;
    bad uuid;
BEGIN
    -- ── 1. Which products are affected, and which of them must be kept ─────────────────────────────────
    CREATE TEMP TABLE m105_affected ON COMMIT DROP AS
    SELECT p.id,
           EXISTS (SELECT 1 FROM public.order_item oi WHERE oi.product_id = p.id) AS has_orders,
           EXISTS (SELECT 1 FROM public.product_option o
                    WHERE o.product_id = p.id AND (o.kind = 'pack_size' OR o.attribute_id = clothing)) AS has_option
      FROM public.product p
     WHERE EXISTS (SELECT 1 FROM public.product_option o
                    WHERE o.product_id = p.id AND (o.kind = 'pack_size' OR o.attribute_id = clothing))
        OR EXISTS (SELECT 1 FROM public.product_attribute_value pav
                    WHERE pav.product_id = p.id AND pav.attribute_definition_id = clothing);

    -- ── 2. Delete the products nobody has ordered ──────────────────────────────────────────────────────
    DELETE FROM public.cart_item c USING m105_affected a WHERE c.product_id = a.id AND NOT a.has_orders;
    DELETE FROM public.cart_saved_item c USING m105_affected a WHERE c.product_id = a.id AND NOT a.has_orders;
    DELETE FROM public.promotion_target t USING m105_affected a WHERE t.product_id = a.id AND NOT a.has_orders;
    DELETE FROM public.product p USING m105_affected a WHERE p.id = a.id AND NOT a.has_orders;

    -- ── 3. Keep ordered products with one variant and no options ───────────────────────────────────────
    -- The variant that stays: the lowest position among those not already removed.
    UPDATE public.product_variant v
       SET state = 'removed', removed_at = now()
      FROM m105_affected a
     WHERE v.product_id = a.id AND a.has_orders AND a.has_option
       AND v.state <> 'removed'
       AND v.id <> (SELECT x.id FROM public.product_variant x
                     WHERE x.product_id = a.id AND x.state <> 'removed'
                     ORDER BY x.position LIMIT 1);
    -- Values cascade; the variants' option value ids are set null.
    DELETE FROM public.product_option o USING m105_affected a
     WHERE o.product_id = a.id AND a.has_orders AND a.has_option;
    DELETE FROM public.product_change c USING m105_affected a WHERE c.product_id = a.id AND a.has_orders;

    -- The listing summary, as @effy/edge-shared/catalog/listing.ts refreshListing writes it.
    UPDATE public.product p
       SET list_price_amount      = s.min_price,
           list_compare_at_amount = s.min_was,
           price_varies           = COALESCE(s.varies, false)
      FROM m105_affected a
      LEFT JOIN LATERAL (
           SELECT v.price_amount AS min_price,
                  v.compare_at_amount AS min_was,
                  (SELECT count(DISTINCT x.price_amount) > 1
                     FROM public.product_variant x
                    WHERE x.product_id = a.id AND x.state = 'active') AS varies
             FROM public.product_variant v
            WHERE v.product_id = a.id AND v.state = 'active' AND v.price_amount IS NOT NULL
            ORDER BY v.price_amount, v.position
            LIMIT 1
      ) s ON true
     WHERE p.id = a.id AND a.has_orders;

    SELECT p.id INTO bad
      FROM public.product p JOIN m105_affected a ON a.id = p.id AND a.has_orders
     WHERE (SELECT count(*) FROM public.product_variant v WHERE v.product_id = p.id AND v.state <> 'removed') > 1
     LIMIT 1;
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION '105: product % still has more than one variant after its options were removed', bad;
    END IF;

    SELECT string_agg(p.name || ' (' || p.id || ')', ', ') INTO kept_names
      FROM public.product p JOIN m105_affected a ON a.id = p.id AND a.has_orders AND a.has_option;
    IF kept_names IS NOT NULL THEN
        RAISE NOTICE '105: kept with one variant (they have orders): %', kept_names;
    END IF;

    -- ── 4. Pending edits that name the old option or the attribute ─────────────────────────────────────
    DELETE FROM public.product_change
     WHERE proposed::text LIKE '%"pack_size"%'
        OR (clothing IS NOT NULL AND proposed::text LIKE '%' || clothing::text || '%');

    -- ── 5. clothing Size leaves the library ───────────────────────────────────────────────────────────
    IF clothing IS NOT NULL THEN
        DELETE FROM public.product_attribute_value WHERE attribute_definition_id = clothing;
        DELETE FROM public.category_attribute WHERE attribute_id = clothing;
        DELETE FROM public.attribute_definition WHERE id = clothing;  -- its allowed values cascade
    END IF;
END
$$;
-- +goose StatementEnd

-- ── 6. Every option names a category attribute ───────────────────────────────────────────────────────
DROP INDEX public.product_option_pack_size_uq;
ALTER TABLE public.product_option
    DROP CONSTRAINT product_option_attribute_check,
    DROP CONSTRAINT product_option_kind_check,
    DROP COLUMN kind,
    ALTER COLUMN attribute_id SET NOT NULL;
ALTER TABLE public.product_option_value
    ALTER COLUMN allowed_value_id SET NOT NULL;

-- ── 6b. Unit pricing for every kind of product (the values of @effy/shared-types UNIT_BASES / PACK_UNITS) ────
ALTER TABLE public.product
    DROP CONSTRAINT product_unit_basis_check,
    ADD CONSTRAINT product_unit_basis_check CHECK (unit_basis IS NULL OR unit_basis = ANY (ARRAY[
        'per_10g', 'per_100g', 'per_kg', 'per_10ml', 'per_100ml', 'per_l', 'per_m', 'per_m2', 'per_100_sheets', 'each']));
ALTER TABLE public.product_variant
    DROP CONSTRAINT product_variant_pack_unit_check,
    ADD CONSTRAINT product_variant_pack_unit_check CHECK (pack_unit IS NULL OR pack_unit = ANY (ARRAY[
        'g', 'kg', 'ml', 'l', 'm', 'm2', 'sheets', 'each']));

-- ── 7. The categories' forms no longer carry clothing Size ───────────────────────────────────────────
SELECT public.rebuild_category_derived();

-- +goose Down
SELECT 1; -- irreversible: fix forward (105)
