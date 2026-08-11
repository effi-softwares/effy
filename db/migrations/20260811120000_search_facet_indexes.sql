-- 043-customer-search-filters — indexes for fast faceted counting.
--
-- The facets read (GET /v1/storefront/facets) groups the filtered ACTIVE product set by brand and by
-- attribute value, concurrently, on every filter change. These two indexes keep those aggregates off a
-- sequential scan of public.product at catalogue scale (SC-002: p95 < 1s at ≥50k active products).
--
-- ⚠ NOTHING here touches the trigram GIN expression index (storefront search.go trigramExpr must stay
-- character-identical to it). Category-facet counts reuse the existing product_primary_category_id_idx.
--
-- Forward-only (003). The Down drops both — dev-only, single-step.

-- +goose Up

-- Brand grouping over the visible set: a partial index on (status, brand) restricted to active rows.
-- Supports both `GROUP BY p.brand WHERE status='active'` (the brand facet counts) and brand `= ANY(...)`
-- filtering. Partial so it stays small — only active products are ever counted or shown.
CREATE INDEX IF NOT EXISTS product_active_brand_idx
    ON public.product (brand)
    WHERE status = 'active';

-- Attribute-value grouping: joining a filtered product set to its attribute values and grouping by
-- (definition, value). Leading with attribute_definition_id lets the count read for one attribute seek
-- straight to that attribute's value rows, with product_id available for the count(DISTINCT p.id).
CREATE INDEX IF NOT EXISTS product_attribute_value_def_product_idx
    ON public.product_attribute_value (attribute_definition_id, product_id);

-- +goose Down

DROP INDEX IF EXISTS public.product_attribute_value_def_product_idx;
DROP INDEX IF EXISTS public.product_active_brand_idx;
