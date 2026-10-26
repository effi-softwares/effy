import { pooled, productAvailableSql, renditionWidthsSql, type Queryable, variantPurchasableSql } from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import type { InputType, OptionKind, PackUnit, UnitBasis } from "@effy/shared-types";
import { PRODUCT_OFFER_SQL, type ProductOfferRow } from "@effy/edge-shared/promotions";

export interface CategoryRow {
  key: string;
  name: string;
  parent_key: string | null;
  depth: number;
  is_leaf: boolean;
  icon: string | null;
  product_count: number;
  image_key: string | null;
  image_widths: number[] | null;
}

export interface DetailRow {
  id: string;
  name: string;
  brand: string | null;
  price_amount: string;
  currency: string;
  compare_at_amount: string | null;
  offer?: ProductOfferRow | null;
  short_description: string;
  long_description: string | null;
  primary_category_id: string;
  /** For the related-products rail; carries names, not keys. */
  primary_category_key: string;
  is_new: boolean;
  available: boolean;
  age_restricted: boolean;
  unit_basis: UnitBasis | null;
}

export interface VariantPageRow {
  id: string;
  option1: string | null;
  option2: string | null;
  label: string | null;
  price_amount: string;
  compare_at_amount: string | null;
  pack_quantity: string | null;
  pack_unit: PackUnit | null;
  available: boolean;
  storage_key: string | null;
  image_widths: number[] | null;
}

/** The values active variants use, in the shop's order. */
export interface OptionPageRow {
  id: string;
  position: number;
  kind: OptionKind;
  attribute_id: string | null;
  /** The attribute's name; null for a pack size option. */
  name: string | null;
  values: { id: string; value: string; position: number; allowed_value_id: string | null }[];
}

export interface MediaRow {
  storage_key: string;
  alt_text: string | null;
  image_widths: number[] | null;
}

/** One customer-visible value in the leaf's form order; `variant_id` null for the whole product. */
export interface DetailValueRow {
  attribute_id: string;
  variant_id: string | null;
  name: string;
  section: string;
  position: number;
  input_type: InputType;
  value_text: string | null;
  value_number: string | null;
  value_unit: string | null;
  value_boolean: boolean | null;
  /** Choice values: ids and their labels, in the attribute's order. */
  values: { id: string; label: string }[] | null;
  value_date: string | null;
  value_time: string | null;
}

export interface ProductPageRow extends DetailRow {
  media: MediaRow[];
  details: DetailValueRow[];
  /** Root → leaf, as names. */
  category_path: string[];
  variants: VariantPageRow[];
  options: OptionPageRow[];
}

export interface CatalogRepository {
  categories(): Promise<CategoryRow[]>;
  /** One statement, because the pool is one connection; null when absent or inactive. `id` must be a uuid. */
  productPage(id: string): Promise<ProductPageRow | null>;
}

export function createCatalogRepository(db: Queryable = pooled): CatalogRepository {
  return {
    /**
     * The active tree with each category's parent, purchasable count and a derived picture (the oldest
     * active product with media, so it is stable). One walk of the taxonomy for all categories.
     */
    async categories() {
      return (
        await db.query<CategoryRow>(`
WITH membership AS (
    -- A product is in its home leaf and its extra placements; counted once per category above them.
    SELECT p.id AS product_id, p.primary_category_id AS category_id
    FROM public.product p
    WHERE ${productAvailableSql("p")}
    UNION
    SELECT pp.product_id, pp.category_id
    FROM public.product_placement pp
    JOIN public.product p ON p.id = pp.product_id
    WHERE ${productAvailableSql("p")}
),
counts AS (
    -- The category and everything under it: the number on an aisle is what its page shows.
    SELECT a.ancestor_id AS category_id, count(DISTINCT m.product_id)::int AS n
    FROM membership m
    JOIN public.category_ancestor a ON a.category_id = m.category_id
    GROUP BY a.ancestor_id
),
pictures AS (
    SELECT DISTINCT ON (a.ancestor_id) a.ancestor_id AS category_id, m.storage_key
    FROM public.category_ancestor a
    -- availability-exempt: public.product, DELIBERATELY status ONLY. This picks a category's
    -- representative PICTURE when staff gave it none, not something to buy. Letting stock choose it
    -- would make a category change its face as units come and go.
    JOIN public.product p ON p.primary_category_id = a.category_id AND p.status = 'active'
    JOIN LATERAL (
        SELECT storage_key
        FROM public.product_media
        WHERE product_id = p.id
        ORDER BY is_primary DESC, display_order ASC, created_at ASC
        LIMIT 1
    ) m ON true
    ORDER BY a.ancestor_id, p.created_at ASC, p.id ASC
)
SELECT c.key AS key,
       c.name AS name,
       pc.key AS parent_key,
       r.depth::int AS depth,
       r.is_leaf AS is_leaf,
       c.icon AS icon,
       COALESCE(counts.n, 0) AS product_count,
       COALESCE(c.image_key, pictures.storage_key) AS image_key,
       ${renditionWidthsSql("COALESCE(c.image_key, pictures.storage_key)")} AS image_widths
FROM public.category c
-- availability-exempt: public.category — category_resolved holds active categories only.
JOIN public.category_resolved r ON r.category_id = c.id
LEFT JOIN public.category pc ON pc.id = c.parent_id
LEFT JOIN counts ON counts.category_id = c.id
LEFT JOIN pictures ON pictures.category_id = c.id
ORDER BY r.depth ASC, c."position" ASC, c.name ASC`)
      ).rows;
    },

    async productPage(id) {
      return (
        (
          await db.query<ProductPageRow>(
            `
SELECT p.id::text                  AS id,
       p.name                      AS name,
       p.brand                     AS brand,
       p.list_price_amount::text   AS price_amount,
       p.currency                  AS currency,
       p.list_compare_at_amount::text AS compare_at_amount,
       p.unit_basis                AS unit_basis,
       -- An item or buy-X-get-Y offer open to everyone that covers this product.
       ${PRODUCT_OFFER_SQL("p", "now()")} AS offer,
       p.short_description         AS short_description,
       p.long_description          AS long_description,
       p.primary_category_id::text AS primary_category_id,
       (SELECT c.key FROM public.category c WHERE c.id = p.primary_category_id) AS primary_category_key,
       (p.created_at >= now() - interval '14 days') AS is_new,
       p.age_restricted            AS age_restricted,
       -- ⚠ PROJECTED, not filtered. A product page that 404'd the moment stock ran out would
       -- break every shared link and every saved item, and would tell a shopper "gone" when the
       -- truth is "back soon".
       (${productAvailableSql("p")}) AS available,
       -- The ACTIVE variants (inactive and removed are never sent to a shopper), each with its
       -- own purchasability, in the shop's order.
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', v.id,
                  'option1', v.option1_value_id,
                  'option2', v.option2_value_id,
                  'label', ${variantLabelSql("v")},
                  'price_amount', v.price_amount::text,
                  'compare_at_amount', v.compare_at_amount::text,
                  'pack_quantity', v.pack_quantity::text,
                  'pack_unit', v.pack_unit,
                  'available', (${variantPurchasableSql("p", "v")}),
                  'storage_key', vm.storage_key,
                  'image_widths', ${renditionWidthsSql("vm.storage_key")})
                ORDER BY v.position ASC, v.created_at ASC)
         FROM public.product_variant v
         LEFT JOIN public.product_media vm ON vm.id = v.media_id
         -- availability-exempt: product_variant — a VISIBILITY filter; purchasability is 'available'.
         WHERE v.product_id = p.id AND v.state = 'active'), '[]'::json) AS variants,
       -- The options, with only the values some active variant uses.
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', o.id, 'position', o.position, 'kind', o.kind, 'attribute_id', o.attribute_id,
                  'name', (SELECT oa.name FROM public.attribute_definition oa WHERE oa.id = o.attribute_id AND oa.customer_visible),
                  'values', COALESCE((
                     SELECT json_agg(json_build_object('id', ov.id, 'value', ov.value, 'position', ov.position,
                                                       'allowed_value_id', ov.allowed_value_id) ORDER BY ov.position)
                       FROM public.product_option_value ov
                      WHERE ov.option_id = o.id
                        AND EXISTS (SELECT 1 FROM public.product_variant uv
                                     -- availability-exempt: product_variant — a visibility filter.
                                     WHERE uv.product_id = p.id AND uv.state = 'active'
                                       AND ov.id IN (uv.option1_value_id, uv.option2_value_id))), '[]'::json))
                ORDER BY o.position)
         FROM public.product_option o
         WHERE o.product_id = p.id), '[]'::json) AS options,
       -- The gallery: primary first, then display order.
       COALESCE((
         SELECT json_agg(json_build_object(
                  'storage_key', pm.storage_key,
                  'alt_text', pm.alt_text,
                  'image_widths', ${renditionWidthsSql("pm.storage_key")})
                ORDER BY pm.is_primary DESC, pm.display_order ASC, pm.created_at ASC)
         FROM public.product_media pm
         WHERE pm.product_id = p.id), '[]'::json) AS media,
       -- The customer-visible values in the leaf's form order. A value whose attribute the leaf hides is
       -- not in category_form, so it is not shown. A per-variant value names its variant.
       COALESCE((
         SELECT json_agg(json_build_object(
                  'attribute_id', ad.id,
                  'variant_id', pav.variant_id,
                  'name', ad.name,
                  'section', f.section,
                  'position', f."position",
                  'input_type', ad.input_type,
                  'value_text', pav.value_text,
                  'value_number', pav.value_number::text,
                  'value_unit', pav.value_unit,
                  'value_boolean', pav.value_boolean,
                  'values', (SELECT json_agg(json_build_object('id', av.id, 'label', av.label) ORDER BY av."position", av.label)
                               FROM public.attribute_allowed_value av WHERE av.id = ANY(pav.allowed_value_ids)),
                  'value_date', to_char(pav.value_date, 'YYYY-MM-DD'),
                  'value_time', to_char(pav.value_time, 'HH24:MI'))
                ORDER BY f.section, f."position", ad.name)
         FROM public.product_attribute_value pav
         JOIN public.category_form f ON f.category_id = p.primary_category_id AND f.attribute_id = pav.attribute_definition_id
         -- availability-exempt: public.attribute_definition — internal-only details never reach a customer.
         JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id AND ad.customer_visible
         WHERE pav.product_id = p.id), '[]'::json) AS details,
       (SELECT r.path_names FROM public.category_resolved r WHERE r.category_id = p.primary_category_id) AS category_path
FROM public.product p
-- availability-exempt: public.product — a VISIBILITY filter. Purchasability is the column above.
WHERE p.id = $1 AND p.status = 'active'`,
            [id],
          )
        ).rows[0] ?? null
      );
    },
  };
}
