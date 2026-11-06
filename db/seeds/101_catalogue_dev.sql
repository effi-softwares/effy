-- Catalogue dev seed: the starting category tree and attribute library. DEV ONLY, run with
-- `make seed-catalogue ENV=dev`.
--
-- What it puts back is the reference taxonomy every environment starts from - a general retailer's tree
-- (25 departments, up to three levels), the attribute library with its allowed values, where each attribute
-- attaches, and each department's storage / GST / 18+ defaults. `make reset-dev-data` deletes all of it.
--
-- ⚠ ONE SOURCE: the data is NOT copied here. This replays the migration that seeds it
-- (db/migrations/20261026094826_catalogue_taxonomy.sql), then applies what later migrations changed in it:
--   - 105 (20261030090000) removed the clothing "Size" attribute (`clothing_size`) and its attachments.
-- A future migration that changes the starting taxonomy adds its step below.
--
-- Refuses while any product exists or a promotion targets a category (both point at categories). Re-runnable:
-- an existing taxonomy is deleted first, so staff edits made in back-office are lost.

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.product) THEN
        RAISE EXCEPTION 'seed-catalogue: products exist, and they point at categories. Run make reset-dev-data first.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.promotion_target WHERE category_id IS NOT NULL) THEN
        RAISE EXCEPTION 'seed-catalogue: a promotion targets a category. Run make reset-dev-data first.';
    END IF;
END
$$;

-- ── 1. Clear what is there (children before parents) ───────────────────────────────────────────────
TRUNCATE public.category_form, public.category_resolved, public.category_ancestor;
DELETE FROM public.category_attribute;
DELETE FROM public.attribute_definition;   -- its allowed values cascade
DO $$
BEGIN
    -- category.parent_id is ON DELETE RESTRICT: remove the deepest level first.
    WHILE EXISTS (SELECT 1 FROM public.category) LOOP
        DELETE FROM public.category c
         WHERE NOT EXISTS (SELECT 1 FROM public.category ch WHERE ch.parent_id = c.id);
    END LOOP;
END
$$;

-- ── 2. The starting taxonomy, from its migration ────────────────────────────────────────────────────
-- Its goose markers are comments to psql; its Down section is a bare SELECT 1. Output is muted.
\o /dev/null
\ir ../migrations/20261026094826_catalogue_taxonomy.sql
\o

-- ── 3. Later migrations' changes to it ──────────────────────────────────────────────────────────────
-- 105: variants come only from category attributes; the clothing Size attribute left the library.
DELETE FROM public.category_attribute
 WHERE attribute_id IN (SELECT id FROM public.attribute_definition WHERE key = 'clothing_size');
DELETE FROM public.attribute_definition WHERE key = 'clothing_size';

\o /dev/null
SELECT public.rebuild_category_derived();
\o

-- ── Summary ─────────────────────────────────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM public.category_resolved WHERE depth = 1)       AS departments,
       (SELECT count(*) FROM public.category)                                AS categories,
       (SELECT count(*) FROM public.category_resolved WHERE is_leaf)         AS leaves,
       (SELECT count(*) FROM public.attribute_definition)                    AS attributes,
       (SELECT count(*) FROM public.attribute_definition WHERE variant_option) AS variant_options,
       (SELECT count(*) FROM public.attribute_allowed_value)                 AS allowed_values,
       (SELECT count(*) FROM public.category_attribute)                      AS attachments;

COMMIT;
