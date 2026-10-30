// Every product query is scoped `where shop_id =:actorShopId` (the authz-resolved value). Returns
// storage keys; the service swaps them for presigned URLs before the DTO leaves the process.
import { likePattern, limitOffsetClause, orderBy, query, runOffsetPage, withTransaction, type Queryable } from "@effy/edge-shared";

import { SHOP_FROM_PRICE, SHOP_PRODUCT_LIST, type ShopProductListRequest } from "./list";
import {
  applyVariantSet, DetailsInvalid, insertProduct, type LeafCheck, missingRequired, readProductDetails, readResolved, readVariantSets, reconcileDetails,
  VariantSetInvalid, writeProductDetails,
} from "@effy/edge-shared/catalog";
import { setGstStatus } from "@effy/edge-shared/documents";
import type {
  CategoryIcon, DetailInput, GstStatus, OptionInputDTO, ShopTaxonomyDTO, Storage, UnitBasis, VariantInputDTO,
} from "@effy/shared-types";

import {
  type CreateProductInput,
  type ProductDetail,
  ProductError,
  type ProductListItem,
  type ProductMedia,
  type ProductStatus,
  type ShopReviewState,
} from "./types";

function asConflict(err: unknown, message: string): ProductError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new ProductError("conflict", message);
  }
  throw err;
}

/** The one writers refused the option/variant set or the details; each refusal points at its input. */
function asWriterError(err: unknown): never {
  if (err instanceof VariantSetInvalid) throw new ProductError("validation", "the sizes and options are not valid", err.errors);
  if (err instanceof DetailsInvalid) throw new ProductError("validation", "the details are not valid", err.errors);
  throw err;
}

/** Every active category for the shop's picker, and the leaves this shop used most recently (101). */
export async function readShopTaxonomy(shopId: string): Promise<ShopTaxonomyDTO> {
  const [categories, recent] = await Promise.all([
    query<{ id: string; parent_id: string | null; name: string; path: string[]; is_leaf: boolean; synonyms: string[]; icon: CategoryIcon | null }>(
      `SELECT c.id::text, c.parent_id::text, c.name, r.path_names AS path, r.is_leaf, c.synonyms, c.icon
         FROM public.category c
         JOIN public.category_resolved r ON r.category_id = c.id
        ORDER BY r.depth, c."position", c.name`,
    ),
    query<{ id: string }>(
      `SELECT x.id FROM (
         SELECT p.primary_category_id::text AS id, max(p.updated_at) AS at
           FROM public.product p
           JOIN public.category_resolved r ON r.category_id = p.primary_category_id AND r.is_leaf
          WHERE p.shop_id = $1
          GROUP BY p.primary_category_id) x
        ORDER BY x.at DESC LIMIT 5`,
      [shopId],
    ),
  ]);
  return {
    categories: categories.rows.map((c) => ({
      id: c.id, parentId: c.parent_id, name: c.name, path: c.path, isLeaf: c.is_leaf, synonyms: c.synonyms, icon: c.icon,
    })),
    recentLeafIds: recent.rows.map((r) => r.id),
  };
}

export type { LeafCheck };

/** An active category, and whether a product may be filed in it (only a leaf). */
export async function checkLeaf(categoryId: string, db: Queryable = { query }): Promise<LeafCheck> {
  const resolved = await readResolved(db, categoryId).catch(() => null);
  if (!resolved) return { kind: "unknown" };
  if (!resolved.isLeaf) return { kind: "not_leaf" };
  return { kind: "leaf", defaults: resolved.defaults };
}

/** One transaction through the one writer (`authoring.ts`). A duplicate SKU is 409. */
export async function createProduct(
  shopId: string,
  input: CreateProductInput,
  createdBy: string,
): Promise<string> {
  return withTransaction(async (client) => {
    try {
      return await insertProduct(client, shopId, input, { kind: "shop", sub: createdBy });
    } catch (err) {
      if (err instanceof VariantSetInvalid || err instanceof DetailsInvalid) asWriterError(err);
      throw asConflict(err, "this product could not be created");
    }
  });
}

/**
 * A draft, under `WHERE id AND shop_id AND updated_at = expectedUpdatedAt`; zero rows is "stale". The token is
 * compared with millisecond truncation (`date_trunc`), since the driver returns ms-precision Dates. Returns the
 * details that no longer had a place (a new leaf, or one variant left).
 */
export async function updateProduct(
  shopId: string,
  id: string,
  expectedUpdatedAt: string,
  values: {
    name: string;
    primaryCategoryId: string;
    brand: string | null;
    shortDescription: string;
    longDescription: string | null;
    gstStatus: GstStatus;
    storage: Storage;
    ageRestricted: boolean;
    /** undefined leaves it as it stands. */
    unitBasis: UnitBasis | null | undefined;
    /** Both or neither; null leaves them as they stand. */
    variantSet: { options: OptionInputDTO[]; variants: VariantInputDTO[] } | null;
    /** The complete set; null leaves them as they stand. */
    details: DetailInput[] | null;
  },
  actorSub: string,
): Promise<{ outcome: "updated"; droppedDetails: string[] } | { outcome: "stale" }> {
  return withTransaction(async (client) => {
    const before = await client.query<{ leaf: string }>(
      `SELECT primary_category_id::text AS leaf FROM public.product WHERE id = $1 AND shop_id = $2`,
      [id, shopId],
    );
    let res;
    try {
      res = await client.query<{ id: string }>(
        `UPDATE public.product SET
             name = $3, primary_category_id = $4, brand = $5, short_description = $6, long_description = $7,
             storage = $8, age_restricted = $9, updated_at = now()
          WHERE id = $1 AND shop_id = $2
            -- ⚠ The guard is IN the statement: even a caller that skipped the service cannot write
            -- an approved product's live details from here.
            AND approved_at IS NULL
            AND date_trunc('milliseconds', updated_at) = $10::timestamptz
          RETURNING id`,
        [
          id, shopId, values.name, values.primaryCategoryId, values.brand, values.shortDescription,
          values.longDescription, values.storage, values.ageRestricted, expectedUpdatedAt,
        ],
      );
    } catch (err) {
      throw asConflict(err, "this product could not be saved");
    }
    if (res.rowCount === 0) return { outcome: "stale" };
    await setGstStatus(client, id, values.gstStatus, { kind: "shop_staff", sub: actorSub }, "direct");

    const dropped: string[] = [];
    // A new leaf: every detail it does not ask for goes, hidden ones included (FR-024).
    if (before.rows[0]?.leaf !== values.primaryCategoryId) dropped.push(...(await reconcileDetails(client, id, { dropHidden: true })));

    // A draft's variants are written as they are, through the one writer.
    if (values.variantSet) {
      const r = await applyVariantSet(client, {
        productId: id, shopId, options: values.variantSet.options, variants: values.variantSet.variants,
        unitBasis: values.unitBasis, mode: "draft",
      }).catch(asWriterError);
      dropped.push(...r.droppedDetails);
    } else if (values.unitBasis !== undefined) {
      // A basis alone must still agree with the variants' pack units.
      const current = (await readVariantSets(client, [id])).get(id)!;
      await applyVariantSet(client, {
        productId: id, shopId, unitBasis: values.unitBasis, mode: "draft",
        options: current.options.map((o) => ({
          id: o.id, position: o.position, attributeId: o.attributeId,
          values: o.values.map((v) => ({ id: v.id, allowedValueId: v.allowedValueId, position: v.position })),
        })),
        variants: current.variants.filter((v) => v.state !== "removed").map((v) => ({
          id: v.id, position: v.position, optionValueIds: v.optionValueIds, sku: v.sku, gtin: v.gtin,
          shopPriceAmount: v.shopPriceAmount, shopCompareAtAmount: v.shopCompareAtAmount,
          weightGrams: v.weightIsAssumed ? null : v.weightGrams, packQuantity: v.packQuantity, packUnit: v.packUnit,
          mediaStorageKey: v.mediaStorageKey,
        })),
      }).catch(asWriterError);
    }
    if (values.details) await writeProductDetails(client, id, values.details).catch(asWriterError);
    return { outcome: "updated", droppedDetails: [...new Set(dropped)] };
  });
}

/** false if not this shop's. `→ active` needs an approval, here as in the service and the check. */
export async function changeStatus(shopId: string, id: string, status: ProductStatus): Promise<boolean> {
  const res = await query<{ id: string }>(
    `UPDATE public.product SET status = $3, updated_at = now()
      WHERE id = $1 AND shop_id = $2
        AND ($3 <> 'active' OR approved_at IS NOT NULL)
        -- Effy's hold and Effy's unfinished product are not the shop's to change (102).
        AND held_at IS NULL AND content_owner = 'shop'
      RETURNING id`,
    [id, shopId, status],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Effy's hold as the shop sees it: the reason and when, never who (102). */
function holdOf(r: { held_reason: string | null; held_at: Date | null }): { reason: string; heldAt: string } | null {
  return r.held_at && r.held_reason ? { reason: r.held_reason, heldAt: r.held_at.toISOString() } : null;
}

/** From two facts: ever approved, and something waiting. Needs `p` and a left join `product_change pc`. */
export const REVIEW_STATE_SQL = `CASE
    WHEN p.content_owner = 'effy' THEN 'effy_setup'
    WHEN p.approved_at IS NULL THEN
      CASE p.review_state WHEN 'in_review' THEN 'in_review' WHEN 'sent_back' THEN 'sent_back' ELSE 'draft' END
    WHEN pc.state = 'in_review' THEN 'live_change_pending'
    WHEN pc.state = 'sent_back' THEN 'live_change_sent_back'
    ELSE 'live'
  END`;

export interface ReviewFacts {
  approved: boolean;
  reviewState: "none" | "in_review" | "sent_back";
  status: ProductStatus;
  /** Effy holds it off sale (102): the shop cannot change its status. */
  held: boolean;
  /** Effy is still finishing a product it created (102): the shop cannot change it yet. */
  effyOwned: boolean;
}

export async function reviewFacts(shopId: string, id: string): Promise<ReviewFacts | null> {
  const res = await query<{ approved: boolean; review_state: ReviewFacts["reviewState"]; status: ProductStatus; held: boolean; effy_owned: boolean }>(
    `SELECT approved_at IS NOT NULL AS approved, review_state, status,
            held_at IS NOT NULL AS held, content_owner = 'effy' AS effy_owned
       FROM public.product WHERE id = $1 AND shop_id = $2`,
    [id, shopId],
  );
  const r = res.rows[0];
  return r
    ? { approved: r.approved, reviewState: r.review_state, status: r.status, held: r.held, effyOwned: r.effy_owned }
    : null;
}

/** Bumps the version so a photo swapped after the reviewer looked invalidates their decision. */
export async function touchProduct(shopId: string, id: string): Promise<void> {
  await query(`UPDATE public.product SET updated_at = now() WHERE id = $1 AND shop_id = $2`, [id, shopId]);
}

/** false if not this shop's, or already approved. */
export async function submitForReview(shopId: string, id: string): Promise<boolean> {
  const res = await query(
    `UPDATE public.product
        SET review_state = 'in_review', review_reason = NULL, submitted_at = now(), updated_at = now()
      WHERE id = $1 AND shop_id = $2 AND approved_at IS NULL`,
    [id, shopId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** A sent-back product keeps its reason. */
export async function withdrawSubmission(shopId: string, id: string): Promise<boolean> {
  const res = await query(
    `UPDATE public.product
        SET review_state = 'none', submitted_at = NULL, updated_at = now()
      WHERE id = $1 AND shop_id = $2 AND approved_at IS NULL AND review_state = 'in_review'`,
    [id, shopId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Only a draft may be removed (409: archive instead). */
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

/** Replace-all. */
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
      // A section must belong to this shop, else it is skipped.
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

/** The last or primary image of an active product cannot be removed. */
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
    if (r.status === "active" && (r.is_primary || Number(r.count) <= 1)) return "blocked";
    await client.query(`DELETE FROM public.product_media WHERE id = $1`, [mediaId]);
    return "deleted";
  });
}

export async function hasPrimaryImage(shopId: string, id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.product_media m JOIN public.product p ON p.id = m.product_id
        WHERE p.id = $1 AND p.shop_id = $2 AND m.is_primary) AS ok`,
    [id, shopId],
  );
  return res.rows[0]?.ok ?? false;
}

export async function productBelongsToShop(shopId: string, id: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.product WHERE id = $1 AND shop_id = $2) AS ok`,
    [id, shopId],
  );
  return res.rows[0]?.ok ?? false;
}

/** A new primary demotes the existing one first (one per product). `url` carries the key. */
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

interface ProductListRow {
  id: string;
  name: string;
  brand: string | null;
  primary_storage_key: string | null;
  category_name: string;
  price_amount: string | null;
  customer_price_amount: string | null;
  price_varies: boolean;
  variant_count: number;
  missing_required: number;
  review_state_shown: ShopReviewState;
  held_reason: string | null;
  held_at: Date | null;
  created_via: "shop" | "effy" | "import";
  currency: string;
  status: ProductStatus;
  updated_at: Date;
}

/** Server-side filtering, sorting and paging (103); the total from `count(*) over`. */
export async function listProducts(shopId: string, req: ShopProductListRequest): Promise<{ items: ProductListItem[]; total: number; page: number }> {
  const f = req.filters;
  const r = await runOffsetPage(req, async (read) => {
  const args: unknown[] = [
      shopId,
      req.q ? likePattern(req.q) : null,
      f.missing ?? false,
      f.category ?? null,
      f.status ?? null,
      f.priceMin ?? null,
      f.priceMax ?? null,
      f.section ?? null,
      f.reviewState ?? null,
      req.q,
    ];
  const paging = limitOffsetClause(read, args);
  const res = await query<ProductListRow & { full_count: string }>(
    `SELECT p.id, p.name, p.brand,
            (SELECT storage_key FROM public.product_media m
              WHERE m.product_id = p.id AND m.is_primary LIMIT 1) AS primary_storage_key,
            c.name AS category_name,
            -- A shop is shown what IT is paid; the customer's price rides beside it. The cheapest
            -- active variant's, with "From" when they differ.
            ${SHOP_FROM_PRICE}::text AS price_amount,
            p.list_price_amount::text AS customer_price_amount,
            (SELECT count(DISTINCT v.shop_price_amount) > 1 FROM public.product_variant v
              WHERE v.product_id = p.id AND v.state = 'active') AS price_varies,
            (SELECT count(*)::int FROM public.product_variant v
              WHERE v.product_id = p.id AND v.state <> 'removed') AS variant_count,
            (SELECT count(*)::int FROM public.product_missing_required(p.id)) AS missing_required,
            ${REVIEW_STATE_SQL} AS review_state_shown,
            p.held_reason, p.held_at, p.created_via,
            p.currency, p.status, p.updated_at,
            count(*) OVER() AS full_count
       FROM public.product p
       JOIN public.category c ON c.id = p.primary_category_id
       LEFT JOIN public.product_change pc ON pc.product_id = p.id
      WHERE p.shop_id = $1
        AND ($9::text IS NULL OR ${REVIEW_STATE_SQL} = $9)
        AND ($2::text IS NULL OR
             lower(p.name || ' ' || coalesce(p.brand, '') || ' ' || p.short_description) LIKE lower($2)
             -- A variant's stock code or barcode finds its product.
             OR EXISTS (SELECT 1 FROM public.product_variant sv
                         WHERE sv.product_id = p.id AND sv.state <> 'removed'
                           AND (sv.sku ILIKE $2 OR sv.gtin = $10 OR sv.code = upper($10))))
        AND (NOT $3::boolean OR EXISTS (SELECT 1 FROM public.product_missing_required(p.id)))
        AND ($4::uuid IS NULL OR p.primary_category_id IN (SELECT ca.category_id FROM public.category_ancestor ca WHERE ca.ancestor_id = $4))
        AND ($5::text IS NULL OR p.status = $5)
        AND ($6::numeric IS NULL OR ${SHOP_FROM_PRICE} >= $6)
        AND ($7::numeric IS NULL OR ${SHOP_FROM_PRICE} <= $7)
        AND ($8::uuid IS NULL OR EXISTS (
              SELECT 1 FROM public.product_section ps
               WHERE ps.product_id = p.id AND ps.shop_section_id = $8))
      ${orderBy(SHOP_PRODUCT_LIST, req)}
      ${paging}`,
    args,
  );
  return res.rows;
  });
  return {
    items: r.rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      primaryImageUrl: r.primary_storage_key,
      categoryName: r.category_name,
      priceAmount: r.price_amount ?? "0.00",
      currency: r.currency,
      status: r.status,
      updatedAt: r.updated_at.toISOString(),
      reviewState: r.review_state_shown,
      customerPriceAmount: r.customer_price_amount,
      priceVaries: r.price_varies === true,
      variantCount: Number(r.variant_count),
      missingRequired: Number(r.missing_required),
      hold: holdOf(r),
      createdBy: r.created_via === "shop" ? "shop" : "effy",
    })),
    total: r.total,
    page: r.page,
  };
}

interface ProductRow {
  id: string;
  shop_id: string;
  primary_category_id: string;
  category_name: string;
  category_path: string[] | null;
  name: string;
  brand: string | null;
  currency: string;
  short_description: string;
  long_description: string | null;
  gst_status: GstStatus;
  storage: Storage;
  age_restricted: boolean;
  default_storage: Storage | null;
  default_gst_status: GstStatus | null;
  default_age_restricted: boolean | null;
  unit_basis: UnitBasis | null;
  shop_default_threshold: number | null;
  status: ProductStatus;
  created_at: Date;
  updated_at: Date;
  review_state_shown: ShopReviewState;
  held_reason: string | null;
  held_at: Date | null;
  created_via: "shop" | "effy" | "import";
  review_reason: string | null;
  approved: boolean;
}

interface MediaRow {
  id: string;
  storage_key: string;
  is_primary: boolean;
  display_order: number;
  alt_text: string | null;
}

/** null if not this shop's. */
export async function getProductDetail(shopId: string, id: string): Promise<ProductDetail | null> {
  const res = await query<ProductRow>(
    `SELECT p.id, p.shop_id, p.primary_category_id::text AS primary_category_id, c.name AS category_name,
            r.path_names AS category_path,
            -- Named columns only — never p.*, which would carry Effy's margin to a shop (a guard
            -- test fails on it). Prices, codes, weight and stock are read per VARIANT below.
            p.name, p.brand, p.currency,
            p.short_description, p.long_description,
            p.gst_status, p.storage, p.age_restricted,
            r.storage AS default_storage, r.gst_status AS default_gst_status, r.age_restricted AS default_age_restricted,
            p.unit_basis,
            (SELECT default_low_stock_threshold FROM public.shop_stock_settings WHERE shop_id = p.shop_id) AS shop_default_threshold,
            p.status,
            p.created_at, p.updated_at,
            ${REVIEW_STATE_SQL} AS review_state_shown,
            p.held_reason, p.held_at, p.created_via,
            COALESCE(pc.reason, p.review_reason) AS review_reason,
            p.approved_at IS NOT NULL AS approved
       FROM public.product p
       JOIN public.category c ON c.id = p.primary_category_id
       LEFT JOIN public.category_resolved r ON r.category_id = p.primary_category_id
       LEFT JOIN public.product_change pc ON pc.product_id = p.id
      WHERE p.id = $1 AND p.shop_id = $2`,
    [id, shopId],
  );
  const row = res.rows[0];
  if (!row) return null;

  const db: Queryable = { query };
  const [media, variantSets, sections, details, missing] = await Promise.all([
    query<MediaRow>(
      `SELECT id, storage_key, is_primary, display_order, alt_text
         FROM public.product_media WHERE product_id = $1 ORDER BY is_primary DESC, display_order`,
      [id],
    ),
    readVariantSets(db, [id]),
    query<{ name: string }>(
      `SELECT s.name FROM public.product_section ps
         JOIN public.shop_section s ON s.id = ps.shop_section_id
        WHERE ps.product_id = $1 ORDER BY s.display_order, s.name`,
      [id],
    ),
    readProductDetails(db, [id], { excludeOptions: true }),
    missingRequired(db, [id]),
  ]);
  const variantSet = variantSets.get(id)!;

  const mediaOut: ProductMedia[] = media.rows.map((m) => ({
    id: m.id,
    url: m.storage_key,
    storageKey: m.storage_key,
    isPrimary: m.is_primary,
    displayOrder: m.display_order,
    altText: m.alt_text,
  }));

  return {
    id: row.id,
    shopId: row.shop_id,
    primaryCategoryId: row.primary_category_id,
    categoryName: row.category_name,
    categoryPath: row.category_path ?? [row.category_name],
    name: row.name,
    brand: row.brand,
    currency: row.currency,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    gstStatus: row.gst_status,
    storage: row.storage,
    ageRestricted: row.age_restricted,
    factDefaults: { storage: row.default_storage, gstStatus: row.default_gst_status, ageRestricted: row.default_age_restricted },
    unitBasis: row.unit_basis,
    options: variantSet.options,
    variants: variantSet.variants,
    shopDefaultThreshold: row.shop_default_threshold === null ? null : Number(row.shop_default_threshold),
    status: row.status,
    details: details.get(id) ?? [],
    media: mediaOut,
    sections: sections.rows.map((s) => s.name),
    missingRequired: missing.get(id) ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewState: row.review_state_shown,
    hold: holdOf(row),
    createdBy: row.created_via === "shop" ? "shop" : "effy",
    reviewReason: row.review_reason,
    approved: row.approved,
    // Filled by the service from./change.ts; the live product is always the approved one.
    pendingChange: null,
  };
}
