// Imports (102): start one from a sheet the browser parsed, read where it stands, and ask for its ready
// products to be created. The checking and the creating are the worker's (worker.ts).

import { emitMetric, metricNamespace, offsetListPage, pooled, withTransaction } from "@effy/edge-shared";
import { readFormRows } from "@effy/edge-shared/catalog";
import { announce } from "@effy/edge-shared/live";
import {
  IMPORT_ROWS_MAX,
  type ProductImportDTO,
  type ProductImportListDTO,
  type ProductImportProductDTO,
  type ProductImportSummaryDTO,
  type ProductImportTemplateDTO,
} from "@effy/shared-types";

import { requireMargin } from "../products/effy";
import type { ImportListRequest } from "./list";
import { ProductAdminError } from "../products/errors";
import { requireVersion } from "../products/holds";
import { enqueue } from "./aws";
import * as repo from "./repository";
import { cell, DETAIL_PREFIX, IMPORT_COLUMNS, readHeader, type Header } from "./rows";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireImportId(raw: string | undefined): string {
  if (!raw || !UUID.test(raw)) throw new ProductAdminError("not_found", "no such import");
  return raw;
}

const invalid = (field: string, message: string) => new ProductAdminError("validation", message, [{ field, message }]);

function summaryOf(i: repo.ImportRow): ProductImportSummaryDTO {
  return {
    importId: i.id,
    shop: { id: i.shop_id, name: i.shop_name },
    fileName: i.file_name,
    state: i.state,
    createdBy: i.created_by_name,
    createdAt: i.created_at.toISOString(),
    counts: { rows: i.row_count, ready: i.ready_count, created: i.created_count, leftOut: i.left_out_count },
  };
}

export function headerOf(i: repo.ImportRow): Header {
  const h = readHeader(i.columns);
  if ("problems" in h) throw new Error(`import ${i.id} was stored with a header it cannot read`);
  return h.header;
}

/** POST /catalog/v1/imports — 202: written, and on its way to the worker to be checked. */
export async function start(body: Record<string, unknown>, sub: string): Promise<ProductImportDTO> {
  const shopId = typeof body.shopId === "string" && UUID.test(body.shopId) ? body.shopId : null;
  if (!shopId) throw invalid("shopId", "choose a shop");
  const margin = requireMargin(body.margin);
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : null;
  if (!fileName) throw invalid("fileName", "the file needs a name");
  const sha = typeof body.fileSha256 === "string" && /^[0-9a-f]{64}$/.test(body.fileSha256) ? body.fileSha256 : null;
  if (!sha) throw invalid("fileSha256", "the file's fingerprint is missing");
  const columns = Array.isArray(body.columns) && body.columns.every((c) => typeof c === "string") ? (body.columns as string[]) : null;
  if (!columns) throw invalid("columns", "the sheet has no header row");
  const rawRows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
  if (rawRows.length === 0) throw invalid("rows", "the sheet has no rows");
  if (rawRows.length > IMPORT_ROWS_MAX) throw invalid("rows", `import at most ${IMPORT_ROWS_MAX} rows at a time`);
  const rows = rawRows.map((r, i) => {
    const x = (r ?? {}) as { rowNumber?: unknown; cells?: unknown };
    const rowNumber = typeof x.rowNumber === "number" && Number.isInteger(x.rowNumber) && x.rowNumber >= 2 ? x.rowNumber : null;
    const cells = Array.isArray(x.cells) && x.cells.every((c) => typeof c === "string") ? (x.cells as string[]).map((c) => c.slice(0, 2000)) : null;
    if (rowNumber === null || cells === null) throw invalid(`rows[${i}]`, "a row is not readable");
    return { rowNumber, cells };
  });
  if (new Set(rows.map((r) => r.rowNumber)).size !== rows.length) throw invalid("rows", "two rows have the same row number");

  const header = readHeader(columns);
  if ("problems" in header) {
    throw new ProductAdminError("validation", header.problems.join("; "), header.problems.map((message) => ({ field: "columns", message })));
  }
  const shop = await pooled.query<{ status: string }>(`SELECT status FROM public.shop WHERE id = $1`, [shopId]);
  if (!shop.rows[0]) throw invalid("shopId", "choose a shop");
  if (shop.rows[0].status !== "active") throw ProductAdminError.conflict("shop_not_active", "this shop is not active");

  const id = await withTransaction(async (tx) => {
    const importId = await repo.insertImport(tx, {
      shopId, fileName, sha, columns, margin, createdBy: sub,
      rows: rows.map((r) => ({ ...r, productKey: cell(header.header, r, "Product key") || `row-${r.rowNumber}` })),
    });
    await repo.auditImport(tx, sub, "product_import.created", importId, { shopId, fileName, rows: rows.length });
    return importId;
  });
  await enqueue(id, "check");
  emitMetric(metricNamespace(), "ImportStarted", 1);
  await announce([{ scope: "ops", kind: "products" }]);
  return get(id);
}

export async function list(req: ImportListRequest): Promise<ProductImportListDTO> {
  const r = await repo.listImports(req);
  return offsetListPage(r.rows.map(summaryOf), req, r);
}

export async function get(rawId: string | undefined): Promise<ProductImportDTO> {
  const id = requireImportId(rawId);
  const i = await repo.readImport(id);
  if (!i) throw new ProductAdminError("not_found", "no such import");
  const h = headerOf(i);
  const rows = await repo.readRows(id);
  const products = new Map<string, ProductImportProductDTO>();
  for (const r of rows) {
    const sheetRow = { rowNumber: r.row_number, cells: r.cells };
    const p = products.get(r.product_key.toLowerCase()) ?? {
      key: r.product_key, name: cell(h, sheetRow, "Name") || r.product_key, result: r.result, productId: null, pictures: 0, rows: [],
    };
    p.rows.push({ rowNumber: r.row_number, sku: cell(h, sheetRow, "SKU"), problems: r.problems });
    p.pictures += r.staged_media.length;
    p.productId ??= r.product_id;
    // One bad size makes the product not ready: the worst result of its rows is the product's.
    const rank = { not_ready: 4, left_out: 3, pending: 2, ready: 1, created: 0 } as const;
    if (rank[r.result] > rank[p.result]) p.result = r.result;
    products.set(r.product_key.toLowerCase(), p);
  }
  const earlier = await repo.earlierImport(i.shop_id, i.file_sha256, i.id);
  return {
    ...summaryOf(i),
    margin: { kind: i.margin_kind, value: i.margin_value.replace(/\.?0+$/, "") },
    products: [...products.values()],
    repeatOf: earlier && earlier.created_at < i.created_at ? { importId: earlier.id, createdAt: earlier.created_at.toISOString() } : null,
    version: i.version,
  };
}

/** POST /catalog/v1/imports/{id}/create — 202: the ready products are created by the worker. */
export async function create(rawId: string | undefined, body: { version?: unknown }, sub: string): Promise<ProductImportDTO> {
  const id = requireImportId(rawId);
  const version = requireVersion(body.version);
  const i = await repo.readImport(id);
  if (!i) throw new ProductAdminError("not_found", "no such import");
  if (i.state !== "checked") throw ProductAdminError.conflict("import_state", "this import is not waiting to be created");
  if (i.ready_count === 0) throw ProductAdminError.conflict("nothing_ready", "no product in this import is ready");
  const moved = await withTransaction(async (tx) => {
    if (!(await repo.moveState(tx, id, "checked", "creating", version))) return false;
    await repo.auditImport(tx, sub, "product_import.create_asked", id, { shopId: i.shop_id, ready: i.ready_count });
    return true;
  });
  if (!moved) throw ProductAdminError.conflict("stale", "this import changed after you opened it — reload it and look again");
  await enqueue(id, "create");
  await announce([{ scope: "ops", kind: "products" }]);
  return get(id);
}

/** GET /catalog/v1/imports/template — the columns, with a detail column for each chosen leaf's form. */
export async function template(params: Record<string, string | undefined>): Promise<ProductImportTemplateDTO> {
  const ids = (params.categoryIds ?? "").split(",").map((s) => s.trim()).filter((s) => UUID.test(s)).slice(0, 20);
  const forms = ids.length > 0 ? await readFormRows(pooled, ids) : new Map();
  const details = new Map<string, { name: string; required: boolean; help: string }>();
  for (const rows of forms.values()) {
    for (const r of rows as { name: string; level: string; helpText: string | null; inputType: string; units: string[]; values: { label: string }[] }[]) {
      const help =
        r.inputType === "single_select" || r.inputType === "multi_select"
          ? `One of: ${r.values.map((v) => v.label).join(", ")}${r.inputType === "multi_select" ? " (several separated by |)" : ""}`
          : r.inputType === "number" && r.units.length > 0
            ? `A number and unit (${r.units.join(", ")})`
            : r.inputType === "boolean"
              ? "Yes or No"
              : (r.helpText ?? "");
      const prior = details.get(r.name.toLowerCase());
      details.set(r.name.toLowerCase(), { name: `${DETAIL_PREFIX} ${r.name}`, required: (prior?.required ?? false) || r.level === "required", help });
    }
  }
  return { columns: [...IMPORT_COLUMNS.map((c) => ({ name: c.name, required: c.required, help: c.help })), ...details.values()] };
}
