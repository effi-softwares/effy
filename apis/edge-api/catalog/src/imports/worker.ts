// The import worker (102), one step per message. `check` judges every product the sheet describes, by the
// form's own rules, and fetches its pictures into private staging; nothing is created. `create` creates the
// ready ones, one transaction each, through the one writer. Both read the import's state first, so a
// repeated message does nothing, and a row already created is never created again.

import { emitMetric, fetchPicture, logger, metricNamespace, pooled, SafeFetchError, withTransaction } from "@effy/edge-shared";
import { authoringDepsFor, insertProduct, parseCreateInput, readFormRows, type ProductContentInput } from "@effy/edge-shared/catalog";
import { announce } from "@effy/edge-shared/live";
import type { CategoryFormRow } from "@effy/shared-types";

import { completeIfReady, asAuthoringError } from "../products/effy";
import { ProductAdminError } from "../products/errors";
import * as productRepo from "../products/repository";
import * as reviewRepo from "../review/repository";
import { promotePicture, stagePicture, type ImportStep } from "./aws";
import * as repo from "./repository";
import {
  buildBody, cell, DETAIL_PREFIX, duplicateSkus, formProblems, groupRows, pathKey, pictureLinks, splitPath,
  type Header, type LeafLookup, type ProductGroup, type RowProblem,
} from "./rows";
import { headerOf } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PICTURE_CONCURRENCY = 8;

async function leafLookup(): Promise<LeafLookup> {
  const cats = await repo.categoriesByPath();
  const byPath = new Map(cats.map((c) => [pathKey(c.path), c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  return {
    byPath: (text) => {
      const c = UUID.test(text.trim()) ? byId.get(text.trim()) : byPath.get(pathKey(splitPath(text)));
      return c ? { id: c.id, isLeaf: c.is_leaf } : null;
    },
  };
}

/** Each leaf's form, read once per step. */
function formCache(): { load: (ids: string[]) => Promise<void>; of: (id: string) => CategoryFormRow[] } {
  const forms = new Map<string, CategoryFormRow[]>();
  return {
    load: async (ids) => {
      const missing = [...new Set(ids)].filter((id) => !forms.has(id));
      if (missing.length === 0) return;
      for (const [id, rows] of await readFormRows(pooled, missing)) forms.set(id, rows);
    },
    of: (id) => forms.get(id) ?? [],
  };
}

/** Run `fn` over items with at most `n` at once. */
async function pool<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

interface Judged {
  group: ProductGroup;
  problems: RowProblem[];
  input: ProductContentInput | null;
}

/** One product's verdict: the sheet's problems, then the form's own. */
async function judge(
  h: Header,
  groups: readonly ProductGroup[],
  sheetDupes: readonly RowProblem[],
  shopId: string,
): Promise<Judged[]> {
  const leaves = await leafLookup();
  const forms = formCache();
  // Load every leaf the sheet names before building (one read, not one per product).
  const leafIds = groups.flatMap((g) => {
    const l = leaves.byPath(cell(h, g.rows[0]!, "Category"));
    return l?.isLeaf ? [l.id] : [];
  });
  await forms.load(leafIds);

  const skus = groups.flatMap((g) => g.rows.map((r) => cell(h, r, "SKU")).filter(Boolean));
  const gtins = groups.flatMap((g) => g.rows.map((r) => cell(h, r, "Barcode")).filter(Boolean));
  const taken = await repo.existingCodes(shopId, skus, gtins);
  const takenSku = new Map(taken.filter((t) => t.kind === "sku").map((t) => [t.code, t.product]));
  const takenGtin = new Map(taken.filter((t) => t.kind === "gtin").map((t) => [t.code, t.product]));
  const deps = authoringDepsFor(pooled);

  const out: Judged[] = [];
  for (const g of groups) {
    const built = buildBody(h, g, leaves, forms.of);
    const problems = [...built.problems, ...sheetDupes.filter((d) => g.rows.some((r) => r.rowNumber === d.rowNumber))];
    for (const r of g.rows) {
      const sku = cell(h, r, "SKU").toLowerCase();
      const gtin = cell(h, r, "Barcode");
      if (sku && takenSku.has(sku)) problems.push({ rowNumber: r.rowNumber, column: "SKU", message: `already used in this shop by "${takenSku.get(sku)}"` });
      if (gtin && takenGtin.has(gtin)) problems.push({ rowNumber: r.rowNumber, column: "Barcode", message: `already used in this shop by "${takenGtin.get(gtin)}"` });
    }
    let input: ProductContentInput | null = null;
    if (built.body) {
      const parsed = await parseCreateInput(built.body, deps);
      if (parsed.ok) input = { ...parsed.input, sectionIds: [], media: [] };
      else problems.push(...formProblems(parsed.fields, built, g.rows[0]!.rowNumber));
    }
    // A list is imported complete: a required detail left empty is the row's problem, not a draft to finish.
    if (input && built.leafId) {
      const given = new Set([...input.details.map((d) => d.attributeId), ...input.options.flatMap((o) => (o.attributeId ? [o.attributeId] : []))]);
      for (const r of forms.of(built.leafId)) {
        if (r.level === "required" && !given.has(r.attributeId)) {
          problems.push({ rowNumber: g.rows[0]!.rowNumber, column: `${DETAIL_PREFIX} ${r.name}`, message: "is required in this aisle" });
        }
      }
    }
    out.push({ group: g, problems, input: problems.length === 0 ? input : null });
  }
  return out;
}

const pictureWords = (e: unknown): string =>
  e instanceof SafeFetchError ? e.message : "the picture could not be fetched";

/** Step one: every row ready or not, with why; pictures staged. Nothing is created. */
export async function check(importId: string): Promise<void> {
  const i = await repo.readImport(importId);
  if (!i || i.state !== "checking") return;
  const h = headerOf(i);
  const rows = (await repo.readRows(importId)).map((r) => ({ rowNumber: r.row_number, cells: r.cells }));
  const groups = groupRows(h, rows);
  const judged = await judge(h, groups, duplicateSkus(h, rows), i.shop_id);

  for (const j of judged) {
    // Pictures for a product that is otherwise ready: a link that fails makes it not ready.
    const staged: string[] = [];
    if (j.input) {
      const links = pictureLinks(h, j.group);
      const first = j.group.rows[0]!.rowNumber;
      const fetched = await pool(links, PICTURE_CONCURRENCY, async (link) => {
        try {
          return { ok: true as const, picture: await fetchPicture(link) };
        } catch (e) {
          return { ok: false as const, message: pictureWords(e) };
        }
      });
      for (const [n, f] of fetched.entries()) {
        if (f.ok) staged.push(await stagePicture(importId, first, n + 1, f.picture.bytes, f.picture.contentType));
        else j.problems.push({ rowNumber: first, column: "Picture links", message: `picture ${n + 1}: ${f.message}` });
      }
    }
    const ready = j.problems.length === 0;
    for (const [n, r] of j.group.rows.entries()) {
      await repo.writeRowResult(null, importId, r.rowNumber, {
        result: ready ? "ready" : "not_ready",
        problems: j.problems.filter((p) => p.rowNumber === r.rowNumber).map(({ column, message }) => ({ column, message })),
        stagedMedia: n === 0 ? staged : [],
      });
    }
  }
  await withTransaction(async (tx) => {
    await repo.recount(tx, importId);
    await repo.moveState(tx, importId, "checking", "checked");
  });
  const readyRows = judged.filter((j) => j.problems.length === 0).reduce((n, j) => n + j.group.rows.length, 0);
  emitMetric(metricNamespace(), "ImportRowsReady", readyRows);
  emitMetric(metricNamespace(), "ImportRowsNotReady", rows.length - readyRows);
  await announce([{ scope: "ops", kind: "products" }]);
}

/** Step two: each ready product in its own transaction, through the one writer, then its pictures. */
export async function create(importId: string): Promise<void> {
  const i = await repo.readImport(importId);
  if (!i || i.state !== "creating") return;
  const h = headerOf(i);
  const stored = await repo.readRows(importId);
  const rows = stored.map((r) => ({ rowNumber: r.row_number, cells: r.cells }));
  const byRow = new Map(stored.map((r) => [r.row_number, r]));
  const groups = groupRows(h, rows).filter((g) => g.rows.every((r) => byRow.get(r.rowNumber)!.result === "ready"));
  // Judged again: an aisle retired since the check, or a code taken since, leaves that product out.
  const judged = await judge(h, groups, [], i.shop_id);
  const margin = { kind: i.margin_kind, value: i.margin_value };
  let created = 0;

  for (const j of judged) {
    const firstRow = j.group.rows[0]!.rowNumber;
    if (!j.input) {
      for (const r of j.group.rows) {
        await repo.writeRowResult(null, importId, r.rowNumber, {
          result: "left_out",
          problems: j.problems.filter((p) => p.rowNumber === r.rowNumber).map(({ column, message }) => ({ column, message })),
        });
      }
      continue;
    }
    try {
      await withTransaction(async (tx) => {
        const productId = await insertProduct(tx, i.shop_id, j.input!, { kind: "import", sub: i.created_by, margin, importId }).catch(asAuthoringError);
        await productRepo.audit(tx, i.created_by, "product.created_by_effy", productId, { shopId: i.shop_id, importId });
        const staged = byRow.get(firstRow)!.staged_media;
        for (const [n, key] of staged.entries()) {
          const live = await promotePicture(key, productId);
          await tx.query(
            `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order) VALUES ($1, $2, $3, $4)`,
            [productId, live, n === 0, n],
          );
        }
        await completeIfReady(tx, productId, i.created_by, { notify: false });
        for (const r of j.group.rows) await repo.writeRowResult(tx, importId, r.rowNumber, { result: "created", productId });
      });
      created += 1;
    } catch (err) {
      const message = err instanceof ProductAdminError ? err.message : "could not be created";
      if (!(err instanceof ProductAdminError)) logger.error({ err: err instanceof Error ? err.message : String(err), importId, firstRow }, "import: product not created");
      for (const r of j.group.rows) {
        await repo.writeRowResult(null, importId, r.rowNumber, { result: "left_out", problems: [{ column: null, message }] });
      }
    }
  }

  await withTransaction(async (tx) => {
    await repo.recount(tx, importId);
    await repo.moveState(tx, importId, "creating", "done");
    await repo.auditImport(tx, i.created_by, "product_import.finished", importId, { shopId: i.shop_id, created });
    // The shop is told once for the whole list.
    if (created > 0) await reviewRepo.notifyShop(tx, "shop_products_imported", i.shop_id, importId, `${importId}:imported`);
  });
  emitMetric(metricNamespace(), "ImportRowsCreated", created);
  await announce([{ scope: "ops", kind: "products" }, { scope: "shop", shopId: i.shop_id, kind: "products" }]);
}

export async function runStep(importId: string, step: ImportStep): Promise<void> {
  if (step === "check") await check(importId);
  else await create(importId);
}

/** A step that fails for good leaves the import `failed`, so the screen says so instead of waiting. */
export async function markFailed(importId: string): Promise<void> {
  const i = await repo.readImport(importId);
  if (!i || (i.state !== "checking" && i.state !== "creating")) return;
  await repo.moveState(null, importId, i.state, "failed");
  await announce([{ scope: "ops", kind: "products" }]);
}
