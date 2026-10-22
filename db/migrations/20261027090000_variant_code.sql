-- +goose Up
-- 098 (amendment) — every variant gets a permanent Effy code: `V` + 6 characters, e.g. V7K3Q9M.
--
-- Why: a shop's own stock code (`sku`) is optional and means nothing outside that shop, and the
-- manufacturer's barcode (`gtin`) does not exist for loose or own-made items. Support, pick lists and
-- back-office need ONE short name for "this size of this product" that always exists. Shops keep `sku`
-- as their own optional code.
--
-- ⚠ A DATABASE DEFAULT, SO NO WRITER CAN FORGET IT (the 089 rule). `applyVariantSet` inserts without it.
-- ⚠ The `V` and the length keep it apart from package and bag codes (six characters, no prefix), so a
-- code typed into scan-to-find can never mean both. Same no-look-alike alphabet as package-code.ts,
-- pinned by `variant-code.test.ts`. Never changed, never reused (a removed variant keeps its code).

-- +goose StatementBegin
CREATE FUNCTION public.new_variant_code() RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
    candidate text;
BEGIN
    LOOP
        candidate := 'V';
        FOR i IN 1..6 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        IF NOT EXISTS (SELECT 1 FROM public.product_variant WHERE code = candidate) THEN
            RETURN candidate;
        END IF;
    END LOOP;
END
$$;
-- +goose StatementEnd

ALTER TABLE public.product_variant ADD COLUMN code text;

-- Every variant that already exists gets its code now. ⚠ ONE ROW PER STATEMENT: within one multi-row
-- UPDATE the function's uniqueness check cannot see codes given to earlier rows of the same statement.
-- +goose StatementBegin
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id FROM public.product_variant LOOP
        UPDATE public.product_variant SET code = public.new_variant_code() WHERE id = r.id;
    END LOOP;
END
$$;
-- +goose StatementEnd

ALTER TABLE public.product_variant
    ALTER COLUMN code SET NOT NULL,
    ALTER COLUMN code SET DEFAULT public.new_variant_code(),
    ADD CONSTRAINT product_variant_code_uq UNIQUE (code),
    ADD CONSTRAINT product_variant_code_check CHECK (code ~ '^V[2-9A-HJKMNP-TV-Z]{6}$');

COMMENT ON COLUMN public.product_variant.code IS
    '098 — Effy''s permanent code for this variant (V + 6). Generated; never edited or reused. `sku` is the shop''s own.';

-- The order line keeps the code it was sold under, beside its label, sku and gtin snapshots.
ALTER TABLE public.order_item ADD COLUMN variant_code text;

COMMENT ON COLUMN public.order_item.variant_code IS
    '098 — the variant''s Effy code as sold (snapshot, written by checkout).';

-- +goose Down
ALTER TABLE public.order_item DROP COLUMN variant_code;
ALTER TABLE public.product_variant
    DROP CONSTRAINT product_variant_code_check,
    DROP CONSTRAINT product_variant_code_uq,
    DROP COLUMN code;
DROP FUNCTION public.new_variant_code();
