-- 101 Category-driven catalogue: the home leaf category decides a product's form. Product types are gone.
--
-- • category: one tree, at most five levels, with an icon, a picture, synonyms and defaults for the three
--   facts the platform acts on (storage, GST, 18+). `category_attribute` attaches library attributes as
--   required / recommended / optional, or hides an inherited one.
-- • Three derived tables — the closure, each category's resolved path and defaults, each category's
--   resolved form — are written ONLY by public.rebuild_category_derived(), the one definition of
--   inheritance. The taxonomy writer (@effy/edge-shared/catalog/taxonomy.ts) calls it in every write.
-- • product: storage, age_restricted and gst_status are required columns. Attribute values may belong to
--   one variant; numbers keep their unit and a base-unit copy for filters. Variant options name a library
--   attribute or are "Pack size".
-- • public.product_missing_required(product) lists required details a product lacks; it never names a
--   variant (the one label rule lives in @effy/edge-shared/catalog/label.ts).
--
-- Refuses to run while any product exists: run db/reset/101_purge_catalogue_dev.sql first (dev). One-way.

-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.product) THEN
        RAISE EXCEPTION '101: the catalogue is not empty — run db/reset/101_purge_catalogue_dev.sql first';
    END IF;
    IF EXISTS (SELECT 1 FROM public.promotion_target WHERE target_type = 'category') THEN
        RAISE EXCEPTION '101: promotions still target categories — run db/reset/101_purge_catalogue_dev.sql first';
    END IF;
END
$$;

-- ── 1. The old model goes ──────────────────────────────────────────────────────────────────────────
DROP TABLE public.product_type_attribute;
ALTER TABLE public.product DROP COLUMN product_type_id;
DROP TABLE public.product_type;

DELETE FROM public.product_attribute_value;
DELETE FROM public.attribute_allowed_value;
DELETE FROM public.attribute_definition;
DELETE FROM public.category;

-- ── 2. category ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.category RENAME COLUMN display_order TO "position";
ALTER TABLE public.category
    ADD COLUMN icon text,
    ADD COLUMN image_key text,
    ADD COLUMN synonyms text[] DEFAULT '{}'::text[] NOT NULL,
    ADD COLUMN default_storage text,
    ADD COLUMN default_gst_status text,
    ADD COLUMN default_age_restricted boolean,
    ADD CONSTRAINT category_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
    ADD CONSTRAINT category_key_check CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT category_not_own_parent_check CHECK (parent_id IS DISTINCT FROM id),
    ADD CONSTRAINT category_image_key_check CHECK (image_key IS NULL OR image_key LIKE 'categories/%'),
    ADD CONSTRAINT category_synonyms_check CHECK (cardinality(synonyms) <= 30),
    ADD CONSTRAINT category_default_storage_check CHECK (default_storage IS NULL OR default_storage IN ('frozen', 'chilled', 'ambient')),
    ADD CONSTRAINT category_default_gst_status_check CHECK (default_gst_status IS NULL OR default_gst_status IN ('taxable', 'gst_free')),
    -- The keys of CATEGORY_ICONS in @effy/shared-types/category-icons.ts (category-icons.test.ts compares).
    ADD CONSTRAINT category_icon_check CHECK (icon IS NULL OR icon IN (
        'apple', 'baby', 'bath', 'bed', 'beef', 'beer', 'bike', 'cable', 'candy', 'car', 'carrot',
        'citrus', 'coffee', 'cookie', 'cooking-pot', 'croissant', 'cup-soda', 'drill', 'dumbbell', 'egg',
        'fish', 'flower-2', 'footprints', 'gamepad-2', 'gift', 'hammer', 'headphones', 'heart-pulse',
        'ice-cream-cone', 'lamp', 'laptop', 'leaf', 'milk', 'notebook', 'package', 'paintbrush',
        'party-popper', 'paw-print', 'pencil', 'pill', 'sandwich', 'scroll-text', 'shirt',
        'shopping-basket', 'smartphone', 'snowflake', 'sofa', 'soup', 'sparkles', 'spray-can', 'sprout',
        'tent', 'toy-brick', 'tv', 'utensils', 'washing-machine', 'watch', 'wheat', 'wine', 'wrench'));

CREATE UNIQUE INDEX category_sibling_name_uq ON public.category (parent_id, lower(name)) NULLS NOT DISTINCT
    WHERE status = 'active';
DROP INDEX public.category_parent_idx;
CREATE INDEX category_parent_position_idx ON public.category (parent_id, "position");

-- ── 3. The attribute library ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.attribute_definition RENAME COLUMN data_type TO input_type;
ALTER TABLE public.attribute_definition
    DROP CONSTRAINT attribute_definition_data_type_check,
    DROP COLUMN unit,
    DROP COLUMN validation,
    ADD COLUMN unit_family text,
    ADD COLUMN units text[],
    ADD COLUMN min_value numeric,
    ADD COLUMN max_value numeric,
    ADD COLUMN decimals smallint,
    ADD COLUMN max_length integer,
    ADD COLUMN filterable boolean DEFAULT false NOT NULL,
    ADD COLUMN customer_visible boolean DEFAULT true NOT NULL,
    ADD COLUMN varies_by_variant boolean DEFAULT false NOT NULL,
    ADD COLUMN variant_option boolean DEFAULT false NOT NULL,
    ADD CONSTRAINT attribute_definition_input_type_check CHECK (input_type IN
        ('short_text', 'long_text', 'number', 'boolean', 'single_select', 'multi_select', 'date', 'time')),
    ADD CONSTRAINT attribute_definition_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 60),
    ADD CONSTRAINT attribute_definition_key_check CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
    ADD CONSTRAINT attribute_definition_help_text_check CHECK (help_text IS NULL OR char_length(help_text) <= 200),
    -- The families of UNIT_FAMILIES in @effy/shared-types/units.ts.
    ADD CONSTRAINT attribute_definition_unit_family_check CHECK (unit_family IS NULL OR (input_type = 'number' AND unit_family IN
        ('mass', 'volume', 'length', 'area', 'power', 'voltage', 'battery', 'data', 'duration', 'temperature', 'count'))),
    ADD CONSTRAINT attribute_definition_units_check CHECK ((unit_family IS NULL) = (units IS NULL)
        AND (units IS NULL OR cardinality(units) >= 1)
        AND (unit_family IS DISTINCT FROM 'count' OR cardinality(units) = 1)),
    ADD CONSTRAINT attribute_definition_number_limits_check CHECK (input_type = 'number'
        OR (min_value IS NULL AND max_value IS NULL AND decimals IS NULL)),
    ADD CONSTRAINT attribute_definition_range_check CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),
    ADD CONSTRAINT attribute_definition_decimals_check CHECK (decimals IS NULL OR decimals BETWEEN 0 AND 3),
    ADD CONSTRAINT attribute_definition_max_length_check CHECK (max_length IS NULL
        OR (input_type IN ('short_text', 'long_text') AND max_length BETWEEN 1 AND 2000)),
    ADD CONSTRAINT attribute_definition_filterable_check CHECK (NOT filterable
        OR input_type IN ('single_select', 'multi_select', 'boolean', 'number')),
    ADD CONSTRAINT attribute_definition_variant_option_check CHECK (NOT variant_option
        OR (input_type = 'single_select' AND varies_by_variant));

CREATE UNIQUE INDEX attribute_definition_name_uq ON public.attribute_definition (lower(name));

ALTER TABLE public.attribute_allowed_value
    DROP CONSTRAINT attribute_allowed_value_attribute_definition_id_value_key,
    DROP COLUMN value;
ALTER TABLE public.attribute_allowed_value RENAME COLUMN display_order TO "position";
ALTER TABLE public.attribute_allowed_value
    ADD COLUMN status text DEFAULT 'active' NOT NULL,
    ADD CONSTRAINT attribute_allowed_value_status_check CHECK (status IN ('active', 'retired')),
    ADD CONSTRAINT attribute_allowed_value_label_check CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 40);
CREATE UNIQUE INDEX attribute_allowed_value_label_uq ON public.attribute_allowed_value (attribute_definition_id, lower(label));

-- ── 4. Attachments and extra placements ────────────────────────────────────────────────────────────
CREATE TABLE public.category_attribute (
    category_id uuid NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
    attribute_id uuid NOT NULL REFERENCES public.attribute_definition(id) ON DELETE RESTRICT,
    level text,
    hidden boolean DEFAULT false NOT NULL,
    section text,
    "position" integer,
    PRIMARY KEY (category_id, attribute_id),
    CONSTRAINT category_attribute_level_check CHECK (level IS NULL OR level IN ('required', 'recommended', 'optional')),
    CONSTRAINT category_attribute_hidden_check CHECK (hidden = (level IS NULL)),
    CONSTRAINT category_attribute_section_check CHECK (section IS NULL OR (section = btrim(section) AND char_length(section) BETWEEN 1 AND 40))
);
CREATE INDEX category_attribute_attribute_idx ON public.category_attribute (attribute_id);

CREATE TABLE public.product_placement (
    product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES public.category(id) ON DELETE CASCADE,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (product_id, category_id)
);
CREATE INDEX product_placement_category_idx ON public.product_placement (category_id);

-- ── 5. Derived taxonomy (written only by rebuild_category_derived) ─────────────────────────────────
CREATE TABLE public.category_ancestor (
    ancestor_id uuid NOT NULL,
    category_id uuid NOT NULL,
    distance smallint NOT NULL,
    PRIMARY KEY (ancestor_id, category_id)
);
CREATE INDEX category_ancestor_category_idx ON public.category_ancestor (category_id);

CREATE TABLE public.category_resolved (
    category_id uuid PRIMARY KEY,
    depth smallint NOT NULL,
    is_leaf boolean NOT NULL,
    path_ids uuid[] NOT NULL,
    path_names text[] NOT NULL,
    path_keys text[] NOT NULL,
    storage text,
    gst_status text,
    age_restricted boolean
);

CREATE TABLE public.category_form (
    category_id uuid NOT NULL,
    attribute_id uuid NOT NULL,
    level text NOT NULL,
    section text NOT NULL,
    "position" integer NOT NULL,
    source_category_id uuid NOT NULL,
    PRIMARY KEY (category_id, attribute_id)
);
CREATE INDEX category_form_attribute_idx ON public.category_form (attribute_id);

-- ── 6. Products ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.product
    ADD COLUMN storage text NOT NULL,
    ADD COLUMN age_restricted boolean NOT NULL,
    ALTER COLUMN gst_status SET NOT NULL,
    ADD CONSTRAINT product_storage_check CHECK (storage IN ('frozen', 'chilled', 'ambient'));

ALTER TABLE public.product_attribute_value
    DROP CONSTRAINT product_attribute_value_check,
    DROP CONSTRAINT product_attribute_value_product_id_attribute_definition_id_key,
    DROP COLUMN value_options,
    ADD COLUMN variant_id uuid,
    ADD COLUMN value_unit text,
    ADD COLUMN value_base numeric,
    ADD COLUMN value_date date,
    ADD COLUMN value_time time without time zone,
    ADD COLUMN allowed_value_ids uuid[],
    ADD CONSTRAINT product_attribute_value_variant_fkey FOREIGN KEY (variant_id, product_id)
        REFERENCES public.product_variant(id, product_id) ON DELETE CASCADE,
    ADD CONSTRAINT product_attribute_value_uq UNIQUE NULLS NOT DISTINCT (product_id, attribute_definition_id, variant_id),
    ADD CONSTRAINT product_attribute_value_one_value_check CHECK
        (num_nonnulls(value_text, value_number, value_boolean, allowed_value_ids, value_date, value_time) = 1),
    ADD CONSTRAINT product_attribute_value_number_check CHECK ((value_number IS NULL) = (value_base IS NULL)
        AND (value_unit IS NULL OR value_number IS NOT NULL)),
    ADD CONSTRAINT product_attribute_value_options_check CHECK (allowed_value_ids IS NULL OR cardinality(allowed_value_ids) >= 1);
DROP INDEX public.product_attribute_value_attr_idx;
CREATE INDEX product_attribute_value_variant_idx ON public.product_attribute_value (variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX product_attribute_value_options_idx ON public.product_attribute_value USING gin (allowed_value_ids);
CREATE INDEX product_attribute_value_base_idx ON public.product_attribute_value (attribute_definition_id, value_base)
    WHERE value_base IS NOT NULL;

DROP INDEX public.product_option_name_uq;
ALTER TABLE public.product_option
    DROP CONSTRAINT product_option_name_check,
    DROP COLUMN name,
    ADD COLUMN kind text NOT NULL,
    ADD COLUMN attribute_id uuid REFERENCES public.attribute_definition(id) ON DELETE RESTRICT,
    ADD CONSTRAINT product_option_kind_check CHECK (kind IN ('attribute', 'pack_size')),
    ADD CONSTRAINT product_option_attribute_check CHECK ((kind = 'attribute') = (attribute_id IS NOT NULL));
CREATE UNIQUE INDEX product_option_attribute_uq ON public.product_option (product_id, attribute_id) WHERE attribute_id IS NOT NULL;
CREATE UNIQUE INDEX product_option_pack_size_uq ON public.product_option (product_id) WHERE kind = 'pack_size';

-- `value` stays: the label copy every order line, manifest and document reads through variantLabelSql.
ALTER TABLE public.product_option_value
    ADD COLUMN allowed_value_id uuid REFERENCES public.attribute_allowed_value(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX product_option_value_allowed_uq ON public.product_option_value (option_id, allowed_value_id)
    WHERE allowed_value_id IS NOT NULL;
CREATE INDEX product_option_value_allowed_idx ON public.product_option_value (allowed_value_id) WHERE allowed_value_id IS NOT NULL;

-- ── 7. The one definition of inheritance ───────────────────────────────────────────────────────────
-- Rebuilds the three derived tables in full. Walks active categories only; the taxonomy writer never
-- leaves an active category under a retired one, and this refuses if it ever happens.
-- A form folds root-first: a level SETS an attribute (with its level, section and position), TIGHTENS an
-- inherited one (optional < recommended < required; section and position may be restated), or HIDES it
-- (gone here and below until a deeper category attaches it again). Retired attributes are ignored.
CREATE FUNCTION public.rebuild_category_derived() RETURNS void
    LANGUAGE plpgsql
    AS $fn$
DECLARE
    d smallint;
    active_count integer;
BEGIN
    TRUNCATE public.category_form, public.category_resolved, public.category_ancestor;

    INSERT INTO public.category_resolved (category_id, depth, is_leaf, path_ids, path_names, path_keys, storage, gst_status, age_restricted)
    WITH RECURSIVE walk AS (
        SELECT c.id, 1 AS depth, ARRAY[c.id] AS path_ids, ARRAY[c.name] AS path_names, ARRAY[c.key] AS path_keys,
               c.default_storage AS storage, c.default_gst_status AS gst_status, c.default_age_restricted AS age_restricted
          FROM public.category c
         WHERE c.parent_id IS NULL AND c.status = 'active'
        UNION ALL
        SELECT c.id, w.depth + 1, w.path_ids || c.id, w.path_names || c.name, w.path_keys || c.key,
               COALESCE(c.default_storage, w.storage), COALESCE(c.default_gst_status, w.gst_status),
               COALESCE(c.default_age_restricted, w.age_restricted)
          FROM walk w
          JOIN public.category c ON c.parent_id = w.id AND c.status = 'active'
         WHERE w.depth < 6
    )
    SELECT w.id, w.depth,
           NOT EXISTS (SELECT 1 FROM public.category ch WHERE ch.parent_id = w.id AND ch.status = 'active'),
           w.path_ids, w.path_names, w.path_keys, w.storage, w.gst_status, w.age_restricted
      FROM walk w;

    IF EXISTS (SELECT 1 FROM public.category_resolved WHERE depth > 5) THEN
        RAISE EXCEPTION 'category tree deeper than five levels' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO active_count FROM public.category WHERE status = 'active';
    IF active_count <> (SELECT count(*) FROM public.category_resolved) THEN
        RAISE EXCEPTION 'an active category sits under a retired one' USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.category_ancestor (ancestor_id, category_id, distance)
    SELECT a.ancestor_id, r.category_id, (r.depth - a.ord)::smallint
      FROM public.category_resolved r
      CROSS JOIN LATERAL unnest(r.path_ids) WITH ORDINALITY AS a(ancestor_id, ord);

    FOR d IN 1..5 LOOP
        -- Inherit the parent's resolved form.
        INSERT INTO public.category_form (category_id, attribute_id, level, section, "position", source_category_id)
        SELECT r.category_id, f.attribute_id, f.level, f.section, f."position", f.source_category_id
          FROM public.category_resolved r
          JOIN public.category_form f ON f.category_id = r.path_ids[r.depth - 1]
         WHERE r.depth = d AND d > 1;

        -- Hide.
        DELETE FROM public.category_form f
         USING public.category_attribute ca, public.category_resolved r
         WHERE r.depth = d AND ca.category_id = r.category_id AND ca.hidden
           AND f.category_id = ca.category_id AND f.attribute_id = ca.attribute_id;

        -- Tighten or restate an inherited attribute.
        UPDATE public.category_form f
           SET level = CASE WHEN array_position(ARRAY['optional', 'recommended', 'required'], ca.level)
                              > array_position(ARRAY['optional', 'recommended', 'required'], f.level)
                            THEN ca.level ELSE f.level END,
               source_category_id = CASE WHEN array_position(ARRAY['optional', 'recommended', 'required'], ca.level)
                                           > array_position(ARRAY['optional', 'recommended', 'required'], f.level)
                                         THEN ca.category_id ELSE f.source_category_id END,
               section = COALESCE(ca.section, f.section),
               "position" = COALESCE(ca."position", f."position")
          FROM public.category_attribute ca
          JOIN public.category_resolved r ON r.category_id = ca.category_id AND r.depth = d
          JOIN public.attribute_definition ad ON ad.id = ca.attribute_id AND ad.status = 'active'
         WHERE NOT ca.hidden AND f.category_id = ca.category_id AND f.attribute_id = ca.attribute_id;

        -- Set what nothing above attached (or attaches again what an ancestor hid).
        INSERT INTO public.category_form (category_id, attribute_id, level, section, "position", source_category_id)
        SELECT ca.category_id, ca.attribute_id, ca.level, COALESCE(ca.section, 'Details'), COALESCE(ca."position", 0), ca.category_id
          FROM public.category_attribute ca
          JOIN public.category_resolved r ON r.category_id = ca.category_id AND r.depth = d
          JOIN public.attribute_definition ad ON ad.id = ca.attribute_id AND ad.status = 'active'
         WHERE NOT ca.hidden
        ON CONFLICT (category_id, attribute_id) DO NOTHING;
    END LOOP;
END
$fn$;

-- The required details a product lacks, in form order: one row per required attribute with no value at all
-- (variant_id NULL), and — for an attribute held per variant — one row per active variant without a value.
-- Names no variant: missingRequired() in @effy/edge-shared/catalog labels them with the one label rule.
CREATE FUNCTION public.product_missing_required(p uuid) RETURNS TABLE(attribute_id uuid, attribute_name text, variant_id uuid)
    LANGUAGE sql STABLE
    AS $fn$
    WITH req AS (
        SELECT f.attribute_id, ad.name, f.section, f."position"
          FROM public.product pr
          JOIN public.category_form f ON f.category_id = pr.primary_category_id AND f.level = 'required'
          JOIN public.attribute_definition ad ON ad.id = f.attribute_id
         WHERE pr.id = p
    ),
    held AS (
        SELECT v.attribute_definition_id AS attribute_id, bool_or(v.variant_id IS NULL) AS whole, bool_or(v.variant_id IS NOT NULL) AS per_variant
          FROM public.product_attribute_value v
         WHERE v.product_id = p
         GROUP BY v.attribute_definition_id
    ),
    missing AS (
        SELECT r.attribute_id, r.name, NULL::uuid AS variant_id, r.section, r."position", 0 AS vpos
          FROM req r
          LEFT JOIN held h ON h.attribute_id = r.attribute_id
         WHERE h.attribute_id IS NULL
        UNION ALL
        SELECT r.attribute_id, r.name, pv.id, r.section, r."position", pv."position"
          FROM req r
          JOIN held h ON h.attribute_id = r.attribute_id AND h.per_variant AND NOT h.whole
          JOIN public.product_variant pv ON pv.product_id = p AND pv.state = 'active'
         WHERE NOT EXISTS (SELECT 1 FROM public.product_attribute_value v
                            WHERE v.product_id = p AND v.attribute_definition_id = r.attribute_id AND v.variant_id = pv.id)
    )
    SELECT attribute_id, name, variant_id FROM missing ORDER BY section, "position", name, vpos
$fn$;

SELECT public.rebuild_category_derived();
-- +goose StatementEnd

-- +goose Down
SELECT 1; -- irreversible: fix forward (101)
