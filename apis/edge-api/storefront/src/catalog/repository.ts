// The category tree and the product detail page. SQL only.
import { availabilityPredicate, pooled, type Queryable } from "@effy/edge-shared";

export interface CategoryRow {
  key: string;
  name: string;
  parent_key: string | null;
  product_count: number;
  image_key: string | null;
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

export interface CatalogRepository {
  categories(): Promise<CategoryRow[]>;
  productDetail(id: string): Promise<DetailRow | null>;
  productMedia(id: string): Promise<MediaRow[]>;
  productAttributes(id: string): Promise<AttrRow[]>;
  categoryPath(categoryId: string): Promise<string[]>;
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
     */
    async categories() {
      return (
        await db.query<CategoryRow>(`
SELECT c.key AS key,
       c.name AS name,
       (SELECT pc.key FROM public.category pc WHERE pc.id = c.parent_id) AS parent_key,
       (SELECT count(*)::int
          FROM public.product p
         WHERE p.primary_category_id = c.id AND ${availabilityPredicate("p")}) AS product_count,
       (SELECT m.storage_key
          FROM public.product p
          JOIN LATERAL (
              SELECT storage_key
              FROM public.product_media
              WHERE product_id = p.id
              ORDER BY is_primary DESC, display_order ASC, created_at ASC
              LIMIT 1
          ) m ON true
         -- availability-exempt: public.product, DELIBERATELY status ONLY (054). This picks a
         -- category's representative PICTURE, not something to buy. Letting stock choose it would
         -- make a category change its face as units come and go, and a thumbnail makes no claim
         -- that the product behind it is purchasable.
         WHERE p.primary_category_id = c.id AND p.status = 'active'
         ORDER BY p.created_at ASC, p.id ASC
         LIMIT 1) AS image_key
FROM public.category c
-- availability-exempt: public.category — the taxonomy's own lifecycle.
WHERE c.status = 'active'
ORDER BY c.display_order ASC, c.name ASC`)
      ).rows;
    },

    /** One active product by id; null when absent or not active. `id` MUST be a uuid. */
    async productDetail(id) {
      return (
        (
          await db.query<DetailRow>(
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
       (${availabilityPredicate("p")}) AS available
FROM public.product p
-- availability-exempt: public.product — a VISIBILITY filter. Purchasability is the column above.
WHERE p.id = $1 AND p.status = 'active'`,
            [id],
          )
        ).rows[0] ?? null
      );
    },

    /** The product's gallery: primary first, then display order. */
    async productMedia(id) {
      return (
        await db.query<MediaRow>(
          `
SELECT storage_key, alt_text
FROM public.product_media
WHERE product_id = $1
ORDER BY is_primary DESC, display_order ASC, created_at ASC`,
          [id],
        )
      ).rows;
    },

    /**
     * The product's attribute values, grouped and ordered by the product type's link metadata
     * (falls back to a "Details" group when there is no link row).
     */
    async productAttributes(id) {
      return (
        await db.query<AttrRow>(
          `
SELECT ad.name                          AS label,
       ad.data_type                     AS data_type,
       ad.unit                          AS unit,
       pav.value_text                   AS value_text,
       pav.value_number::text           AS value_number,
       pav.value_boolean                AS value_boolean,
       pav.value_options                AS value_options,
       COALESCE(pta.group_label, 'Details') AS group_label
FROM public.product_attribute_value pav
JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
LEFT JOIN public.product_type_attribute pta
       ON pta.attribute_definition_id = pav.attribute_definition_id
      AND pta.product_type_id = (SELECT product_type_id FROM public.product WHERE id = $1)
-- availability-exempt: public.attribute_definition — a retired attribute is not shown, whatever
-- the product it hangs off is doing.
WHERE pav.product_id = $1 AND ad.status = 'active'
ORDER BY group_label ASC, pta.display_order ASC NULLS LAST, ad.name ASC`,
          [id],
        )
      ).rows;
    },

    /** The category path names root → leaf, walking parents from the product's primary category. */
    async categoryPath(categoryId) {
      return (
        await db.query<{ name: string }>(
          `
WITH RECURSIVE path AS (
    SELECT id, parent_id, name, 0 AS depth
    FROM public.category WHERE id = $1
    UNION ALL
    SELECT c.id, c.parent_id, c.name, p.depth + 1
    FROM public.category c JOIN path p ON c.id = p.parent_id
)
SELECT name FROM path ORDER BY depth DESC`,
          [categoryId],
        )
      ).rows.map((r) => r.name);
    },
  };
}
