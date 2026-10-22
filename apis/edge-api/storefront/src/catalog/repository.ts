// The category tree and the product detail page. SQL only.
import { pooled, productAvailableSql, renditionWidthsSql, type Queryable, variantPurchasableSql } from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import type { PackUnit, UnitBasis } from "@effy/shared-types";
import { PRODUCT_OFFER_SQL, type ProductOfferRow } from "@effy/edge-shared/promotions";

import { categoryClosure } from "../lib/category-tree";

export interface CategoryRow {
  key: string;
  name: string;
  parent_key: string | null;
  product_count: number;
  image_key: string | null;
  /** 086 — the representative picture's ready copies; NULL for none. */
  image_widths: number[] | null;
}

/** The detail projection: the card fields plus the long description and the primary category. */
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
  /** Drives the related-products rail (025 FR-026); `categoryPath` carries names, not keys. */
  primary_category_key: string;
  is_new: boolean;
  available: boolean;
  /** 098 */
  unit_basis: UnitBasis | null;
}

/** 098 — one ACTIVE variant on the product page. */
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

/** 098 — one option with the values ACTIVE variants use, in the shop's order. */
export interface OptionPageRow {
  id: string;
  position: number;
  name: string;
  values: { id: string; value: string; position: number }[];
}

export interface MediaRow {
  storage_key: string;
  alt_text: string | null;
  /** 086 — this picture's ready copies; NULL for none. */
  image_widths: number[] | null;
}

/** One typed attribute value with its definition's label, data type and unit. */
export interface AttrRow {
  label: string;
  data_type: string;
  unit: string | null;
  value_text: string | null;
  value_number: string | null;
  value_boolean: boolean | null;
  value_options: string[] | null;
  group_label: string;
}

/** The whole product page: the detail row with its gallery, attributes and aisle path beside it. */
export interface ProductPageRow extends DetailRow {
  /** Primary first, then display order. */
  media: MediaRow[];
  /** Grouped and ordered by the product type's link metadata ("Details" when there is none). */
  attributes: AttrRow[];
  /** The primary category's path, root → leaf, as names. */
  category_path: string[];
  /** 098 — active variants in display order. */
  variants: VariantPageRow[];
  options: OptionPageRow[];
}

export interface CatalogRepository {
  categories(): Promise<CategoryRow[]>;
  /**
   * One active product's page in ONE statement (PERF-12); null when absent or not active. `id` MUST
   * be a uuid.
   *
   * ⚠ ONE STATEMENT BECAUSE THE POOL IS ONE CONNECTION (`max: 1`, shared/src/lib/db.ts): the detail,
   * gallery, attributes and path were four round trips in series, whatever `Promise.all` suggested.
   */
  productPage(id: string): Promise<ProductPageRow | null>;
}

export function createCatalogRepository(db: Queryable = pooled): CatalogRepository {
  return {
    /**
     * The active category tree, each with its parent key, its purchasable-product count, and a
     * representative image key.
     *
     * ⚠ The image is DERIVED, not stored — public.category has no image column and 025 FR-001
     * forbids adding one. The choice is deterministic (oldest active product in the category that
     * has media) because an arbitrary pick would make a category change its face between loads.
     *
     * ⚠ ONE WALK OF THE TAXONOMY (PERF-13). It used to walk each category's subtree twice in
     * correlated subqueries — and scan the products twice per category — so its cost grew with
     * categories × products. The closure is built once; the counts and pictures are one aggregate each.
     */
    async categories() {
      return (
        await db.query<CategoryRow>(`
WITH RECURSIVE tree AS (${categoryClosure()}),
counts AS (
    -- The category and everything under it: the number on an aisle is what its page shows.
    SELECT tree.root_id, count(*)::int AS n
    FROM tree
    JOIN public.product p ON p.primary_category_id = tree.id AND ${productAvailableSql("p")}
    GROUP BY tree.root_id
),
pictures AS (
    SELECT DISTINCT ON (tree.root_id) tree.root_id, m.storage_key
    FROM tree
    -- availability-exempt: public.product, DELIBERATELY status ONLY (054). This picks a
    -- category's representative PICTURE, not something to buy. Letting stock choose it would
    -- make a category change its face as units come and go, and a thumbnail makes no claim
    -- that the product behind it is purchasable.
    JOIN public.product p ON p.primary_category_id = tree.id AND p.status = 'active'
    JOIN LATERAL (
        SELECT storage_key
        FROM public.product_media
        WHERE product_id = p.id
        ORDER BY is_primary DESC, display_order ASC, created_at ASC
        LIMIT 1
    ) m ON true
    ORDER BY tree.root_id, p.created_at ASC, p.id ASC
)
SELECT c.key AS key,
       c.name AS name,
       pc.key AS parent_key,
       COALESCE(counts.n, 0) AS product_count,
       pictures.storage_key AS image_key,
       -- 086: the representative picture's ready copies.
       ${renditionWidthsSql("pictures.storage_key")} AS image_widths
FROM public.category c
LEFT JOIN public.category pc ON pc.id = c.parent_id
LEFT JOIN counts ON counts.root_id = c.id
LEFT JOIN pictures ON pictures.root_id = c.id
-- availability-exempt: public.category — the taxonomy's own lifecycle.
WHERE c.status = 'active'
ORDER BY c.display_order ASC, c.name ASC`)
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
       -- 094 — an item or buy-X-get-Y offer open to everyone that covers this product (R11).
       ${PRODUCT_OFFER_SQL("p", "now()")} AS offer,
       p.short_description         AS short_description,
       p.long_description          AS long_description,
       p.primary_category_id::text AS primary_category_id,
       (SELECT c.key FROM public.category c WHERE c.id = p.primary_category_id) AS primary_category_key,
       (p.created_at >= now() - interval '14 days') AS is_new,
       -- ⚠ 054: PROJECTED, not filtered. A product page that 404'd the moment stock ran out would
       -- break every shared link and every saved item, and would tell a shopper "gone" when the
       -- truth is "back soon".
       (${productAvailableSql("p")}) AS available,
       -- 098 — the ACTIVE variants (inactive and removed are never sent to a shopper), each with its
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
       -- 098 — the options, with only the values some active variant uses.
       COALESCE((
         SELECT json_agg(json_build_object(
                  'id', o.id, 'position', o.position, 'name', o.name,
                  'values', COALESCE((
                     SELECT json_agg(json_build_object('id', ov.id, 'value', ov.value, 'position', ov.position) ORDER BY ov.position)
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
       -- The attribute values, grouped and ordered by the product type's link metadata (falls back
       -- to a "Details" group when there is no link row). Numbers travel as text, exactly.
       COALESCE((
         SELECT json_agg(json_build_object(
                  'label', ad.name,
                  'data_type', ad.data_type,
                  'unit', ad.unit,
                  'value_text', pav.value_text,
                  'value_number', pav.value_number::text,
                  'value_boolean', pav.value_boolean,
                  'value_options', pav.value_options,
                  'group_label', COALESCE(pta.group_label, 'Details'))
                ORDER BY COALESCE(pta.group_label, 'Details') ASC, pta.display_order ASC NULLS LAST, ad.name ASC)
         FROM public.product_attribute_value pav
         JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
         LEFT JOIN public.product_type_attribute pta
                ON pta.attribute_definition_id = pav.attribute_definition_id
               AND pta.product_type_id = p.product_type_id
         -- availability-exempt: public.attribute_definition — a retired attribute is not shown,
         -- whatever the product it hangs off is doing.
         WHERE pav.product_id = p.id AND ad.status = 'active'), '[]'::json) AS attributes,
       -- The category path names root → leaf, walking parents from the primary category.
       COALESCE((
         WITH RECURSIVE path AS (
             SELECT id, parent_id, name, 0 AS depth
             FROM public.category WHERE id = p.primary_category_id
             UNION ALL
             SELECT c.id, c.parent_id, c.name, path.depth + 1
             FROM public.category c JOIN path ON c.id = path.parent_id
         )
         SELECT array_agg(name ORDER BY depth DESC) FROM path), '{}') AS category_path
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
