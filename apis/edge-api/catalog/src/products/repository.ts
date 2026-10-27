// Every shop's products for back-office (102). One expression decides a product's back-office state, and
// the list, its counts and the product page all read it. Writes take the product's version
// (`updated_at::text`), as review does.

import type pg from "pg";

import { LOW_STOCK_PREDICATE, query } from "@effy/edge-shared";
import type { BackOfficeProductSort, BackOfficeProductState, Storage } from "@effy/shared-types";

/** Needs `p` (product) and a left join `pc` (product_change). Precedence: a hold says the most. */
export const BACKOFFICE_STATE_SQL = `CASE
    WHEN p.held_at IS NOT NULL THEN 'held'
    WHEN p.status = 'archived' THEN 'archived'
    WHEN p.approved_at IS NULL AND p.review_state = 'in_review' THEN 'in_review'
    WHEN pc.state = 'in_review' THEN 'change_pending'
    WHEN p.approved_at IS NULL OR p.content_owner = 'effy' THEN 'draft'
    WHEN p.status = 'active' THEN 'on_sale'
    ELSE 'off_sale'
  END`;

export interface ListFilters {
  q: string | null;
  shopId: string | null;
  categoryId: string | null;
  storage: Storage | null;
  margin: "set" | "not_set" | null;
  missingDetails: boolean;
  lowStock: boolean;
}

/** $1 q · $2 shop · $3 category (with its descendants) · $4 storage · $5 margin · $6 missing details · $7 low stock. */
const FILTERED = `
  SELECT p.id, ${BACKOFFICE_STATE_SQL} AS state
    FROM public.product p
    LEFT JOIN public.product_change pc ON pc.product_id = p.id
   WHERE ($1::text IS NULL
          -- The same expression as product_search_trgm_idx, so the index serves it.
          OR lower(p.name || ' ' || COALESCE(p.brand, '') || ' ' || p.short_description) LIKE '%' || lower($1) || '%'
          -- A size's stock code, barcode or Effy code finds its product, once.
          OR EXISTS (SELECT 1 FROM public.product_variant sv
                      WHERE sv.product_id = p.id AND sv.state <> 'removed'
                        AND (lower(sv.sku) = lower($1) OR sv.gtin = $1 OR sv.code = upper($1))))
     AND ($2::uuid IS NULL OR p.shop_id = $2)
     AND ($3::uuid IS NULL OR p.primary_category_id IN
          (SELECT ca.category_id FROM public.category_ancestor ca WHERE ca.ancestor_id = $3))
     AND ($4::text IS NULL OR p.storage = $4)
     AND ($5::text IS NULL OR ($5 = 'set') = (p.margin_kind IS NOT NULL))
     AND (NOT $6::boolean OR EXISTS (SELECT 1 FROM public.product_missing_required(p.id)))
     AND (NOT $7::boolean OR EXISTS (
          SELECT 1 FROM public.product_variant v
            LEFT JOIN public.shop_stock_settings s ON s.shop_id = v.shop_id
           WHERE v.product_id = p.id AND ${LOW_STOCK_PREDICATE}))
`;

const filterParams = (f: ListFilters): unknown[] => [
  f.q, f.shopId, f.categoryId, f.storage, f.margin, f.missingDetails, f.lowStock,
];

const SORTS: Record<BackOfficeProductSort, { col: string; defaultDir: "ASC" | "DESC" }> = {
  updated: { col: "p.updated_at", defaultDir: "DESC" },
  name: { col: "lower(p.name)", defaultDir: "ASC" },
  // The customer's "from" price (the listing summary); never-approved products have none and sort last.
  price: { col: "p.list_price_amount", defaultDir: "ASC" },
  shop: { col: "lower(sh.name)", defaultDir: "ASC" },
};

export interface ListRow {
  id: string;
  name: string;
  brand: string | null;
  primary_storage_key: string | null;
  shop_id: string;
  shop_name: string;
  shop_status: string;
  category_path: string[] | null;
  variant_count: number;
  shop_price_from: string | null;
  customer_price_from: string | null;
  price_varies: boolean;
  margin_kind: "percent" | "amount" | null;
  margin_value: string | null;
  state: BackOfficeProductState;
  created_via: "shop" | "effy" | "import";
  content_owner: "shop" | "effy";
  low_stock: boolean;
  missing_required: number;
  updated_at: Date;
  version: string;
}

export async function listProducts(
  f: ListFilters,
  state: BackOfficeProductState | null,
  sort: BackOfficeProductSort,
  dir: "asc" | "desc" | null,
  offset: number,
  limit: number,
): Promise<ListRow[]> {
  const s = SORTS[sort];
  const d = dir === null ? s.defaultDir : dir === "asc" ? "ASC" : "DESC";
  const res = await query<ListRow>(
    `WITH f AS (${FILTERED})
     SELECT p.id::text, p.name, p.brand,
            (SELECT m.storage_key FROM public.product_media m
              WHERE m.product_id = p.id AND m.is_primary LIMIT 1) AS primary_storage_key,
            p.shop_id::text, sh.name AS shop_name, sh.status AS shop_status,
            r.path_names AS category_path,
            agg.variant_count, agg.shop_price_from, agg.customer_price_from,
            COALESCE(agg.price_varies, false) AS price_varies,
            p.margin_kind, p.margin_value::text AS margin_value,
            f.state, p.created_via, p.content_owner,
            EXISTS (SELECT 1 FROM public.product_variant v
                      LEFT JOIN public.shop_stock_settings s ON s.shop_id = v.shop_id
                     WHERE v.product_id = p.id AND ${LOW_STOCK_PREDICATE}) AS low_stock,
            (SELECT count(DISTINCT x.attribute_id)::int FROM public.product_missing_required(p.id) x) AS missing_required,
            p.updated_at, p.updated_at::text AS version
       FROM f
       JOIN public.product p ON p.id = f.id
       -- \`sh\`: LOW_STOCK_PREDICATE names the stock settings \`s\`.
       JOIN public.shop sh ON sh.id = p.shop_id
       LEFT JOIN public.category_resolved r ON r.category_id = p.primary_category_id
       CROSS JOIN LATERAL (
         SELECT count(*) FILTER (WHERE v.state <> 'removed')::int AS variant_count,
                min(v.shop_price_amount) FILTER (WHERE v.state = 'active')::text AS shop_price_from,
                min(v.price_amount) FILTER (WHERE v.state = 'active')::text AS customer_price_from,
                count(DISTINCT v.shop_price_amount) FILTER (WHERE v.state = 'active') > 1 AS price_varies
           FROM public.product_variant v WHERE v.product_id = p.id
       ) agg
      WHERE ($8::text IS NULL OR f.state = $8)
      ORDER BY ${s.col} ${d} NULLS LAST, p.id ${d}
      LIMIT $9 OFFSET $10`,
    [...filterParams(f), state, limit, offset],
  );
  return res.rows;
}

/** Every state's count under the same filters; the tab itself is not a filter here. */
export async function countProducts(f: ListFilters): Promise<Map<BackOfficeProductState, number>> {
  const res = await query<{ state: BackOfficeProductState; n: string }>(
    `WITH f AS (${FILTERED}) SELECT state, count(*)::text AS n FROM f GROUP BY state`,
    filterParams(f),
  );
  return new Map(res.rows.map((r) => [r.state, Number(r.n)]));
}

/** What 102 adds to review's read of one product. */
export interface ProductExtraRow {
  state: BackOfficeProductState;
  held_at: Date | null;
  held_reason: string | null;
  held_by_name: string | null;
  content_owner: "shop" | "effy";
  created_via: "shop" | "effy" | "import";
  import_id: string | null;
  import_file_name: string | null;
  change_state: "in_review" | "sent_back" | null;
  review_state: "none" | "in_review" | "sent_back";
  approved: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

type Runner = { query: pg.PoolClient["query"] } | null;

async function run<T extends pg.QueryResultRow>(tx: Runner, sql: string, params: unknown[]): Promise<pg.QueryResult<T>> {
  return tx ? (tx.query(sql, params as never[]) as unknown as Promise<pg.QueryResult<T>>) : query<T>(sql, params);
}

export async function readExtra(productId: string, tx: Runner = null): Promise<ProductExtraRow | null> {
  const res = await run<ProductExtraRow>(
    tx,
    `SELECT ${BACKOFFICE_STATE_SQL} AS state,
            p.held_at, p.held_reason, COALESCE(st.name, st.email) AS held_by_name,
            p.content_owner, p.created_via, p.import_id::text AS import_id, i.file_name AS import_file_name,
            pc.state AS change_state, p.review_state, p.approved_at IS NOT NULL AS approved,
            p.created_at, p.updated_at, p.created_by
       FROM public.product p
       LEFT JOIN public.product_change pc ON pc.product_id = p.id
       LEFT JOIN public.product_import i ON i.id = p.import_id
       LEFT JOIN admin.staff st ON st.cognito_sub = p.held_by
      WHERE p.id = $1`,
    [productId],
  );
  return res.rows[0] ?? null;
}

export interface HistoryRow {
  action: string;
  detail: Record<string, unknown>;
  created_at: Date;
  actor_name: string | null;
}

/** Staff decisions on the product, newest first. The shop's own edits are not audited here. */
export async function readHistory(productId: string): Promise<HistoryRow[]> {
  const res = await query<HistoryRow>(
    `SELECT a.action, a.detail, a.created_at, COALESCE(st.name, st.email) AS actor_name
       FROM admin.audit_log a
       LEFT JOIN admin.staff st ON st.cognito_sub = a.actor_sub
      WHERE a.target_type = 'product' AND a.target_id = $1
      ORDER BY a.created_at DESC
      LIMIT 200`,
    [productId],
  );
  return res.rows;
}

export interface VariantStockRow {
  id: string;
  stock_tracked: boolean;
  stock_on_hand: number | null;
  low_stock_threshold: number | null;
}

export async function readVariantStock(productId: string): Promise<VariantStockRow[]> {
  const res = await query<VariantStockRow>(
    `SELECT id::text, stock_tracked, stock_on_hand, low_stock_threshold
       FROM public.product_variant WHERE product_id = $1`,
    [productId],
  );
  return res.rows;
}

// ── Holds (102) ──────────────────────────────────────────────────────────────────────────────────────

export type ProductAuditAction =
  | "product.held"
  | "product.released"
  | "product.created_by_effy"
  | "product.effy_edited"
  | "product.effy_completed"
  | "product.variant_state_set";

/** Who decided is stored only here; a shop sees Effy, never a person. */
export async function audit(
  tx: pg.PoolClient,
  actorSub: string,
  action: ProductAuditAction,
  productId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
     VALUES ($1, $2, 'product', $3, $4::jsonb)`,
    [actorSub, action, productId, JSON.stringify(detail)],
  );
}

export interface LockedProduct {
  id: string;
  shop_id: string;
  shop_status: string;
  status: "draft" | "active" | "unavailable" | "archived";
  approved: boolean;
  held: boolean;
  held_prior_status: "draft" | "active" | "unavailable" | null;
  has_primary_image: boolean;
  version: string;
}

/** The product under a row lock, with what a hold or release needs to decide. */
export async function lockProduct(tx: pg.PoolClient, productId: string): Promise<LockedProduct | null> {
  const res = await tx.query<LockedProduct>(
    `SELECT p.id::text, p.shop_id::text, s.status AS shop_status, p.status, p.approved_at IS NOT NULL AS approved,
            p.held_at IS NOT NULL AS held, p.held_prior_status,
            EXISTS (SELECT 1 FROM public.product_media m WHERE m.product_id = p.id AND m.is_primary) AS has_primary_image,
            p.updated_at::text AS version
       FROM public.product p
       JOIN public.shop s ON s.id = p.shop_id
      WHERE p.id = $1
        FOR UPDATE OF p`,
    [productId],
  );
  return res.rows[0] ?? null;
}

export async function writeHold(tx: pg.PoolClient, productId: string, sub: string, reason: string): Promise<void> {
  await tx.query(
    `UPDATE public.product
        SET held_at = now(), held_by = $2, held_reason = $3, held_prior_status = status,
            status = CASE WHEN status = 'active' THEN 'unavailable' ELSE status END,
            updated_at = now()
      WHERE id = $1`,
    [productId, sub, reason],
  );
}

export async function writeRelease(
  tx: pg.PoolClient,
  productId: string,
  to: "draft" | "active" | "unavailable",
): Promise<void> {
  await tx.query(
    `UPDATE public.product
        SET status = $2, held_at = NULL, held_by = NULL, held_reason = NULL, held_prior_status = NULL,
            updated_at = now()
      WHERE id = $1`,
    [productId, to],
  );
}
