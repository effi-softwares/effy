// Effy holds a product off sale, and releases it (102). A hold is a status change the shop cannot undo:
// the product goes 'unavailable' (so no storefront reader changes) and a CHECK keeps it off sale.

import { emitMetric, metricNamespace, withTransaction } from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import { HOLD_REASON_MAX, type ReleaseProductResultDTO } from "@effy/shared-types";

import * as reviewRepo from "../review/repository";
import { ProductAdminError } from "./errors";
import * as repo from "./repository";
import { detail, requireProductId } from "./service";

export function requireVersion(v: unknown): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new ProductAdminError("validation", "version is required", [{ field: "version", message: "is required" }]);
  }
  return v;
}

export function requireReason(raw: unknown): string {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason === "" || Array.from(reason).length > HOLD_REASON_MAX) {
    const message = reason === "" ? "say why this product is being held" : `keep the reason under ${HOLD_REASON_MAX} characters`;
    throw new ProductAdminError("validation", message, [{ field: "reason", message }]);
  }
  return reason;
}

const STALE = "this product changed after you opened it — reload it and look again";

export interface Changed {
  productId: string;
  shopId: string;
}

/** Inside a transaction the caller owns, so a bulk action holds many products one transaction each. */
export async function holdOne(productId: string, version: string, reason: string, sub: string, key: string): Promise<Changed> {
  return withTransaction(async (tx) => {
    const p = await repo.lockProduct(tx, productId);
    if (!p) throw new ProductAdminError("not_found", "no such product");
    if (p.version !== version) throw ProductAdminError.conflict("stale", STALE);
    if (p.held) throw ProductAdminError.conflict("already_held", "this product is already held");
    if (p.status === "archived") throw ProductAdminError.conflict("archived", "an archived product cannot be held");

    await repo.writeHold(tx, productId, sub, reason);
    await repo.audit(tx, sub, "product.held", productId, { shopId: p.shop_id, reason, priorStatus: p.status });
    await reviewRepo.notifyShop(tx, "shop_product_held", p.shop_id, productId, key);
    return { productId, shopId: p.shop_id };
  });
}

export interface Released extends Changed {
  releasedTo: ReleaseProductResultDTO["releasedTo"];
  notOnSaleBecause: ReleaseProductResultDTO["notOnSaleBecause"];
}

/** Back to where the hold found it — unless it was on sale and can no longer be. */
export async function releaseOne(productId: string, version: string, sub: string, key: string): Promise<Released> {
  return withTransaction(async (tx) => {
    const p = await repo.lockProduct(tx, productId);
    if (!p) throw new ProductAdminError("not_found", "no such product");
    if (p.version !== version) throw ProductAdminError.conflict("stale", STALE);
    if (!p.held || !p.held_prior_status) throw ProductAdminError.conflict("not_held", "this product is not held");

    let releasedTo = p.held_prior_status;
    let notOnSaleBecause: Released["notOnSaleBecause"] = null;
    if (releasedTo === "active") {
      if (p.shop_status !== "active") notOnSaleBecause = "shop_not_active";
      else if (!p.has_primary_image) notOnSaleBecause = "no_main_picture";
      if (notOnSaleBecause || !p.approved) releasedTo = "unavailable";
    }

    await repo.writeRelease(tx, productId, releasedTo);
    await repo.audit(tx, sub, "product.released", productId, { shopId: p.shop_id, releasedTo, notOnSaleBecause });
    await reviewRepo.notifyShop(tx, "shop_product_released", p.shop_id, productId, key);
    return { productId, shopId: p.shop_id, releasedTo, notOnSaleBecause };
  });
}

/** After the commit: back-office and each shop touched re-read. Never throws. */
export async function announceProducts(shopIds: Iterable<string>): Promise<void> {
  await announce([
    { scope: "ops", kind: "products" },
    ...[...new Set(shopIds)].map((shopId) => ({ scope: "shop" as const, shopId, kind: "products" as const })),
  ]);
}

export async function hold(rawProductId: string | undefined, body: { version?: unknown; reason?: unknown }, sub: string) {
  const productId = requireProductId(rawProductId);
  const version = requireVersion(body.version);
  const reason = requireReason(body.reason);
  const changed = await holdOne(productId, version, reason, sub, `${productId}:held:${version}`);
  emitMetric(metricNamespace(), "ProductHeld", 1);
  await announceProducts([changed.shopId]);
  return detail(productId);
}

export async function release(rawProductId: string | undefined, body: { version?: unknown }, sub: string): Promise<ReleaseProductResultDTO> {
  const productId = requireProductId(rawProductId);
  const version = requireVersion(body.version);
  const r = await releaseOne(productId, version, sub, `${productId}:released:${version}`);
  emitMetric(metricNamespace(), "ProductReleased", 1, { to: r.releasedTo });
  await announceProducts([r.shopId]);
  return { product: await detail(productId), releasedTo: r.releasedTo, notOnSaleBecause: r.notOnSaleBecause };
}
