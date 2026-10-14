// The category tree and the product detail page. SQL only.
import { availabilityPredicate, pooled, renditionWidthsSql, type Queryable } from "@effy/edge-shared";

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
  short_description: string;
  long_description: string | null;
  primary_category_id: string;
  /** Drives the related-products rail (025 FR-026); `categoryPath` carries names, not keys. */
  primary_category_key: string;
  is_new: boolean;
  available: boolean;
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
    JOIN public.product p ON p.primary_category_id = tree.id AND ${availabilityPredicate("p")}
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
       p.price_amount::text        AS price_amount,
       p.currency                  AS currency,
       p.compare_at_amount::text   AS compare_at_amount,
       p.short_description         AS short_description,
       p.long_description          AS long_description,
       p.primary_category_id::text AS primary_category_id,
       (SELECT c.key FROM public.category c WHERE c.id = p.primary_category_id) AS primary_category_key,
       (p.created_at >= now() - interval '14 days') AS is_new,
       -- ⚠ 054: PROJECTED, not filtered. A product page that 404'd the moment stock ran out would
       -- break every shared link and every saved item, and would tell a shopper "gone" when the
       -- truth is "back soon".
       (${availabilityPredicate("p")}) AS available,
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
