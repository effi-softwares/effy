-- +goose Up
-- 098-product-variants — the VARIANT becomes the thing that is bought, priced and counted.
--
-- Until now a product was exactly one sellable thing: one price, one stock code, one barcode, one
-- count, one weight. A shop selling rice in 500 g and 1 kg had to list two unrelated products. From
-- here a product holds what is SHARED (name, descriptions, brand, category, type, attributes,
-- gallery, GST status, approval, margin) and its variants — one per combination of up to two options
-- such as Size and Flavour — carry what differs. Spec: specs/098-product-variants/spec.md. Data
-- model: ../data-model.md. Decisions R1–R18: ../research.md.
--
-- ⚠ THIS MIGRATION DROPS COLUMNS FROM `public.product` AND DOES NOT BACKFILL (R14). The operator
-- reset the catalogue to start fresh ("clean up the db to start fresh"), so the old price, code,
-- weight and stock columns are removed outright rather than kept beside their new home. Two places
-- holding one fact is the shape this repo has shipped defects through; and a reader that was missed
-- now fails LOUDLY (column does not exist) instead of quietly showing a stale price.
--
-- ⚠ IT THEREFORE REFUSES TO RUN ON A DATABASE THAT HAS A CATALOGUE, ORDERS OR CARTS (section 0).
-- It never deletes business data itself, so it is safe in any environment: a fresh environment runs
-- it untouched; dev runs `db/reset/098_purge_catalogue_dev.sql` first (operator, dev only).
--
-- Sections:
--   0. the empty-catalogue guard
--   1. product — what moves off it, what it gains
--   2. product_option, product_option_value, product_variant
--   3. the tables that name a product now name a variant too (composite FKs)
--   4. the 058 Today trigger follows the stock to the variant
--
-- House style: raw SQL, text CHECK enums, an index on every FK, COMMENT ON everything, no triggers
-- for business rules.

-- ── 0. The guard ─────────────────────────────────────────────────────────────────────────────────

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.product)
       OR EXISTS (SELECT 1 FROM public."order")
       OR EXISTS (SELECT 1 FROM public.cart_item)
       OR EXISTS (SELECT 1 FROM public.cart_saved_item) THEN
        RAISE EXCEPTION '098 needs an empty catalogue (no products, orders or cart lines). In dev, run db/reset/098_purge_catalogue_dev.sql first. Never in production.';
    END IF;
END
$$;
-- +goose StatementEnd

-- ── 1. product — what moves off it, what it gains (first: the new tables below re-use the names) ───────────────────────────────────────────────

-- ⚠ The 058 trigger names three of the columns below, so it goes first (re-created in section 4).
DROP TRIGGER shop_ops_product_upd ON public.product;

-- ⚠ Dropping a column drops every index and CHECK that names it: product_shop_sku_uq,
-- product_low_stock_idx, product_shop_price_idx, product_search_trgm_idx (it named sku) and the
-- price/stock/weight CHECKs go with their columns.
ALTER TABLE public.product
    DROP COLUMN sku,
    DROP COLUMN gtin,
    DROP COLUMN price_amount,
    DROP COLUMN compare_at_amount,
    DROP COLUMN shop_price_amount,
    DROP COLUMN shop_compare_at_amount,
    DROP COLUMN weight_grams,
    DROP COLUMN weight_is_assumed,
    DROP COLUMN stock_tracked,
    DROP COLUMN stock_on_hand,
    DROP COLUMN low_stock_threshold;

ALTER TABLE public.product
    ADD COLUMN unit_basis             text CHECK (unit_basis IS NULL OR unit_basis IN ('per_100g', 'per_kg', 'per_100ml', 'per_l', 'each')),
    ADD COLUMN list_price_amount      numeric(12, 2) CHECK (list_price_amount IS NULL OR list_price_amount >= 0),
    ADD COLUMN list_compare_at_amount numeric(12, 2) CHECK (list_compare_at_amount IS NULL OR list_compare_at_amount >= 0),
    ADD COLUMN price_varies           boolean NOT NULL DEFAULT false;

-- The trigram search, rebuilt without the stock code: a code is matched EXACTLY against the
-- variants (R13), never fuzzily.
CREATE INDEX product_search_trgm_idx ON public.product
    USING gin ((lower(name || ' ' || coalesce(brand, '') || ' ' || short_description)) gin_trgm_ops);
-- The price sort/filter keyset (R4) — what product_shop_price_idx was.
CREATE INDEX product_list_price_idx ON public.product (status, list_price_amount, id);

COMMENT ON COLUMN public.product.unit_basis IS
    'How this product''s sizes are compared (098, R12): per_100g, per_kg, per_100ml, per_l or each. One basis per product so every variant compares in the same unit. NULL = no unit price shown.';
COMMENT ON COLUMN public.product.list_price_amount IS
    'The listing price (R4): the lowest CUSTOMER price among ACTIVE variants. ⚠ A SUMMARY written ONLY by refreshListing (@effy/edge-shared/catalog/listing.ts) in the same transaction as any change to a variant''s price or state. Active, not in-stock (spec FR-013): selling out never moves it, so a paid order never writes it.';
COMMENT ON COLUMN public.product.list_compare_at_amount IS
    'The "was" price of the variant list_price_amount came from. Summary; refreshListing only.';
COMMENT ON COLUMN public.product.price_varies IS
    'true when active variants'' customer prices differ — the storefront says "From". Summary; refreshListing only.';

-- ── 2. Options, values and variants ─────────────────────────────────────────────────────────────

-- A variant names value IDS, not text (R1): renaming "1kg" to "1 kg" renames it on every variant at
-- once, and "no two variants with the same combination" is the database's rule, not a service's.

ALTER TABLE public.product ADD CONSTRAINT product_id_shop_uq UNIQUE (id, shop_id);

CREATE TABLE public.product_option (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
    position    smallint NOT NULL CHECK (position IN (1, 2)),
    name        text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 40),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_option_position_uq UNIQUE (product_id, position) DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT product_option_id_product_uq UNIQUE (id, product_id)
);
CREATE UNIQUE INDEX product_option_name_uq ON public.product_option (product_id, lower(name));

COMMENT ON TABLE public.product_option IS
    'A dimension a product varies by — "Size", "Flavour" (098). At most two per product (position 1 or 2). Written ONLY by applyVariantSet in @effy/edge-shared/catalog.';
COMMENT ON COLUMN public.product_option.position IS
    'Which option this is (1 or 2). A variant''s option1_value_id names a value of the position-1 option, option2_value_id of the position-2 option. A label is the values in this order.';

CREATE TABLE public.product_option_value (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_id   uuid NOT NULL REFERENCES public.product_option (id) ON DELETE CASCADE,
    value       text NOT NULL CHECK (value = btrim(value) AND char_length(value) BETWEEN 1 AND 40),
    position    smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
    created_at  timestamptz NOT NULL DEFAULT now(),
    -- Deferrable so a reorder can swap two positions inside one transaction.
    CONSTRAINT product_option_value_position_uq UNIQUE (option_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE UNIQUE INDEX product_option_value_uq ON public.product_option_value (option_id, lower(value));

COMMENT ON TABLE public.product_option_value IS
    'One choice within an option — "1 kg", "Spiced" (098). At most 20 per option, in the shop''s order (position). Written ONLY by applyVariantSet.';

CREATE TABLE public.product_variant (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id             uuid NOT NULL,
    shop_id                uuid NOT NULL,
    -- SET NULL: the writer deletes a value only when no LIVE variant names it, so this fires only for
    -- REMOVED variants (kept for history), which then simply lose a value no product offers any more.
    option1_value_id       uuid REFERENCES public.product_option_value (id) ON DELETE SET NULL,
    option2_value_id       uuid REFERENCES public.product_option_value (id) ON DELETE SET NULL,
    position               smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 49),
    sku                    text CHECK (sku IS NULL OR (sku = btrim(sku) AND sku <> '')),
    gtin                   text CHECK (gtin IS NULL OR (gtin = btrim(gtin) AND gtin <> '')),
    shop_price_amount      numeric(12, 2) NOT NULL CHECK (shop_price_amount >= 0),
    shop_compare_at_amount numeric(12, 2) CHECK (shop_compare_at_amount IS NULL OR shop_compare_at_amount >= 0),
    price_amount           numeric(12, 2) CHECK (price_amount IS NULL OR price_amount >= 0),
    compare_at_amount      numeric(12, 2) CHECK (compare_at_amount IS NULL OR compare_at_amount >= 0),
    weight_grams           int NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
    weight_is_assumed      boolean NOT NULL DEFAULT true,
    pack_quantity          numeric(10, 3) CHECK (pack_quantity IS NULL OR pack_quantity > 0),
    pack_unit              text CHECK (pack_unit IS NULL OR pack_unit IN ('g', 'kg', 'ml', 'l', 'each')),
    media_id               uuid REFERENCES public.product_media (id) ON DELETE SET NULL,
    stock_tracked          boolean NOT NULL DEFAULT false,
    stock_on_hand          int CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0),
    low_stock_threshold    int CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
    state                  text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'inactive', 'removed')),
    removed_at             timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT product_variant_product_fk FOREIGN KEY (product_id, shop_id)
        REFERENCES public.product (id, shop_id) ON DELETE CASCADE,
    -- ⚠ The target of every referencing table's composite FK (R3): a cart line, an order line or a
    -- stock movement can never name a variant of a different product than the one it names.
    CONSTRAINT product_variant_id_product_uq UNIQUE (id, product_id),
    CONSTRAINT product_variant_pack_pair_ck CHECK ((pack_quantity IS NULL) = (pack_unit IS NULL)),
    -- 054's FR-003, moved: "tracked with no count" is unrepresentable.
    CONSTRAINT product_variant_tracked_needs_count_ck CHECK (NOT stock_tracked OR stock_on_hand IS NOT NULL),
    CONSTRAINT product_variant_removed_at_ck CHECK ((state = 'removed') = (removed_at IS NOT NULL))
);

-- FR-003, among variants that are not removed. NULLS NOT DISTINCT makes the option-less variant (both
-- NULL) unique too: a product with no options has exactly one (R2). Removed variants are left out so a
-- shop can bring a combination back as a new variant.
CREATE UNIQUE INDEX product_variant_combination_uq ON public.product_variant (product_id, option1_value_id, option2_value_id)
    NULLS NOT DISTINCT WHERE state <> 'removed';

-- A removed variant frees its stock code, so a shop can reuse it on the product that replaced it.
CREATE UNIQUE INDEX product_variant_shop_sku_uq ON public.product_variant (shop_id, lower(sku))
    WHERE sku IS NOT NULL AND state <> 'removed';
CREATE INDEX product_variant_product_idx ON public.product_variant (product_id, position);
CREATE INDEX product_variant_shop_idx ON public.product_variant (shop_id);
-- The availability EXISTS (R5) — the one per-row probe every listing makes.
CREATE INDEX product_variant_active_idx ON public.product_variant (product_id) WHERE state = 'active';
-- 054's restock-list index, moved with the stock.
CREATE INDEX product_variant_low_stock_idx ON public.product_variant (shop_id, stock_on_hand) WHERE stock_tracked;
CREATE INDEX product_variant_gtin_idx ON public.product_variant (gtin) WHERE gtin IS NOT NULL;
CREATE INDEX product_variant_option1_idx ON public.product_variant (option1_value_id);
CREATE INDEX product_variant_option2_idx ON public.product_variant (option2_value_id);
CREATE INDEX product_variant_media_idx ON public.product_variant (media_id);

COMMENT ON TABLE public.product_variant IS
    'The thing a shopper buys (098): one combination of a product''s option values, with its own codes, prices, stock, weight and pack size. Every product has at least one; a product with no options has exactly one (both value ids NULL). Options, values and the non-stock columns are written ONLY by applyVariantSet / priceVariants / the state route; stock columns by the four 054 stock writers.';
COMMENT ON COLUMN public.product_variant.shop_id IS
    'The owning shop, denormalised from the product and held equal to it by the composite FK — so the stock code can be unique per shop without a join.';
COMMENT ON COLUMN public.product_variant.shop_price_amount IS
    'What the shop is paid per unit (067''s shop price, per variant). Required.';
COMMENT ON COLUMN public.product_variant.price_amount IS
    'What the CUSTOMER pays: shop price + the PRODUCT''s margin (R7), written at approval and on a margin change. NULL until the product is first approved — a never-approved product is a draft and is never sold.';
COMMENT ON COLUMN public.product_variant.compare_at_amount IS
    'The customer-facing "was" price, with the same margin applied as price_amount (067 FR-035).';
COMMENT ON COLUMN public.product_variant.weight_grams IS
    'Shipping weight (032), per variant — the delivery fee''s basket weight and the planner''s van load read this.';
COMMENT ON COLUMN public.product_variant.pack_quantity IS
    'How much is in the pack, in pack_unit (098 unit pricing, R12). With the product''s unit_basis it gives the comparison price ("$0.64 / 100 g").';
COMMENT ON COLUMN public.product_variant.media_id IS
    'This variant''s own picture — one of its product''s gallery pictures — or NULL to show the gallery.';
COMMENT ON COLUMN public.product_variant.stock_on_hand IS
    '054''s count, now per variant. ⚠ NEVER written without a public.stock_movement row in the same transaction, and NEVER touches updated_at.';
COMMENT ON COLUMN public.product_variant.state IS
    'active = sold; inactive = not sold, hidden from shoppers, shown to the shop; removed = gone from the shop''s grid too, kept for order and stock history (R8). active⇄inactive and →removed are immediate (never wait on review).';

-- ── 3. What names a product now names a variant too (R3) ────────────────────────────────────────

-- Every table keeps its product_id (≈45 queries join on it for name, category, brand, shop and
-- promotion targeting) and adds variant_id, tied to it by a composite FK so the pair cannot disagree.

ALTER TABLE public.cart_item
    ADD COLUMN variant_id uuid NOT NULL,
    ADD CONSTRAINT cart_item_variant_fk FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variant (id, product_id) ON DELETE RESTRICT,
    DROP CONSTRAINT cart_item_cart_id_product_id_key,
    ADD CONSTRAINT cart_item_cart_variant_uq UNIQUE (cart_id, variant_id);
CREATE INDEX cart_item_variant_idx ON public.cart_item (variant_id);
COMMENT ON COLUMN public.cart_item.variant_id IS 'The variant this line buys (098). Two sizes of one product are two lines.';

ALTER TABLE public.cart_saved_item
    ADD COLUMN variant_id uuid NOT NULL,
    ADD CONSTRAINT cart_saved_item_variant_fk FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variant (id, product_id) ON DELETE RESTRICT,
    DROP CONSTRAINT cart_saved_item_cart_id_product_id_key,
    ADD CONSTRAINT cart_saved_item_cart_variant_uq UNIQUE (cart_id, variant_id);
CREATE INDEX cart_saved_item_variant_idx ON public.cart_saved_item (variant_id);
COMMENT ON COLUMN public.cart_saved_item.variant_id IS 'The variant set aside (098).';

ALTER TABLE public.order_item
    ADD COLUMN variant_id    uuid NOT NULL,
    ADD COLUMN variant_label text CHECK (variant_label IS NULL OR variant_label <> ''),
    ADD COLUMN sku           text,
    ADD COLUMN gtin          text,
    ADD CONSTRAINT order_item_variant_fk FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variant (id, product_id) ON DELETE RESTRICT,
    ADD CONSTRAINT order_item_order_variant_uq UNIQUE (order_id, variant_id);
CREATE INDEX order_item_variant_idx ON public.order_item (variant_id);
COMMENT ON COLUMN public.order_item.variant_label IS
    'The variant''s label AS SOLD ("Spiced / 500 g"), NULL for a product with no options (098, R9). A SNAPSHOT like product_name: renaming an option value never rewrites a receipt.';
COMMENT ON COLUMN public.order_item.sku IS 'The variant''s stock code as sold — what a picker reads (snapshot).';
COMMENT ON COLUMN public.order_item.gtin IS 'The variant''s barcode as sold (snapshot, FR-022).';

ALTER TABLE public.stock_movement
    ADD COLUMN variant_id uuid NOT NULL,
    ADD CONSTRAINT stock_movement_variant_fk FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variant (id, product_id) ON DELETE CASCADE;
CREATE INDEX stock_movement_variant_idx ON public.stock_movement (variant_id, created_at DESC);
COMMENT ON COLUMN public.stock_movement.variant_id IS 'The variant whose count moved (098). A product''s count no longer exists; each variant''s is explicable from these rows.';

-- The heart and lists stay ONE PER PRODUCT and remember a choice (R11, FR-015a). SET NULL on the
-- variant column only: losing the choice must never lose the saved product.
ALTER TABLE public.customer_saved_item
    ADD COLUMN variant_id uuid,
    ADD CONSTRAINT customer_saved_item_variant_fk FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variant (id, product_id) ON DELETE SET NULL (variant_id);
CREATE INDEX customer_saved_item_variant_idx ON public.customer_saved_item (variant_id);
COMMENT ON COLUMN public.customer_saved_item.variant_id IS
    'The variant the shopper had selected when saving (098). NULL = none remembered; adding to the cart then asks the shopper to choose.';

-- ⚠ customer_list_entry gets NO variant column: an entry references the saved item
-- (customer_list_entry_saved_fk → customer_saved_item), so the one remembered choice above serves the
-- heart and every list the product is in.

-- ── 4. The Today trigger follows the stock (058) ────────────────────────────────────────────────

-- shop_ops_product_changed() reads NEW.shop_id only, and a variant carries shop_id, so the same
-- function serves both. The product keeps a trigger for status (a product taken off sale changes
-- the attention list); the variant's fires for its stock and its state.
CREATE TRIGGER shop_ops_product_upd
    AFTER UPDATE OF status ON public.product
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_product_changed();
CREATE TRIGGER shop_ops_variant_upd
    AFTER UPDATE OF stock_on_hand, low_stock_threshold, stock_tracked, state ON public.product_variant
    FOR EACH ROW EXECUTE FUNCTION public.shop_ops_product_changed();

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    RAISE EXCEPTION '098 is one-way: the product columns it dropped held no data to restore (the catalogue was reset). Restore from a snapshot instead.';
END
$$;
-- +goose StatementEnd
