// Effy's other controls on a product (102): one size on or off sale, and bulk hold / release / margin.
// Each product in its own transaction, so one refusal never undoes the rest (FR-028).

import { emitMetric, metricNamespace, validateMargin, withTransaction, type Margin } from "@effy/edge-shared";
import { priceVariants, setVariantState as writeVariantState } from "@effy/edge-shared/catalog";
import { announce } from "@effy/edge-shared/live";
import {
  BULK_PRODUCTS_MAX,
  type BackOfficeProductDTO,
  type BulkProductsResultDTO,
} from "@effy/shared-types";

import * as reviewRepo from "../review/repository";
import { ProductAdminError } from "./errors";
import { announceProducts, holdOne, releaseOne, requireReason, requireVersion } from "./holds";
import * as repo from "./repository";
import { detail, requireProductId } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = "this product changed after you opened it — reload it and look again";

function requireMargin(input: unknown): Margin {
  const out = validateMargin(input);
  if (!out.ok) {
    const message = out.reason === "negative" ? "a margin cannot be negative" : out.reason === "too_large" ? "that margin is too large to be intended" : "enter a margin as a percentage or an amount";
    throw new ProductAdminError("validation", message, [{ field: "margin", message }]);
  }
  return out.margin;
}

/** One size on or off sale, through the one writer. Removal stays the shop's. */
export async function setVariantState(
  rawProductId: string | undefined,
  rawVariantId: string | undefined,
  body: { version?: unknown; state?: unknown },
  sub: string,
): Promise<BackOfficeProductDTO> {
  const productId = requireProductId(rawProductId);
  if (!rawVariantId || !UUID.test(rawVariantId)) throw new ProductAdminError("not_found", "no such size");
  const variantId = rawVariantId;
  const version = requireVersion(body.version);
  const state = body.state;
  if (state !== "active" && state !== "inactive") {
    throw new ProductAdminError("validation", "state must be active or inactive", [{ field: "state", message: "must be active or inactive" }]);
  }

  const shopId = await withTransaction(async (tx) => {
    const p = await repo.lockProduct(tx, productId);
    if (!p) throw new ProductAdminError("not_found", "no such product");
    if (p.version !== version) throw ProductAdminError.conflict("stale", STALE);
    const outcome = await writeVariantState(tx, { productId, shopId: p.shop_id, variantId, state });
    if (outcome === "not_found") throw new ProductAdminError("not_found", "no such size");
    if (outcome === "held") throw ProductAdminError.conflict("product_held", "the product is held — release it before a size goes on sale");
    if (outcome === "last_variant") throw ProductAdminError.conflict("last_variant", "this is the last size on sale — take the product off sale instead");
    if (outcome === "ok") {
      // A size's state is not the product's version; the page's next action must still see this one.
      await tx.query(`UPDATE public.product SET updated_at = now() WHERE id = $1`, [productId]);
      await repo.audit(tx, sub, "product.variant_state_set", productId, { shopId: p.shop_id, variantId, to: state });
    }
    return p.shop_id;
  });
  await announce([
    { scope: "ops", kind: "products" },
    { scope: "shop", shopId, kind: "stock" },
    { scope: "shop", shopId, kind: "products" },
  ]);
  return detail(productId);
}

/** The margin on one approved product, checked against the version staff saw. */
async function marginOne(productId: string, version: string, margin: Margin, sub: string): Promise<{ shopId: string }> {
  return withTransaction(async (tx) => {
    const p = await repo.lockProduct(tx, productId);
    if (!p) throw new ProductAdminError("not_found", "no such product");
    if (p.version !== version) throw ProductAdminError.conflict("stale", STALE);
    const r = await reviewRepo.readProduct(productId, tx);
    if (!r?.approved) throw new ProductAdminError("validation", "not approved yet — its margin is set when it is approved");
    const before = r.margin_kind && r.margin_value !== null ? { kind: r.margin_kind, value: r.margin_value } : null;
    await reviewRepo.setMargin(tx, productId, { kind: r.margin_kind, value: r.margin_value }, { marginKind: margin.kind, marginValue: margin.value });
    await priceVariants(tx, productId, margin);
    await reviewRepo.audit(tx, sub, "product.margin_set", productId, { shopId: p.shop_id, marginBefore: before, marginAfter: margin, bulk: true });
    return { shopId: p.shop_id };
  });
}

const reasonOf = (err: unknown): string => {
  if (err instanceof ProductAdminError) return err.message.replace(/^[a-z_]+: /, "");
  throw err;
};

export async function bulk(
  body: { action?: unknown; items?: unknown; reason?: unknown; margin?: unknown },
  sub: string,
): Promise<BulkProductsResultDTO> {
  const action = body.action;
  if (action !== "hold" && action !== "release" && action !== "margin") {
    throw new ProductAdminError("validation", "action must be hold, release or margin", [{ field: "action", message: "is not valid" }]);
  }
  const items = Array.isArray(body.items) ? (body.items as { productId?: unknown; version?: unknown }[]) : [];
  if (items.length === 0 || items.length > BULK_PRODUCTS_MAX) {
    throw new ProductAdminError("validation", `choose 1 to ${BULK_PRODUCTS_MAX} products`, [{ field: "items", message: "has the wrong size" }]);
  }
  const reason = action === "hold" ? requireReason(body.reason) : null;
  const margin = action === "margin" ? requireMargin(body.margin) : null;
  // One key for this action, so each shop is told once per product and a retry tells no one twice.
  const actionKey = `${action}:${Date.now()}`;

  const done: string[] = [];
  const refused: BulkProductsResultDTO["refused"] = [];
  const shops = new Set<string>();
  const seen = new Set<string>();
  for (const item of items) {
    const productId = typeof item.productId === "string" ? item.productId : "";
    if (!UUID.test(productId) || seen.has(productId)) {
      refused.push({ productId, reason: "not a product, or listed twice" });
      continue;
    }
    seen.add(productId);
    const version = typeof item.version === "string" ? item.version : "";
    try {
      const key = `${productId}:${actionKey}`;
      const changed =
        action === "hold"
          ? await holdOne(productId, version, reason!, sub, key)
          : action === "release"
            ? await releaseOne(productId, version, sub, key)
            : await marginOne(productId, version, margin!, sub);
      done.push(productId);
      shops.add(changed.shopId);
    } catch (err) {
      refused.push({ productId, reason: reasonOf(err) });
    }
  }

  emitMetric(metricNamespace(), "ProductsBulk", done.length, { action });
  // The margin is Effy's figure and is kept from shops; their screens still re-read nothing about it.
  await announceProducts(action === "margin" ? [] : shops);
  return { done, refused };
}
