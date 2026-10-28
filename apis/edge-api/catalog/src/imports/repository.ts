// Imports (102): one uploaded list for one shop, and each row's result. A state change is guarded by the
// import's version (`updated_at::text`) or by the state it moves from, so a repeated worker step is a no-op.

import type pg from "pg";

import { likePattern, limitOffsetClause, orderBy, query, runOffsetPage } from "@effy/edge-shared";

import { IMPORT_LIST, type ImportListRequest } from "./list";
import type { ProductImportProblemDTO, ProductImportRowResult, ProductImportState } from "@effy/shared-types";

type Db = { query: pg.PoolClient["query"] } | null;

async function run<T extends pg.QueryResultRow>(db: Db, sql: string, params: unknown[]): Promise<pg.QueryResult<T>> {
  return db ? (db.query(sql, params as never[]) as unknown as Promise<pg.QueryResult<T>>) : query<T>(sql, params);
}

export interface ImportRow {
  id: string;
  shop_id: string;
  shop_name: string;
  shop_status: string;
  file_name: string;
  file_sha256: string;
  columns: string[];
  margin_kind: "percent" | "amount";
  margin_value: string;
  state: ProductImportState;
  row_count: number;
  ready_count: number;
  created_count: number;
  left_out_count: number;
  created_by: string;
  created_by_name: string | null;
  created_at: Date;
  version: string;
}

const IMPORT = `
  SELECT i.id::text, i.shop_id::text, s.name AS shop_name, s.status AS shop_status, i.file_name, i.file_sha256, i.columns,
         i.margin_kind, i.margin_value::text, i.state, i.row_count, i.ready_count, i.created_count, i.left_out_count,
         i.created_by, COALESCE(st.name, st.email) AS created_by_name, i.created_at, i.updated_at::text AS version
    FROM public.product_import i
    JOIN public.shop s ON s.id = i.shop_id
    LEFT JOIN admin.staff st ON st.cognito_sub = i.created_by`;

export async function insertImport(
  db: pg.PoolClient,
  v: {
    shopId: string; fileName: string; sha: string; columns: string[]; margin: { kind: string; value: string }; createdBy: string;
    rows: { rowNumber: number; productKey: string; cells: string[] }[];
  },
): Promise<string> {
  const ins = await db.query<{ id: string }>(
    `INSERT INTO public.product_import (shop_id, file_name, file_sha256, columns, margin_kind, margin_value, created_by, row_count)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::numeric, $7, $8) RETURNING id::text`,
    [v.shopId, v.fileName, v.sha, JSON.stringify(v.columns), v.margin.kind, v.margin.value, v.createdBy, v.rows.length],
  );
  const id = ins.rows[0]!.id;
  // One statement for the whole sheet: unnest the three arrays row by row.
  await db.query(
    `INSERT INTO public.product_import_row (import_id, row_number, product_key, cells)
     SELECT $1, r.n, r.k, r.c
       FROM unnest($2::int[], $3::text[], $4::jsonb[]) AS r(n, k, c)`,
    [id, v.rows.map((r) => r.rowNumber), v.rows.map((r) => r.productKey), v.rows.map((r) => JSON.stringify(r.cells))],
  );
  return id;
}

export async function readImport(id: string, db: Db = null, lock = false): Promise<ImportRow | null> {
  const r = await run<ImportRow>(db, `${IMPORT} WHERE i.id = $1${lock ? " FOR UPDATE OF i" : ""}`, [id]);
  return r.rows[0] ?? null;
}

/** An earlier import of the same file for the same shop: a warning, never a refusal (SKUs decide). */
export async function earlierImport(shopId: string, sha: string, notId: string | null): Promise<{ id: string; created_at: Date } | null> {
  const r = await query<{ id: string; created_at: Date }>(
    `SELECT id::text, created_at FROM public.product_import
      WHERE shop_id = $1 AND file_sha256 = $2 AND ($3::uuid IS NULL OR id <> $3) ORDER BY created_at LIMIT 1`,
    [shopId, sha, notId],
  );
  return r.rows[0] ?? null;
}

/** One page of imports with its exact total (103). */
export async function listImports(req: ImportListRequest) {
  return runOffsetPage(req, async (read) => {
    const args: unknown[] = [req.filters.shopId ?? null, req.filters.state ?? null, req.q ? likePattern(req.q) : null];
    const paging = limitOffsetClause(read, args);
    const r = await query<ImportRow & { full_count: string }>(
      `${IMPORT.replace("SELECT ", "SELECT count(*) OVER () AS full_count, ")}
        WHERE ($1::uuid IS NULL OR i.shop_id = $1)
          AND ($2::text IS NULL OR i.state = $2)
          AND ($3::text IS NULL OR i.file_name ILIKE $3)
        ${orderBy(IMPORT_LIST, req)}
        ${paging}`,
      args,
    );
    return r.rows;
  });
}

export interface RowRow {
  row_number: number;
  product_key: string;
  cells: string[];
  result: ProductImportRowResult;
  problems: ProductImportProblemDTO[];
  staged_media: string[];
  product_id: string | null;
}

export async function readRows(importId: string, db: Db = null): Promise<RowRow[]> {
  const r = await run<RowRow>(
    db,
    `SELECT row_number, product_key, cells, result, problems, staged_media, product_id::text
       FROM public.product_import_row WHERE import_id = $1 ORDER BY row_number`,
    [importId],
  );
  return r.rows;
}

export async function writeRowResult(
  db: pg.PoolClient | null,
  importId: string,
  rowNumber: number,
  v: { result: ProductImportRowResult; problems?: ProductImportProblemDTO[]; stagedMedia?: string[]; productId?: string | null },
): Promise<void> {
  await run(
    db,
    `UPDATE public.product_import_row
        SET result = $3,
            problems = COALESCE($4::jsonb, problems),
            staged_media = COALESCE($5::jsonb, staged_media),
            product_id = COALESCE($6::uuid, product_id)
      WHERE import_id = $1 AND row_number = $2`,
    [importId, rowNumber, v.result, v.problems ? JSON.stringify(v.problems) : null, v.stagedMedia ? JSON.stringify(v.stagedMedia) : null, v.productId ?? null],
  );
}

/** From one state to the next; false when the import was not in `from` (a repeat, or a stale click). */
export async function moveState(
  db: pg.PoolClient | null,
  id: string,
  from: ProductImportState,
  to: ProductImportState,
  version?: string,
): Promise<boolean> {
  const r = await run(
    db,
    `UPDATE public.product_import
        SET state = $3, updated_at = now(),
            checked_at = CASE WHEN $3 = 'checked' THEN now() ELSE checked_at END,
            finished_at = CASE WHEN $3 IN ('done', 'failed') THEN now() ELSE finished_at END
      WHERE id = $1 AND state = $2 AND ($4::text IS NULL OR updated_at::text = $4)`,
    [id, from, to, version ?? null],
  );
  return (r.rowCount ?? 0) > 0;
}

/** The counts, from the rows themselves. */
export async function recount(db: pg.PoolClient | null, id: string): Promise<void> {
  await run(
    db,
    `UPDATE public.product_import i SET
         ready_count = c.ready, created_count = c.created, left_out_count = c.left_out, updated_at = now()
       FROM (SELECT count(*) FILTER (WHERE result = 'ready')::int AS ready,
                    count(*) FILTER (WHERE result = 'created')::int AS created,
                    count(*) FILTER (WHERE result IN ('left_out', 'not_ready'))::int AS left_out
               FROM public.product_import_row WHERE import_id = $1) c
      WHERE i.id = $1`,
    [id],
  );
}

/** Codes already used in the shop by a size that is not removed, and the product each belongs to. */
export async function existingCodes(shopId: string, skus: string[], gtins: string[]): Promise<{ code: string; kind: "sku" | "gtin"; product: string }[]> {
  if (skus.length === 0 && gtins.length === 0) return [];
  const r = await query<{ code: string; kind: "sku" | "gtin"; product: string }>(
    `SELECT lower(v.sku) AS code, 'sku' AS kind, p.name AS product
       FROM public.product_variant v JOIN public.product p ON p.id = v.product_id
      WHERE v.shop_id = $1 AND v.state <> 'removed' AND lower(v.sku) = ANY($2::text[])
     UNION ALL
     SELECT v.gtin, 'gtin', p.name
       FROM public.product_variant v JOIN public.product p ON p.id = v.product_id
      WHERE v.shop_id = $1 AND v.state <> 'removed' AND v.gtin = ANY($3::text[])`,
    [shopId, skus.map((s) => s.toLowerCase()), gtins],
  );
  return r.rows;
}

/** Every active category by its path, for reading the sheet's Category column. */
export async function categoriesByPath(): Promise<{ id: string; path: string[]; is_leaf: boolean }[]> {
  const r = await query<{ id: string; path: string[]; is_leaf: boolean }>(
    `SELECT r.category_id::text AS id, r.path_names AS path, r.is_leaf
       FROM public.category_resolved r JOIN public.category c ON c.id = r.category_id
      WHERE c.status = 'active'`,
  );
  return r.rows;
}

export async function auditImport(db: pg.PoolClient | null, sub: string, action: string, importId: string, detail: Record<string, unknown>): Promise<void> {
  await run(
    db,
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'product_import', $3, $4::jsonb)`,
    [sub, action, importId, JSON.stringify(detail)],
  );
}
