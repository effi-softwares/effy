// Effy creates a product for a shop and finishes it (102). It is a draft that never enters the review queue,
// carries the margin chosen at creation, and is Effy's to edit (`content_owner = 'effy'`). The moment it is
// complete, Effy — the reviewer — approves it: it goes on sale and becomes the shop's like any other product.

import type pg from "pg";

import {
  emitMetric, isMediaValidationError, metricNamespace, presignUpload, pooled, validateMargin, withTransaction, type Margin,
} from "@effy/edge-shared";
import {
  authoringDepsFor, completenessIssues, DetailsInvalid, insertProduct, parseCreateInput, priceVariants, replaceEffyDraft,
  VariantSetInvalid, type AuthoringActor, type ProductContentInput,
} from "@effy/edge-shared/catalog";
import { announce } from "@effy/edge-shared/live";
import type { BackOfficeProductDTO } from "@effy/shared-types";

import * as reviewRepo from "../review/repository";
import { ProductAdminError } from "./errors";
import { requireVersion } from "./holds";
import * as repo from "./repository";
import { detail, requireProductId } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireMargin(input: unknown): Margin {
  const out = validateMargin(input);
  if (!out.ok) {
    const message =
      out.reason === "negative" ? "a margin cannot be negative" : out.reason === "too_large" ? "that margin is too large to be intended" : "set Effy's margin as a percentage or an amount";
    throw new ProductAdminError("validation", message, [{ field: "margin", message }]);
  }
  return out.margin;
}

/** The one writers' refusals point at the form's fields; a duplicate code is the shop's other product. */
export function asAuthoringError(err: unknown): never {
  if (err instanceof VariantSetInvalid) throw new ProductAdminError("validation", "the sizes and options are not valid", err.errors);
  if (err instanceof DetailsInvalid) throw new ProductAdminError("validation", "the details are not valid", err.errors);
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    throw new ProductAdminError("validation", "a size code (SKU) is already used by another product in this shop", [
      { field: "variants", message: "a size code (SKU) is already used in this shop" },
    ]);
  }
  throw err;
}

async function parseForm(body: Record<string, unknown>): Promise<ProductContentInput> {
  const parsed = await parseCreateInput(body, authoringDepsFor(pooled));
  if (!parsed.ok) throw new ProductAdminError("validation", "the product is not complete or not valid", parsed.fields);
  return parsed.input;
}

async function activeShop(shopId: string): Promise<void> {
  const r = await pooled.query<{ status: string }>(`SELECT status FROM public.shop WHERE id = $1`, [shopId]);
  if (!r.rows[0]) throw new ProductAdminError("validation", "choose a shop", [{ field: "shopId", message: "is not a shop" }]);
  if (r.rows[0].status !== "active") throw ProductAdminError.conflict("shop_not_active", "this shop is not active");
}

export type Completion = { completed: true } | { completed: false; missing: string[] };

/**
 * Inside the caller's transaction, after every Effy write: when nothing is missing and the shop is active,
 * approve it, price it under its margin and put it on sale (unless Effy also holds it). `notify` is false for
 * an import, which tells the shop once for the whole list.
 */
export async function completeIfReady(
  tx: pg.PoolClient,
  productId: string,
  sub: string,
  opts: { notify: boolean },
): Promise<Completion> {
  const p = await tx.query<{ shop_id: string; shop_status: string; margin_kind: "percent" | "amount" | null; margin_value: string | null }>(
    `SELECT p.shop_id::text, s.status AS shop_status, p.margin_kind, p.margin_value::text
       FROM public.product p JOIN public.shop s ON s.id = p.shop_id
      WHERE p.id = $1 AND p.content_owner = 'effy' AND p.approved_at IS NULL
        FOR UPDATE OF p`,
    [productId],
  );
  const row = p.rows[0];
  if (!row) return { completed: false, missing: [] };
  const missing = await completenessIssues(tx, productId);
  if (row.shop_status !== "active") missing.push("an active shop");
  if (missing.length > 0) return { completed: false, missing };

  await tx.query(
    `UPDATE public.product
        SET approved_at = now(), content_owner = 'shop',
            status = CASE WHEN held_at IS NULL THEN 'active' ELSE status END,
            held_prior_status = CASE WHEN held_at IS NULL THEN NULL ELSE 'active' END,
            updated_at = now()
      WHERE id = $1`,
    [productId],
  );
  await priceVariants(tx, productId, { kind: row.margin_kind!, value: row.margin_value! });
  await repo.audit(tx, sub, "product.effy_completed", productId, { shopId: row.shop_id });
  if (opts.notify) {
    await reviewRepo.notifyShop(tx, "shop_product_added_by_effy", row.shop_id, productId, `${productId}:added`);
  }
  emitMetric(metricNamespace(), "EffyProductCompleted", 1);
  return { completed: true };
}

async function announceFor(shopId: string): Promise<void> {
  await announce([
    { scope: "ops", kind: "products" },
    { scope: "shop", shopId, kind: "products" },
  ]);
}

/** POST /catalog/v1/products: a product for a shop, from Effy's form. Pictures follow (they need its id). */
export async function createForShop(body: Record<string, unknown>, sub: string): Promise<BackOfficeProductDTO> {
  const shopId = typeof body.shopId === "string" && UUID.test(body.shopId) ? body.shopId : null;
  if (!shopId) throw new ProductAdminError("validation", "choose a shop", [{ field: "shopId", message: "is required" }]);
  const margin = requireMargin(body.margin);
  await activeShop(shopId);
  // A picture is uploaded under the product's own id, so none can come with the form that creates it.
  const input = { ...(await parseForm({ ...body, media: [], primaryMediaStorageKey: undefined })), sectionIds: [] };

  const actor: AuthoringActor = { kind: "effy", sub, margin };
  const productId = await withTransaction(async (tx) => {
    const id = await insertProduct(tx, shopId, input, actor).catch(asAuthoringError);
    await repo.audit(tx, sub, "product.created_by_effy", id, { shopId });
    await completeIfReady(tx, id, sub, { notify: true });
    return id;
  });
  emitMetric(metricNamespace(), "EffyProductCreated", 1);
  await announceFor(shopId);
  return detail(productId);
}

/** PATCH /catalog/v1/products/{id}: the complete form again, while the product is still Effy's to finish. */
export async function editEffyOwned(rawProductId: string | undefined, body: Record<string, unknown>, sub: string): Promise<BackOfficeProductDTO> {
  const productId = requireProductId(rawProductId);
  const version = requireVersion(body.version);
  const owner = await pooled.query<{ shop_id: string; effy: boolean }>(
    `SELECT shop_id::text, content_owner = 'effy' AND approved_at IS NULL AS effy FROM public.product WHERE id = $1`,
    [productId],
  );
  const o = owner.rows[0];
  if (!o) throw new ProductAdminError("not_found", "no such product");
  if (!o.effy) throw ProductAdminError.conflict("not_effy_owned", "this product is the shop's now — Effy can no longer edit its content");

  const input = { ...(await parseForm(body)), sectionIds: [] };
  // Only pictures uploaded for this product.
  const foreign = input.media.filter((m) => !m.storageKey.startsWith(`products/${productId}/`));
  if (foreign.length > 0) {
    throw new ProductAdminError("validation", "a picture does not belong to this product", [{ field: "media", message: "upload pictures for this product" }]);
  }

  await withTransaction(async (tx) => {
    const r = await replaceEffyDraft(tx, { productId, shopId: o.shop_id, version, input, sub }).catch(asAuthoringError);
    if (!r.replaced) throw ProductAdminError.conflict("stale", "this product changed after you opened it — reload it and look again");
    await repo.audit(tx, sub, "product.effy_edited", productId, { shopId: o.shop_id });
    await completeIfReady(tx, productId, sub, { notify: true });
  });
  await announceFor(o.shop_id);
  return detail(productId);
}

/** POST /catalog/v1/products/{id}/media: a presigned upload for a product Effy is finishing. */
export async function presignForEffyOwned(
  rawProductId: string | undefined,
  body: { contentType?: unknown; fileSize?: unknown },
): Promise<{ uploadUrl: string; storageKey: string }> {
  const productId = requireProductId(rawProductId);
  const r = await pooled.query<{ effy: boolean }>(
    `SELECT content_owner = 'effy' AND approved_at IS NULL AS effy FROM public.product WHERE id = $1`,
    [productId],
  );
  if (!r.rows[0]) throw new ProductAdminError("not_found", "no such product");
  if (!r.rows[0].effy) throw ProductAdminError.conflict("not_effy_owned", "this product is the shop's now — its pictures are the shop's to change");
  try {
    return await presignUpload("products", productId, body.contentType, body.fileSize);
  } catch (e) {
    if (isMediaValidationError(e)) throw new ProductAdminError("validation", e.message, e.fields);
    throw e;
  }
}
