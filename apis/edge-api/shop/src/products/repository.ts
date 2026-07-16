// Repository layer for the shop product catalog (016): raw parameterized SQL + explicit row →
// domain mapping (constitution Principle VI, no ORM). Reads the back-office-managed schema
// (read-only projection) and writes shop-owned products. EVERY product query is scoped
// `WHERE shop_id = :actorShopId` — the shop-isolation invariant (FR-019/FR-031, SC-005); the shop
// id is always the caller-resolved value from authz, never client input.
//
// S3 presigning is an async I/O concern owned by the SERVICE layer (like Cognito in the shops
// service). This layer returns storage KEYS: `ProductListItem.primaryImageUrl` and
// `ProductMedia.url` carry the S3 key here, and the service replaces them with short-lived
// presigned URLs before the DTO leaves the process.
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  type AllowedValue,
  type AttributeDataType,
  type AttributeValidation,
  type CatalogSchema,
  type CreateProductInput,
  type ListParams,
  type Paged,
  type ProductAttributeValue,
  type ProductDetail,
  ProductError,
  type ProductListItem,
  type ProductMedia,
  type ProductStatus,
  type SchemaAttribute,
  type SchemaCategory,
  type SchemaProductType,
} from "./types";

// Map a Postgres unique_violation (23505) to a domain conflict, else rethrow.
function asConflict(err: unknown, message: string): ProductError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new ProductError("conflict", message);
  }
  throw err;
}

// ── Catalog schema-read (drives the create form) ──────────────────────────────────────────────

interface SchemaTypeRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "active" | "retired";
  created_at: Date;
  updated_at: Date;
}

interface SchemaAssignmentRow {
  product_type_id: string;
  attribute_id: string;
  key: string;
  name: string;
  data_type: AttributeDataType;
  unit: string | null;
  help_text: string | null;
  validation: AttributeValidation | null;
  is_mandatory: boolean;
  display_order: number;
  group_label: string | null;
}

interface AllowedRow {
  id: string;
  attribute_definition_id: string;
  value: string;
  label: string;
  display_order: number;
}

interface SchemaCategoryRow {
  id: string;
  parent_id: string | null;
  key: string;
  name: string;
  display_order: number;
  status: "active" | "retired";
}

function mapAllowed(rows: AllowedRow[], attributeId: string): AllowedValue[] {
  return rows
    .filter((r) => r.attribute_definition_id === attributeId)
    .sort((a, b) => a.display_order - b.display_order)
    .map((r) => ({ id: r.id, value: r.value, label: r.label, displayOrder: r.display_order }));
}

/** Active product types (each with active-attribute assignments) + the active category tree. */
export async function readCatalogSchema(): Promise<CatalogSchema> {
  const types = await query<SchemaTypeRow>(
    `SELECT id, key, name, description, status, created_at, updated_at FROM public.product_type
      WHERE status = 'active' ORDER BY name`,
  );
  const assignments = await query<SchemaAssignmentRow>(
    `SELECT pta.product_type_id, ad.id AS attribute_id, ad.key, ad.name, ad.data_type,
            ad.unit, ad.help_text, ad.validation,
            pta.is_mandatory, pta.display_order, pta.group_label
       FROM public.product_type_attribute pta
       JOIN public.attribute_definition ad ON ad.id = pta.attribute_definition_id
      WHERE ad.status = 'active'
        AND pta.product_type_id IN (SELECT id FROM public.product_type WHERE status = 'active')
      ORDER BY pta.display_order`,
  );
  const attrIds = [...new Set(assignments.rows.map((a) => a.attribute_id))];
  const allowed = attrIds.length
    ? (
        await query<AllowedRow>(
          `SELECT id, attribute_definition_id, value, label, display_order
             FROM public.attribute_allowed_value WHERE attribute_definition_id = ANY($1) ORDER BY display_order`,
          [attrIds],
        )
      ).rows
    : [];
  const categories = await query<SchemaCategoryRow>(
    `SELECT id, parent_id, key, name, display_order, status FROM public.category
      WHERE status = 'active' ORDER BY display_order, name`,
  );

  const productTypes: SchemaProductType[] = types.rows.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    status: t.status,
    createdAt: t.created_at.toISOString(),
    updatedAt: t.updated_at.toISOString(),
    attributes: assignments.rows
      .filter((a) => a.product_type_id === t.id)
      .map(
        (a): SchemaAttribute => ({
          attributeId: a.attribute_id,
          key: a.key,
          name: a.name,
          dataType: a.data_type,
          unit: a.unit,
          helpText: a.help_text,
          validation: a.validation,
          allowedValues: mapAllowed(allowed, a.attribute_id),
          isMandatory: a.is_mandatory,
          displayOrder: a.display_order,
          groupLabel: a.group_label,
        }),
      ),
  }));
  const cats: SchemaCategory[] = categories.rows.map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    key: c.key,
    name: c.name,
    displayOrder: c.display_order,
    status: c.status,
  }));
  return { productTypes, categories: cats };
}

/** The mandatory-attribute id set of a product type (used by the service to enforce create/publish). */
export async function mandatoryAttributeIds(productTypeId: string): Promise<string[]> {
  const res = await query<{ attribute_definition_id: string }>(
    `SELECT attribute_definition_id FROM public.product_type_attribute
      WHERE product_type_id = $1 AND is_mandatory = true`,
    [productTypeId],
  );
  return res.rows.map((r) => r.attribute_definition_id);
}

/** The active-attribute assignments of a type, for typed-value validation (data_type + allowed set). */
export async function assignmentsForType(productTypeId: string): Promise<SchemaAttribute[]> {
  const schema = await readCatalogSchema();
  const type = schema.productTypes.find((t) => t.id === productTypeId);
  return type ? type.attributes : [];
}

export async function productTypeIsActive(id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.product_type WHERE id = $1 AND status = 'active') AS ok`,
    [id],
  );
  return res.rows[0]?.ok ?? false;
}

export async function categoryIsActive(id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.category WHERE id = $1 AND status = 'active') AS ok`,
    [id],
  );
  return res.rows[0]?.ok ?? false;
}

// ── Create ────────────────────────────────────────────────────────────────────────────────────

async function insertAttributeValues(
  client: PoolClient,
  productId: string,
  attributes: CreateProductInput["attributes"],
): Promise<void> {
  for (const a of attributes) {
    await client.query(
      `INSERT INTO public.product_attribute_value
           (product_id, attribute_definition_id, value_text, value_number, value_boolean, value_options)
           VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (product_id, attribute_definition_id)
         DO UPDATE SET value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
                       value_boolean = EXCLUDED.value_boolean, value_options = EXCLUDED.value_options,
                       updated_at = now()`,
      [
        productId,
        a.attributeId,
        a.valueText ?? null,
        a.valueNumber ?? null,
        a.valueBoolean ?? null,
        a.valueOptions ?? null,
      ],
    );
  }
}

/** Insert a shop-owned product + its attribute values, media, and section memberships in ONE
 *  transaction. `shopId` is the caller-resolved actor shop (never client input). Returns the id;
 *  the service then loads the full detail. A duplicate SKU (partial unique index) → 409 conflict. */
export async function createProduct(
  shopId: string,
  input: CreateProductInput,
  createdBy: string,
): Promise<string> {
  return withTransaction(async (client) => {
    let productId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.product
             (shop_id, product_type_id, primary_category_id, name, sku, gtin, brand,
              price_amount, compare_at_amount, short_description, long_description, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id`,
        [
          shopId,
          input.productTypeId,
          input.primaryCategoryId,
          input.name,
          input.sku,
          input.gtin,
          input.brand,
          input.priceAmount,
          input.compareAtAmount,
          input.shortDescription,
          input.longDescription,
          createdBy,
        ],
      );
      productId = ins.rows[0]!.id;
    } catch (err) {
      throw asConflict(err, "a product with this SKU already exists in this shop");
    }

    await insertAttributeValues(client, productId, input.attributes);

    for (const m of input.media) {
      await client.query(
        `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order, alt_text)
              VALUES ($1, $2, $3, $4, $5)`,
        [productId, m.storageKey, m.isPrimary, m.displayOrder, m.altText],
      );
    }
    for (const sectionId of input.sectionIds) {
      await client.query(
        `INSERT INTO public.product_section (product_id, shop_section_id)
              VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [productId, sectionId],
      );
    }
    return productId;
  });
}

/** Focused-edit update with optimistic concurrency (FR-023a). The whole (merged) column set is
 *  written under `WHERE id AND shop_id AND updated_at = expectedUpdatedAt`; 0 rows affected → the
 *  row changed since the client read it → "stale". Attribute upserts run in the same transaction.
 *
 *  NB the concurrency token is compared with millisecond truncation: the pg driver returns
 *  timestamptz as a JS Date (ms precision), so the token the client last read is already
 *  ms-truncated — comparing against the raw µs-precision column would never match. `date_trunc`
 *  makes the equality robust without adding a version column (data-model §3). */
export async function updateProduct(
  shopId: string,
  id: string,
  expectedUpdatedAt: string,
  values: {
    name: string;
    productTypeId: string;
    primaryCategoryId: string;
    sku: string | null;
    gtin: string | null;
    brand: string | null;
    priceAmount: string;
    compareAtAmount: string | null;
    shortDescription: string;
    longDescription: string | null;
  },
  attributes: CreateProductInput["attributes"],
): Promise<"updated" | "stale"> {
  return withTransaction(async (client) => {
    let res;
    try {
      res = await client.query<{ id: string }>(
        `UPDATE public.product SET
             name = $3, product_type_id = $4, primary_category_id = $5, sku = $6, gtin = $7,
             brand = $8, price_amount = $9, compare_at_amount = $10, short_description = $11,
             long_description = $12, updated_at = now()
          WHERE id = $1 AND shop_id = $2
            AND date_trunc('milliseconds', updated_at) = $13::timestamptz
          RETURNING id`,
        [
          id,
          shopId,
          values.name,
          values.productTypeId,
          values.primaryCategoryId,
          values.sku,
          values.gtin,
          values.brand,
          values.priceAmount,
          values.compareAtAmount,
          values.shortDescription,
          values.longDescription,
          expectedUpdatedAt,
        ],
      );
    } catch (err) {
      throw asConflict(err, "a product with this SKU already exists in this shop");
    }
    if (res.rowCount === 0) return "stale";
    await insertAttributeValues(client, id, attributes);
    return "updated";
  });
}

/** Change lifecycle status under shop scope; 404 if not this shop's. */
export async function changeStatus(shopId: string, id: string, status: ProductStatus): Promise<boolean> {
  const res = await query<{ id: string }>(
    `UPDATE public.product SET status = $3, updated_at = now()
      WHERE id = $1 AND shop_id = $2 RETURNING id`,
    [id, shopId, status],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Hard-delete guard (R8): only a still-draft product may be removed; anything published/retained
 *  is refused (409 → archive instead). Returns 'deleted' | 'not_found' | 'blocked'. */
export async function hardDeleteProduct(
  shopId: string,
  id: string,
): Promise<"deleted" | "not_found" | "blocked"> {
  return withTransaction(async (client) => {
    const cur = await client.query<{ status: ProductStatus }>(
      `SELECT status FROM public.product WHERE id = $1 AND shop_id = $2`,
      [id, shopId],
    );
    const status = cur.rows[0]?.status;
    if (!status) return "not_found";
    if (status !== "draft") return "blocked";
    await client.query(`DELETE FROM public.product WHERE id = $1 AND shop_id = $2`, [id, shopId]);
    return "deleted";
  });
}

/** Set a product's section membership (replace-all), shop-scoped. */
export async function setProductSections(
  shopId: string,
  id: string,
  sectionIds: string[],
): Promise<boolean> {
  return withTransaction(async (client) => {
    const owns = await client.query<{ id: string }>(
      `SELECT id FROM public.product WHERE id = $1 AND shop_id = $2`,
      [id, shopId],
    );
    if (!owns.rows[0]) return false;
    await client.query(`DELETE FROM public.product_section WHERE product_id = $1`, [id]);
    for (const sectionId of sectionIds) {
      // The section must belong to this shop, else it is silently skipped (never cross-shop).
      await client.query(
        `INSERT INTO public.product_section (product_id, shop_section_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM public.shop_section WHERE id = $2 AND shop_id = $3)
         ON CONFLICT DO NOTHING`,
        [id, sectionId, shopId],
      );
    }
    return true;
  });
}

/** Update a media row (reorder / set primary / alt text), shop-scoped via the product. */
export async function updateMedia(
  shopId: string,
  productId: string,
  mediaId: string,
  patch: { isPrimary?: boolean; displayOrder?: number; altText?: string | null },
): Promise<ProductMedia | null> {
  return withTransaction(async (client) => {
    const owns = await client.query<{ id: string }>(
      `SELECT m.id FROM public.product_media m
         JOIN public.product p ON p.id = m.product_id
        WHERE m.id = $1 AND p.id = $2 AND p.shop_id = $3`,
      [mediaId, productId, shopId],
    );
    if (!owns.rows[0]) return null;
    if (patch.isPrimary === true) {
      await client.query(
        `UPDATE public.product_media SET is_primary = false WHERE product_id = $1 AND is_primary AND id <> $2`,
        [productId, mediaId],
      );
    }
    const res = await client.query<MediaRow>(
      `UPDATE public.product_media
          SET is_primary = COALESCE($4, is_primary),
              display_order = COALESCE($5, display_order),
              alt_text = COALESCE($6, alt_text)
        WHERE id = $1 AND product_id = $2
        RETURNING id, storage_key, is_primary, display_order, alt_text`,
      [mediaId, productId, patch.isPrimary ?? null, patch.displayOrder ?? null, patch.altText ?? null],
    );
    const row = res.rows[0]!;
    return { id: row.id, url: row.storage_key, storageKey: row.storage_key, isPrimary: row.is_primary, displayOrder: row.display_order, altText: row.alt_text };
  });
}

/** Delete a media row, shop-scoped. Returns 'deleted' | 'not_found' | 'blocked' (last/primary of an
 *  active product cannot be removed). */
export async function deleteMedia(
  shopId: string,
  productId: string,
  mediaId: string,
): Promise<"deleted" | "not_found" | "blocked"> {
  return withTransaction(async (client) => {
    const row = await client.query<{ is_primary: boolean; status: ProductStatus; count: string }>(
      `SELECT m.is_primary, p.status,
              (SELECT count(*) FROM public.product_media WHERE product_id = p.id) AS count
         FROM public.product_media m
         JOIN public.product p ON p.id = m.product_id
        WHERE m.id = $1 AND p.id = $2 AND p.shop_id = $3`,
      [mediaId, productId, shopId],
    );
    const r = row.rows[0];
    if (!r) return "not_found";
    // An active product must keep at least one (primary) image.
    if (r.status === "active" && (r.is_primary || Number(r.count) <= 1)) return "blocked";
    await client.query(`DELETE FROM public.product_media WHERE id = $1`, [mediaId]);
    return "deleted";
  });
}

/** For publish validation: does the product have a primary image? */
export async function hasPrimaryImage(shopId: string, id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.product_media m JOIN public.product p ON p.id = m.product_id
        WHERE p.id = $1 AND p.shop_id = $2 AND m.is_primary) AS ok`,
    [id, shopId],
  );
  return res.rows[0]?.ok ?? false;
}

/** True when the product exists and belongs to this shop (ownership check before media writes). */
export async function productBelongsToShop(shopId: string, id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.product WHERE id = $1 AND shop_id = $2) AS ok`,
    [id, shopId],
  );
  return res.rows[0]?.ok ?? false;
}

/** Record an uploaded object. If flagged primary, demote the existing primary first (the partial
 *  unique index allows only one). Returns the new media row (url carries the storage KEY). */
export async function registerMedia(
  productId: string,
  m: { storageKey: string; isPrimary: boolean; altText: string | null; displayOrder: number },
): Promise<ProductMedia> {
  return withTransaction(async (client) => {
    if (m.isPrimary) {
      await client.query(
        `UPDATE public.product_media SET is_primary = false WHERE product_id = $1 AND is_primary`,
        [productId],
      );
    }
    const res = await client.query<MediaRow>(
      `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order, alt_text)
            VALUES ($1, $2, $3, $4, $5)
        RETURNING id, storage_key, is_primary, display_order, alt_text`,
      [productId, m.storageKey, m.isPrimary, m.displayOrder, m.altText],
    );
    const row = res.rows[0]!;
    return {
      id: row.id,
      url: row.storage_key,
      storageKey: row.storage_key,
      isPrimary: row.is_primary,
      displayOrder: row.display_order,
      altText: row.alt_text,
    };
  });
}

// ── List (backend search/filter/sort/pagination; shop-scoped) ──────────────────────────────────

interface ProductListRow {
  id: string;
  name: string;
  brand: string | null;
  primary_storage_key: string | null;
  type_name: string;
  category_name: string;
  price_amount: string;
  currency: string;
  status: ProductStatus;
  sku: string | null;
  updated_at: Date;
  total: string;
}

const SORT_COLUMNS: Record<ListParams["sort"], string> = {
  name: "p.name",
  price: "p.price_amount",
  recent: "p.created_at",
};

/** Shop-scoped, backend-paginated product list. `primaryImageUrl` carries the S3 KEY (service
 *  presigns it). `total` from `count(*) OVER()`. All filtering/sorting/pagination is server-side. */
export async function listProducts(shopId: string, params: ListParams): Promise<Paged<ProductListItem>> {
  const sortCol = SORT_COLUMNS[params.sort];
  const dir = params.order === "asc" ? "ASC" : "DESC";
  const res = await query<ProductListRow>(
    `SELECT p.id, p.name, p.brand,
            (SELECT storage_key FROM public.product_media m
              WHERE m.product_id = p.id AND m.is_primary LIMIT 1) AS primary_storage_key,
            pt.name AS type_name, c.name AS category_name,
            p.price_amount::text AS price_amount, p.currency, p.status, p.sku, p.updated_at,
            count(*) OVER() AS total
       FROM public.product p
       JOIN public.product_type pt ON pt.id = p.product_type_id
       JOIN public.category c ON c.id = p.primary_category_id
      WHERE p.shop_id = $1
        AND ($2::text IS NULL OR
             lower(p.name || ' ' || coalesce(p.sku, '') || ' ' || coalesce(p.brand, '') || ' ' || p.short_description)
               LIKE '%' || lower($2) || '%')
        AND ($3::uuid IS NULL OR p.product_type_id = $3)
        AND ($4::uuid IS NULL OR p.primary_category_id = $4)
        AND ($5::text IS NULL OR p.status = $5)
        AND ($6::numeric IS NULL OR p.price_amount >= $6)
        AND ($7::numeric IS NULL OR p.price_amount <= $7)
        AND ($8::uuid IS NULL OR EXISTS (
              SELECT 1 FROM public.product_section ps
               WHERE ps.product_id = p.id AND ps.shop_section_id = $8))
      ORDER BY ${sortCol} ${dir}
      LIMIT $9 OFFSET $10`,
    [
      shopId,
      params.q,
      params.type,
      params.category,
      params.status,
      params.priceMin,
      params.priceMax,
      params.section,
      params.pageSize,
      (params.page - 1) * params.pageSize,
    ],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return {
    items: res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      primaryImageUrl: r.primary_storage_key, // service replaces with a presigned url
      typeName: r.type_name,
      categoryName: r.category_name,
      priceAmount: r.price_amount,
      currency: r.currency,
      status: r.status,
      sku: r.sku,
      updatedAt: r.updated_at.toISOString(),
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

// ── Detail (shop-scoped) ────────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  shop_id: string;
  product_type_id: string;
  type_name: string;
  primary_category_id: string;
  category_name: string;
  name: string;
  sku: string | null;
  gtin: string | null;
  brand: string | null;
  price_amount: string;
  currency: string;
  compare_at_amount: string | null;
  short_description: string;
  long_description: string | null;
  status: ProductStatus;
  created_at: Date;
  updated_at: Date;
}

interface AttrValueRow {
  attribute_definition_id: string;
  key: string;
  name: string;
  data_type: AttributeDataType;
  unit: string | null;
  value_text: string | null;
  value_number: string | null;
  value_boolean: boolean | null;
  value_options: string[] | null;
}

interface MediaRow {
  id: string;
  storage_key: string;
  is_primary: boolean;
  display_order: number;
  alt_text: string | null;
}

/** Full detail, shop-scoped (404 if not this shop's). `media[].url` carries the S3 KEY (service
 *  presigns). `missingMandatoryAttributes` (FR-020a) = mandatory attributes of the type the product
 *  has no value for — a non-blocking schema-drift notice. */
export async function getProductDetail(shopId: string, id: string): Promise<ProductDetail | null> {
  const res = await query<ProductRow>(
    `SELECT p.id, p.shop_id, p.product_type_id, pt.name AS type_name,
            p.primary_category_id, c.name AS category_name,
            p.name, p.sku, p.gtin, p.brand,
            p.price_amount::text AS price_amount, p.currency,
            p.compare_at_amount::text AS compare_at_amount,
            p.short_description, p.long_description, p.status, p.created_at, p.updated_at
       FROM public.product p
       JOIN public.product_type pt ON pt.id = p.product_type_id
       JOIN public.category c ON c.id = p.primary_category_id
      WHERE p.id = $1 AND p.shop_id = $2`,
    [id, shopId],
  );
  const row = res.rows[0];
  if (!row) return null;

  const attrs = await query<AttrValueRow>(
    `SELECT pav.attribute_definition_id, ad.key, ad.name, ad.data_type, ad.unit,
            pav.value_text, pav.value_number::text AS value_number, pav.value_boolean, pav.value_options
       FROM public.product_attribute_value pav
       JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
      WHERE pav.product_id = $1
      ORDER BY ad.name`,
    [id],
  );
  const media = await query<MediaRow>(
    `SELECT id, storage_key, is_primary, display_order, alt_text
       FROM public.product_media WHERE product_id = $1 ORDER BY is_primary DESC, display_order`,
    [id],
  );
  const sections = await query<{ name: string }>(
    `SELECT s.name FROM public.product_section ps
       JOIN public.shop_section s ON s.id = ps.shop_section_id
      WHERE ps.product_id = $1 ORDER BY s.display_order, s.name`,
    [id],
  );
  const missing = await query<{ name: string }>(
    `SELECT ad.name
       FROM public.product_type_attribute pta
       JOIN public.attribute_definition ad ON ad.id = pta.attribute_definition_id
      WHERE pta.product_type_id = $1 AND pta.is_mandatory = true
        AND NOT EXISTS (
          SELECT 1 FROM public.product_attribute_value pav
           WHERE pav.product_id = $2 AND pav.attribute_definition_id = pta.attribute_definition_id)
      ORDER BY ad.name`,
    [row.product_type_id, id],
  );

  const attributes: ProductAttributeValue[] = attrs.rows.map((a) => ({
    attributeId: a.attribute_definition_id,
    key: a.key,
    name: a.name,
    dataType: a.data_type,
    unit: a.unit,
    valueText: a.value_text,
    valueNumber: a.value_number !== null ? Number(a.value_number) : null,
    valueBoolean: a.value_boolean,
    valueOptions: a.value_options,
  }));
  const mediaOut: ProductMedia[] = media.rows.map((m) => ({
    id: m.id,
    url: m.storage_key, // service replaces with a presigned url
    storageKey: m.storage_key,
    isPrimary: m.is_primary,
    displayOrder: m.display_order,
    altText: m.alt_text,
  }));

  return {
    id: row.id,
    shopId: row.shop_id,
    productTypeId: row.product_type_id,
    typeName: row.type_name,
    primaryCategoryId: row.primary_category_id,
    categoryName: row.category_name,
    name: row.name,
    sku: row.sku,
    gtin: row.gtin,
    brand: row.brand,
    priceAmount: row.price_amount,
    currency: row.currency,
    compareAtAmount: row.compare_at_amount,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    status: row.status,
    attributes,
    media: mediaOut,
    sections: sections.rows.map((s) => s.name),
    missingMandatoryAttributes: missing.rows.map((m) => m.name),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
