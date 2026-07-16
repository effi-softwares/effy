-- +goose Up
-- 016-shop-product-catalog: the platform's first product tables.
--
-- A back-office-managed SCHEMA (product types, a reusable attribute library, a category taxonomy)
-- drives SHOP-OWNED products. Attributes are DATA, not columns (EAV) — addable without a
-- deployment (SC-001). Everything lives in `public` (operational, alongside public.shop); raw SQL,
-- text CHECK enums (no native PG enums, no triggers), an index on every FK, COMMENT ON everything.
-- See specs/016-shop-product-catalog/data-model.md.

-- pg_trgm powers the product `q` search (ILIKE over name/sku/brand/short_description) at 10k+/shop.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Schema authority (back-office-managed) ─────────────────────────────────────────────────────

CREATE TABLE public.product_type (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text NOT NULL UNIQUE,
    name        text NOT NULL,
    description text,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product_type IS 'Back-office product classification (016). Drives which attributes a product captures. Retired types hide from new-product creation; existing products keep their type.';
COMMENT ON COLUMN public.product_type.key IS 'Stable slug (e.g. prepared_food); the seed/ON CONFLICT key.';
COMMENT ON COLUMN public.product_type.status IS 'active | retired. Platform-owned; retiring never corrupts existing products.';

CREATE TABLE public.attribute_definition (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text NOT NULL UNIQUE,
    name        text NOT NULL,
    data_type   text NOT NULL CHECK (data_type IN ('short_text', 'long_text', 'number', 'boolean', 'single_select', 'multi_select')),
    unit        text,
    help_text   text,
    validation  jsonb,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.attribute_definition IS 'Reusable attribute in the back-office library (016). eBay "item-specifics" model. Retiring/deleting an in-use attribute is blocked (FR-006).';
COMMENT ON COLUMN public.attribute_definition.data_type IS 'Drives the form input + which product_attribute_value.value_* column is populated.';
COMMENT ON COLUMN public.attribute_definition.unit IS 'Optional display unit (e.g. g, ml, min).';
COMMENT ON COLUMN public.attribute_definition.validation IS 'Optional jsonb: {min?, max?, maxLength?}. Enforced in the service layer.';

CREATE TABLE public.attribute_allowed_value (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_definition_id uuid NOT NULL REFERENCES public.attribute_definition(id) ON DELETE CASCADE,
    value                   text NOT NULL,
    label                   text NOT NULL,
    display_order           int NOT NULL DEFAULT 0,
    UNIQUE (attribute_definition_id, value)
);
COMMENT ON TABLE public.attribute_allowed_value IS 'Options for single_select/multi_select attributes (016). Removing an in-use value is blocked (FR-006).';
CREATE INDEX attribute_allowed_value_attr_idx ON public.attribute_allowed_value (attribute_definition_id);

CREATE TABLE public.product_type_attribute (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_type_id         uuid NOT NULL REFERENCES public.product_type(id) ON DELETE CASCADE,
    attribute_definition_id uuid NOT NULL REFERENCES public.attribute_definition(id) ON DELETE RESTRICT,
    is_mandatory            boolean NOT NULL DEFAULT false,
    display_order           int NOT NULL DEFAULT 0,
    group_label             text,
    UNIQUE (product_type_id, attribute_definition_id)
);
COMMENT ON TABLE public.product_type_attribute IS 'Assigns an attribute to a product type with the per-type facts (016): mandatory?, form order, group.';
COMMENT ON COLUMN public.product_type_attribute.is_mandatory IS 'Platform-owned; drives required-field enforcement at product create/publish.';
COMMENT ON COLUMN public.product_type_attribute.group_label IS 'Optional; groups fields into form steps / detail sections.';
CREATE INDEX product_type_attribute_type_idx ON public.product_type_attribute (product_type_id);
CREATE INDEX product_type_attribute_attr_idx ON public.product_type_attribute (attribute_definition_id);

CREATE TABLE public.category (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id     uuid REFERENCES public.category(id) ON DELETE RESTRICT,
    key           text NOT NULL UNIQUE,
    name          text NOT NULL,
    display_order int NOT NULL DEFAULT 0,
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.category IS 'Back-office hierarchical taxonomy (016), shared across shops. parent_id NULL = top level. Retiring a category with active products is blocked (FR-006).';
CREATE INDEX category_parent_idx ON public.category (parent_id);

-- ── Product (shop-owned) ───────────────────────────────────────────────────────────────────────

CREATE TABLE public.product (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id             uuid NOT NULL REFERENCES public.shop(id) ON DELETE RESTRICT,
    product_type_id     uuid NOT NULL REFERENCES public.product_type(id) ON DELETE RESTRICT,
    primary_category_id uuid NOT NULL REFERENCES public.category(id) ON DELETE RESTRICT,
    name                text NOT NULL,
    sku                 text,
    gtin                text,
    brand               text,
    price_amount        numeric(12, 2) NOT NULL CHECK (price_amount >= 0),
    currency            char(3) NOT NULL DEFAULT 'AUD',
    compare_at_amount   numeric(12, 2) CHECK (compare_at_amount >= 0),
    short_description   text NOT NULL,
    long_description    text,
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'unavailable', 'archived')),
    created_by          text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product IS 'Shop-owned catalog item (016). One row per shop-authored product; shop_id is the ownership + isolation key (every shop query is scoped WHERE shop_id = actor). eBay seller-listing model.';
COMMENT ON COLUMN public.product.sku IS 'Optional; unique per shop WHEN present (partial unique index). Blank always allowed.';
COMMENT ON COLUMN public.product.gtin IS 'Optional barcode; NOT unique (a future cross-shop dedupe key).';
COMMENT ON COLUMN public.product.brand IS 'First-class searchable brand (FR-010a). Its SINGLE authority — brand is never a dynamic attribute.';
COMMENT ON COLUMN public.product.currency IS 'Platform-owned single currency (assumption). Defaults AUD.';
COMMENT ON COLUMN public.product.status IS 'draft | active | unavailable | archived (016). Platform-owned lifecycle. Archive is the default "remove"; hard delete only from an unreferenced draft.';
COMMENT ON COLUMN public.product.created_by IS 'The operator cognito_sub who created the product.';

CREATE INDEX product_shop_id_idx ON public.product (shop_id);
CREATE INDEX product_shop_status_idx ON public.product (shop_id, status);
CREATE INDEX product_shop_price_idx ON public.product (shop_id, price_amount);
CREATE INDEX product_shop_created_idx ON public.product (shop_id, created_at DESC);
CREATE INDEX product_type_id_idx ON public.product (product_type_id);
CREATE INDEX product_primary_category_id_idx ON public.product (primary_category_id);
-- SKU unique per shop, only when present (eBay seller-key model, R6).
CREATE UNIQUE INDEX product_shop_sku_uq ON public.product (shop_id, sku) WHERE sku IS NOT NULL;
-- Free-text `q` search: trigram GIN over the searchable fields (name/sku/brand/short_description),
-- for sub-second ILIKE '%q%' at 10k+ products/shop (SC-004, research R7). The expression is
-- immutable (lower/concat/coalesce), so it can be indexed directly.
CREATE INDEX product_search_trgm_idx ON public.product
    USING gin ((lower(name || ' ' || coalesce(sku, '') || ' ' || coalesce(brand, '') || ' ' || short_description)) gin_trgm_ops);

CREATE TABLE public.product_attribute_value (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id              uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
    attribute_definition_id uuid NOT NULL REFERENCES public.attribute_definition(id) ON DELETE RESTRICT,
    value_text              text,
    value_number            numeric,
    value_boolean           boolean,
    value_options           text[],
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, attribute_definition_id),
    -- At least one value column must be populated (the service enforces which one matches data_type).
    CHECK (value_text IS NOT NULL OR value_number IS NOT NULL OR value_boolean IS NOT NULL OR value_options IS NOT NULL)
);
COMMENT ON TABLE public.product_attribute_value IS 'EAV: one typed value row per (product, attribute) (016). Exactly one value_* column populated per the attribute data_type (service-enforced).';
CREATE INDEX product_attribute_value_product_idx ON public.product_attribute_value (product_id);
CREATE INDEX product_attribute_value_attr_idx ON public.product_attribute_value (attribute_definition_id);

CREATE TABLE public.product_media (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
    storage_key   text NOT NULL,
    is_primary    boolean NOT NULL DEFAULT false,
    display_order int NOT NULL DEFAULT 0,
    alt_text      text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product_media IS 'Product images (016). storage_key is the private S3 object key; reads go through short-lived presigned GET urls. Exactly one primary per product.';
CREATE INDEX product_media_product_idx ON public.product_media (product_id);
-- At most one primary image per product.
CREATE UNIQUE INDEX product_media_primary_uq ON public.product_media (product_id) WHERE is_primary;

CREATE TABLE public.shop_section (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       uuid NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE,
    name          text NOT NULL,
    display_order int NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, name)
);
COMMENT ON TABLE public.shop_section IS 'Shop-local grouping (016), Uber-Eats-style menu section. Free organization without polluting the shared taxonomy.';
CREATE INDEX shop_section_shop_idx ON public.shop_section (shop_id);

CREATE TABLE public.product_section (
    product_id      uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
    shop_section_id uuid NOT NULL REFERENCES public.shop_section(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, shop_section_id)
);
COMMENT ON TABLE public.product_section IS 'M:N product ↔ shop_section (016). A product may sit in several sections (like an Uber Eats item in multiple menu sections).';
CREATE INDEX product_section_section_idx ON public.product_section (shop_section_id);

-- ── admin.audit_log (existing, 009) — new schema-mutation actions ────────────────────────────────
-- target_type is a free text column (no CHECK), so it already accepts the new values
-- (product_type, attribute_definition, category). No table alteration needed (T012 verified).

-- ── Starter seed (back-office-editable; ON CONFLICT DO NOTHING) ──────────────────────────────────
-- Makes the feature usable day one while remaining fully editable (SC-001). NO `brand` attribute:
-- brand's single authority is product.brand (F1 / FR-010a).

INSERT INTO public.product_type (key, name, description) VALUES
    ('prepared_food',    'Prepared Food',    'Ready-to-eat meals and dishes'),
    ('packaged_grocery', 'Packaged Grocery', 'Shelf-stable and chilled packaged goods'),
    ('beverage',         'Beverage',         'Drinks — soft, hot, and others'),
    ('household',        'Household',         'Non-food household products')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.attribute_definition (key, name, data_type, unit, help_text) VALUES
    ('dietary_labels',    'Dietary Labels',    'multi_select',  NULL,  'Applicable dietary labels'),
    ('allergens',         'Allergens',         'multi_select',  NULL,  'Declared allergens'),
    ('spice_level',       'Spice Level',       'single_select', NULL,  'Heat level'),
    ('prep_time',         'Prep Time',         'number',        'min', 'Preparation time in minutes'),
    ('net_weight',        'Net Weight',        'number',        'g',   'Net weight in grams'),
    ('net_volume',        'Net Volume',        'number',        'ml',  'Net volume in millilitres'),
    ('storage',           'Storage',           'single_select', NULL,  'Storage requirement'),
    ('country_of_origin', 'Country of Origin', 'short_text',    NULL,  'Country of origin'),
    ('ingredients',       'Ingredients',       'long_text',     NULL,  'Full ingredient list'),
    ('material',          'Material',          'short_text',    NULL,  'Primary material'),
    ('dimensions',        'Dimensions',        'short_text',    NULL,  'Product dimensions')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.attribute_allowed_value (attribute_definition_id, value, label, display_order)
SELECT ad.id, v.value, v.label, v.ord
FROM public.attribute_definition ad
JOIN (VALUES
    ('dietary_labels', 'vegetarian',  'Vegetarian',  0),
    ('dietary_labels', 'vegan',       'Vegan',       1),
    ('dietary_labels', 'gluten_free', 'Gluten Free', 2),
    ('dietary_labels', 'halal',       'Halal',       3),
    ('dietary_labels', 'kosher',      'Kosher',      4),
    ('allergens',      'milk',        'Milk',        0),
    ('allergens',      'eggs',        'Eggs',        1),
    ('allergens',      'peanuts',     'Peanuts',     2),
    ('allergens',      'tree_nuts',   'Tree Nuts',   3),
    ('allergens',      'soy',         'Soy',         4),
    ('allergens',      'wheat',       'Wheat',       5),
    ('allergens',      'fish',        'Fish',        6),
    ('allergens',      'shellfish',   'Shellfish',   7),
    ('spice_level',    'none',        'None',        0),
    ('spice_level',    'mild',        'Mild',        1),
    ('spice_level',    'medium',      'Medium',      2),
    ('spice_level',    'hot',         'Hot',         3),
    ('spice_level',    'extra_hot',   'Extra Hot',   4),
    ('storage',        'ambient',     'Ambient',     0),
    ('storage',        'chilled',     'Chilled',     1),
    ('storage',        'frozen',      'Frozen',      2)
) AS v(attr_key, value, label, ord) ON v.attr_key = ad.key
ON CONFLICT (attribute_definition_id, value) DO NOTHING;

-- Type ↔ attribute assignments (drives each type's step form).
INSERT INTO public.product_type_attribute (product_type_id, attribute_definition_id, is_mandatory, display_order, group_label)
SELECT pt.id, ad.id, a.mandatory, a.ord, a.grp
FROM public.product_type pt
JOIN (VALUES
    ('prepared_food',    'dietary_labels',    false, 0, 'Dietary'),
    ('prepared_food',    'allergens',         true,  1, 'Dietary'),
    ('prepared_food',    'spice_level',       false, 2, 'Dietary'),
    ('prepared_food',    'prep_time',         false, 3, 'Preparation'),
    ('prepared_food',    'ingredients',       false, 4, 'Details'),
    ('packaged_grocery', 'net_weight',        true,  0, 'Physical'),
    ('packaged_grocery', 'storage',           true,  1, 'Storage'),
    ('packaged_grocery', 'country_of_origin', false, 2, 'Details'),
    ('packaged_grocery', 'allergens',         false, 3, 'Dietary'),
    ('packaged_grocery', 'ingredients',       false, 4, 'Details'),
    ('beverage',         'net_volume',        true,  0, 'Physical'),
    ('beverage',         'storage',           false, 1, 'Storage'),
    ('beverage',         'country_of_origin', false, 2, 'Details'),
    ('household',        'material',          false, 0, 'Physical'),
    ('household',        'dimensions',        false, 1, 'Physical')
) AS a(type_key, attr_key, mandatory, ord, grp) ON a.type_key = pt.key
JOIN public.attribute_definition ad ON ad.key = a.attr_key
ON CONFLICT (product_type_id, attribute_definition_id) DO NOTHING;

-- Category taxonomy: top level then children (parents first so the self-FK resolves).
INSERT INTO public.category (key, name, display_order) VALUES
    ('food',      'Food',      0),
    ('grocery',   'Grocery',   1),
    ('household', 'Household', 2)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.category (parent_id, key, name, display_order)
SELECT p.id, c.key, c.name, c.ord
FROM public.category p
JOIN (VALUES
    ('food',      'meals',       'Meals',       0),
    ('food',      'bakery',      'Bakery',      1),
    ('food',      'snacks',      'Snacks',      2),
    ('grocery',   'pantry',      'Pantry',      0),
    ('grocery',   'chilled',     'Chilled',     1),
    ('grocery',   'frozen',      'Frozen',      2),
    ('grocery',   'beverages',   'Beverages',   3),
    ('household', 'cleaning',    'Cleaning',    0),
    ('household', 'paper_goods', 'Paper Goods', 1)
) AS c(parent_key, key, name, ord) ON c.parent_key = p.key
ON CONFLICT (key) DO NOTHING;

-- +goose Down
-- Dev-iteration convenience only (003 forward-only in higher envs; db-down refused unless ENV=dev).
-- FK-safe order: children → parents.
DROP TABLE IF EXISTS public.product_section;
DROP TABLE IF EXISTS public.shop_section;
DROP TABLE IF EXISTS public.product_media;
DROP TABLE IF EXISTS public.product_attribute_value;
DROP TABLE IF EXISTS public.product;
DROP TABLE IF EXISTS public.product_type_attribute;
DROP TABLE IF EXISTS public.attribute_allowed_value;
DROP TABLE IF EXISTS public.attribute_definition;
DROP TABLE IF EXISTS public.category;
DROP TABLE IF EXISTS public.product_type;
