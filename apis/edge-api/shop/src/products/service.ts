// Validation, the details form and the presign boundary (keys → short-lived urls). `shopId` is always the resolved actor shop.
import { emitMetric, metricNamespace, offsetListPage, query, withTransaction } from "@effy/edge-shared";
import type { ListPage } from "@effy/shared-types";
import {
  FACT_KEYS, leafOrError, optText, parseCreateInput, parseDetails, parseFacts, parseUnitBasis, parseVariantSet, readForm,
  readFormRows, requireNonEmpty, setVariantState as writeVariantState, type AuthoringDeps,
} from "@effy/edge-shared/catalog";
import { announce } from "@effy/edge-shared/live";
import {
  recategorise, validateDetails, validateOptionsAgainstForm, validateVariantSet,
  type CategoryFormDTO, type FactKey, type ShopTaxonomyDTO,
} from "@effy/shared-types";

import * as media from "./media";
import type { ShopProductListRequest } from "./list";
import * as repo from "./repository";
import * as change from "./change";
import {
  type FieldIssue,
  type ProductDetail,
  ProductError,
  type ProductListItem,
  PRODUCT_STATUSES,
  type ProductStatus,
} from "./types";


/** Validation reads the leaf through this service's repository, so its tests decide what a leaf is. */
const authoringDeps: AuthoringDeps = {
  checkLeaf: (id) => repo.checkLeaf(id),
  formRows: async (id) => (await readFormRows({ query }, [id])).get(id) ?? [],
};

export function getShopTaxonomy(shopId: string): Promise<ShopTaxonomyDTO> {
  return repo.readShopTaxonomy(shopId);
}

/** A leaf's form for the details step; a parent is `category_not_leaf` (a product is filed in a leaf). */
export async function getCategoryForm(categoryId: string): Promise<CategoryFormDTO> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const form = UUID.test(categoryId) ? await readForm({ query }, categoryId) : null;
  if (!form) throw new ProductError("not_found", "category not found");
  if (!form.isLeaf) {
    throw new ProductError("validation", "category_not_leaf", [{ field: "primaryCategoryId", message: "choose a category with no sub-categories" }]);
  }
  return form;
}

export async function createProduct(
  shopId: string,
  body: Record<string, unknown>,
  createdBy: string,
): Promise<ProductDetail> {
  const parsed = await parseCreateInput(body, authoringDeps);
  if (!parsed.ok) throw new ProductError("validation", "invalid product", parsed.fields);
  const id = await repo.createProduct(shopId, parsed.input, createdBy);
  return getProduct(shopId, id);
}

export async function presignUpload(
  shopId: string,
  productId: string,
  contentType: unknown,
  fileSize: unknown,
): Promise<{ uploadUrl: string; storageKey: string }> {
  await refuseWhileEffySetsUp(shopId, productId);
  if (!(await repo.productBelongsToShop(shopId, productId))) {
    throw new ProductError("not_found", "product not found");
  }
  return media.presignUpload(productId, contentType, fileSize);
}

export async function registerMedia(
  shopId: string,
  productId: string,
  body: Record<string, unknown>,
): Promise<import("./types").ProductMedia> {
  await refuseWhileEffySetsUp(shopId, productId);
  if (!(await repo.productBelongsToShop(shopId, productId))) {
    throw new ProductError("not_found", "product not found");
  }
  const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
  if (!storageKey) {
    throw new ProductError("validation", "invalid media", [{ field: "storageKey", message: "is required" }]);
  }
  const input = {
    storageKey,
    isPrimary: body.isPrimary === true,
    altText: optText(body.altText),
    displayOrder: typeof body.displayOrder === "number" ? Math.floor(body.displayOrder) : 0,
  };
  // An image added to an approved product is proposed, live only after approval.
  const approved = await isApproved(shopId, productId);
  const registered = approved
    ? await change.registerChangeMedia(shopId, productId, input)
    : await repo.registerMedia(productId, input);
  if (!registered) throw new ProductError("not_found", "product not found");
  if (!approved) await repo.touchProduct(shopId, productId);
  return { ...registered, url: await media.presignRead(registered.storageKey) };
}

/** The shop's catalogue, a console list (103): one page, pictures presigned. */
export async function listProducts(shopId: string, req: ShopProductListRequest): Promise<ListPage<ProductListItem>> {
  const r = await repo.listProducts(shopId, req);
  const items = await Promise.all(
    r.items.map(async (item) => ({
      ...item,
      primaryImageUrl: item.primaryImageUrl ? await media.presignRead(item.primaryImageUrl) : null,
    })),
  );
  return offsetListPage(items, req, r);
}

export async function updateProduct(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
  /** For the GST status history. */
  actorSub: string,
): Promise<ProductDetail> {
  await refuseWhileEffySetsUp(shopId, id);
  const live = await repo.getProductDetail(shopId, id);
  if (!live) throw new ProductError("not_found", "product not found");

  // A never-approved product is edited in place; an approved one gets a proposal, merged and diffed, never writing the live row.
  const pending = live.approved ? await change.readChange(shopId, id) : null;
  const current = live.approved ? change.overlay(live, pending?.proposed ?? null) : live;

  const expectedUpdatedAt = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  // The concurrency token guards the live row; a proposal needs none.
  if (!live.approved && !expectedUpdatedAt) {
    throw new ProductError("validation", "invalid update", [
      { field: "expectedUpdatedAt", message: "is required (optimistic concurrency token)" },
    ]);
  }

  const fields: FieldIssue[] = [];
  const name = "name" in body ? requireNonEmpty(body.name, "name", fields) ?? current.name : current.name;
  const shortDescription =
    "shortDescription" in body ? requireNonEmpty(body.shortDescription, "shortDescription", fields) ?? current.shortDescription : current.shortDescription;
  const primaryCategoryId = "primaryCategoryId" in body && typeof body.primaryCategoryId === "string" ? body.primaryCategoryId : current.primaryCategoryId;
  const recategorised = primaryCategoryId !== current.primaryCategoryId;
  const leaf = recategorised ? await leafOrError(primaryCategoryId, fields, repo.checkLeaf) : null;

  // Variant sets, when sent, are the complete target; the basis likewise.
  const unitBasisSent = parseUnitBasis(body, fields);
  const unitBasis = unitBasisSent === undefined ? current.unitBasis : unitBasisSent;
  const sentSet = parseVariantSet(body, fields);
  const baseSet = live.approved ? change.proposedVariantInputs(live, pending?.proposed ?? null) : change.liveVariantInputs(live);
  const targetSet = sentSet ?? baseSet;
  if (sentSet || unitBasisSent !== undefined) fields.push(...validateVariantSet(targetSet.options, targetSet.variants, unitBasis));

  // Facts: as sent; on a new leaf those the shop never changed by hand take its defaults (FR-024).
  const facts = parseFacts(body, fields);
  const touched = new Set<FactKey>(Array.isArray(body.factsTouched) ? (body.factsTouched as unknown[]).filter((k): k is FactKey => FACT_KEYS.includes(k as FactKey)) : []);
  const fact = <K extends FactKey>(k: K, sent: ProductDetail[K] | undefined): ProductDetail[K] => {
    if (sent !== undefined) return sent;
    if (leaf && !touched.has(k) && leaf.defaults[k] !== null) return leaf.defaults[k] as ProductDetail[K];
    return current[k];
  };
  const storage = fact("storage", facts.storage);
  const gstStatus = fact("gstStatus", facts.gstStatus);
  const ageRestricted = fact("ageRestricted", facts.ageRestricted);

  // Details: as sent (the complete set), else the current ones; a new leaf drops what it does not ask for.
  const sentDetails = parseDetails(body, fields);
  let targetDetails = sentDetails ?? current.details;
  const rows = (await readFormRows({ query }, [primaryCategoryId])).get(primaryCategoryId) ?? [];
  if (recategorised && sentDetails === null) {
    const oldRows = (await readFormRows({ query }, [current.primaryCategoryId])).get(current.primaryCategoryId) ?? [];
    targetDetails = recategorise({ details: targetDetails, facts: { storage, gstStatus, ageRestricted }, factsTouched: [...touched] }, oldRows, rows, leaf?.defaults ?? current.factDefaults).details;
  }
  if (sentSet || recategorised) fields.push(...validateOptionsAgainstForm(targetSet.options, rows));
  if (sentDetails !== null || recategorised) {
    const optionIds = targetSet.options.flatMap((o) => (o.attributeId ? [o.attributeId] : []));
    const variants = targetSet.variants.map((v) => ({ id: v.id, label: "" }));
    fields.push(...validateDetails(rows, targetDetails, variants, { optionAttributeIds: optionIds }));
  }

  if (fields.length > 0) throw new ProductError("validation", "invalid update", fields);

  if (live.approved) {
    const target: change.TargetValues = {
      name,
      primaryCategoryId,
      brand: "brand" in body ? optText(body.brand) : current.brand,
      shortDescription,
      longDescription: "longDescription" in body ? optText(body.longDescription) : current.longDescription,
      // On a live product the facts, the category and the details are proposed and reviewed.
      gstStatus,
      storage,
      ageRestricted,
      // So are options and variants.
      unitBasis,
      options: targetSet.options,
      variants: targetSet.variants,
      details: targetDetails,
    };
    const saved = await change.saveProposal(shopId, id, change.diffProposal(live, target));
    if (saved === "not_found") throw new ProductError("not_found", "product not found");
    return getProduct(shopId, id);
  }

  const result = await repo.updateProduct(
    shopId,
    id,
    expectedUpdatedAt,
    {
      name,
      primaryCategoryId,
      brand: "brand" in body ? optText(body.brand) : current.brand,
      shortDescription,
      longDescription: "longDescription" in body ? optText(body.longDescription) : current.longDescription,
      gstStatus,
      storage,
      ageRestricted,
      unitBasis: unitBasisSent,
      variantSet: sentSet,
      details: sentDetails ?? (recategorised ? targetDetails : null),
    },
    actorSub,
  );
  if (result.outcome === "stale") {
    throw new ProductError("conflict", "product changed since you loaded it — reload and try again");
  }
  return { ...(await getProduct(shopId, id)), droppedDetails: result.droppedDetails };
}

const HELD = "product_held: Effy is holding this product off sale — it cannot go back on sale until Effy releases it";
const EFFY_SETTING_UP = "effy_setting_up: Effy is still setting this product up — it is yours once it goes on sale";

/** Effy's hold, and a product Effy is still finishing, are not the shop's to change (102). */
function refuseWhileEffys(facts: { held: boolean; effyOwned: boolean }): void {
  if (facts.held) throw new ProductError("conflict", HELD);
  if (facts.effyOwned) throw new ProductError("conflict", EFFY_SETTING_UP);
}

/** Every shop write but stock: a product Effy is still setting up is Effy's until it goes on sale (102). */
async function refuseWhileEffySetsUp(shopId: string, id: string): Promise<void> {
  // A malformed id is each route's own not-found, never a database error here.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  const facts = await repo.reviewFacts(shopId, id);
  if (facts?.effyOwned) throw new ProductError("conflict", EFFY_SETTING_UP);
}

export async function changeStatus(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  const status = typeof body.status === "string" ? body.status : "";
  if (!(PRODUCT_STATUSES as readonly string[]).includes(status)) {
    throw new ProductError("validation", "invalid status", [
      { field: "status", message: `must be one of ${PRODUCT_STATUSES.join(", ")}` },
    ]);
  }
  const facts = await repo.reviewFacts(shopId, id);
  if (!facts) throw new ProductError("not_found", "product not found");
  refuseWhileEffys(facts);
  // A never-approved product cannot go on sale (submit for review instead); an approved one taken off sale goes back at once.
  if (status === "active" && !facts.approved) {
    throw new ProductError("conflict", "submit this product for review — Effy approves a product before it goes on sale");
  }
  // Back on sale needs a primary image. A required detail staff added after approval does not block it:
  // the product stays sellable and is listed as missing that detail (101 FR-016).
  if (status === "active" && !(await repo.hasPrimaryImage(shopId, id))) {
    throw new ProductError("validation", "cannot publish — missing required fields", [
      { field: "media", message: "a primary image is required to publish" },
    ]);
  }
  const ok = await repo.changeStatus(shopId, id, status as ProductStatus);
  if (!ok) throw new ProductError("not_found", "product not found");
  return getProduct(shopId, id);
}

export async function deleteProduct(shopId: string, id: string): Promise<void> {
  await refuseWhileEffySetsUp(shopId, id);
  const outcome = await repo.hardDeleteProduct(shopId, id);
  if (outcome === "not_found") throw new ProductError("not_found", "product not found");
  if (outcome === "blocked") {
    throw new ProductError("conflict", "a published product cannot be hard-deleted — archive it instead");
  }
}

export async function setSections(
  shopId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  await refuseWhileEffySetsUp(shopId, id);
  const sectionIds = Array.isArray(body.sectionIds)
    ? (body.sectionIds as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const ok = await repo.setProductSections(shopId, id, sectionIds);
  if (!ok) throw new ProductError("not_found", "product not found");
  return getProduct(shopId, id);
}

export async function patchMedia(
  shopId: string,
  productId: string,
  mediaId: string,
  body: Record<string, unknown>,
): Promise<import("./types").ProductMedia> {
  await refuseWhileEffySetsUp(shopId, productId);
  const patch = {
    isPrimary: typeof body.isPrimary === "boolean" ? body.isPrimary : undefined,
    displayOrder: typeof body.displayOrder === "number" ? Math.floor(body.displayOrder) : undefined,
    altText: "altText" in body ? optText(body.altText) : undefined,
  };
  const approved = await isApproved(shopId, productId);
  const updated = approved
    ? await change.updateChangeMedia(shopId, productId, mediaId, patch)
    : await repo.updateMedia(shopId, productId, mediaId, patch);
  if (updated && !approved) await repo.touchProduct(shopId, productId);
  if (!updated) throw new ProductError("not_found", "media not found");
  return { ...updated, url: await media.presignRead(updated.storageKey) };
}

export async function removeMedia(shopId: string, productId: string, mediaId: string): Promise<void> {
  await refuseWhileEffySetsUp(shopId, productId);
  const approved = await isApproved(shopId, productId);
  const outcome = approved
    ? await change.deleteChangeMedia(shopId, productId, mediaId)
    : await repo.deleteMedia(shopId, productId, mediaId);
  if (outcome === "deleted" && !approved) await repo.touchProduct(shopId, productId);
  if (outcome === "not_found") throw new ProductError("not_found", "media not found");
  if (outcome === "blocked") {
    throw new ProductError("validation", "an active product must keep a primary image", [
      { field: "media", message: "cannot remove the last/primary image of an active product" },
    ]);
  }
}

const VARIANT_STATES = ["active", "inactive", "removed"] as const;

/**
 * Immediately, approved or not: stopping a sale never waits on review. One variant always stays on
 * sale. A removed variant is dropped from any pending proposal too.
 */
export async function setVariantState(
  shopId: string,
  productId: string,
  variantId: string,
  body: Record<string, unknown>,
): Promise<ProductDetail> {
  await refuseWhileEffySetsUp(shopId, productId);
  const state = body.state;
  if (typeof state !== "string" || !(VARIANT_STATES as readonly string[]).includes(state)) {
    throw new ProductError("validation", "invalid state", [{ field: "state", message: `must be one of ${VARIANT_STATES.join(", ")}` }]);
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(productId) || !UUID.test(variantId)) throw new ProductError("not_found", "variant not found");

  const outcome = await withTransaction(async (tx) => {
    const result = await writeVariantState(tx, { productId, shopId, variantId, state: state as (typeof VARIANT_STATES)[number] });
    if (result === "ok" && state === "removed") {
      await tx.query(
        `UPDATE public.product_change
            SET proposed = jsonb_set(proposed, '{variants}', COALESCE((
                  SELECT jsonb_agg(x) FROM jsonb_array_elements(proposed -> 'variants') x WHERE x ->> 'id' <> $2), '[]'::jsonb)),
                updated_at = now()
          WHERE product_id = $1 AND proposed ? 'variants'`,
        [productId, variantId],
      );
    }
    return result;
  });
  if (outcome === "not_found") throw new ProductError("not_found", "variant not found");
  if (outcome === "last_variant") {
    throw new ProductError("conflict", "this is the last size on sale — make the product unavailable instead");
  }
  if (outcome === "held") throw new ProductError("conflict", HELD);
  if (outcome === "ok") {
    emitMetric(metricNamespace(), "VariantStateChanged", 1, { state });
    await announce([{ scope: "shop", shopId, kind: "stock" }]);
  }
  return getProduct(shopId, productId);
}

export async function getProduct(shopId: string, id: string): Promise<ProductDetail> {
  const detail = await repo.getProductDetail(shopId, id);
  if (!detail) throw new ProductError("not_found", "product not found");
  detail.media = await Promise.all(
    detail.media.map(async (m) => ({ ...m, url: await media.presignRead(m.storageKey) })),
  );
  // The pending proposal is shown beside the live product, never merged into it.
  if (detail.approved) {
    const pending = await change.readChange(shopId, id);
    if (pending) {
      const proposedMedia = pending.mediaChanged ? await change.readChangeMedia(pending.id) : null;
      detail.pendingChange = {
        state: pending.state,
        reason: pending.reason,
        submittedAt: pending.submittedAt,
        proposed: pending.proposed,
        media: proposedMedia
          ? await Promise.all(proposedMedia.map(async (m) => ({ ...m, url: await media.presignRead(m.storageKey) })))
          : null,
      };
    }
  }
  return detail;
}

async function isApproved(shopId: string, productId: string): Promise<boolean> {
  return (await repo.reviewFacts(shopId, productId))?.approved ?? false;
}

/** The same checks "publish" ran (mandatory attributes, a primary image); Effy says yes. */
export async function submitForReview(shopId: string, id: string): Promise<ProductDetail> {
  await refuseWhileEffySetsUp(shopId, id);
  const detail = await repo.getProductDetail(shopId, id);
  if (!detail) throw new ProductError("not_found", "product not found");
  if (detail.approved) {
    throw new ProductError("conflict", "this product is already approved — changes to it are reviewed as you save them");
  }
  const fields: FieldIssue[] = detail.missingRequired.map((m) => ({
    field: "details",
    message: `missing_required_details: ${m} is required before this can be reviewed`,
  }));
  if (fields.length > 0) emitMetric(metricNamespace(), "ProductSubmitRefused", 1, { reason: "missing_required_details" });
  if (!(await repo.hasPrimaryImage(shopId, id))) {
    fields.push({ field: "media", message: "a primary image is required before this can be reviewed" });
  }
  // Every variant priced and the set valid before Effy is asked.
  const set = change.liveVariantInputs(detail);
  if (!detail.variants.some((v) => v.state === "active")) fields.push({ field: "variants", message: "at least one variant must be on sale" });
  fields.push(...validateVariantSet(set.options, set.variants, detail.unitBasis));
  if (fields.length > 0) throw new ProductError("validation", "cannot submit — missing required fields", fields);
  if (!(await repo.submitForReview(shopId, id))) throw new ProductError("not_found", "product not found");
  return getProduct(shopId, id);
}

/** Takes a submission back out of the queue or discards a pending change; the live product is untouched. */
export async function withdraw(shopId: string, id: string): Promise<ProductDetail> {
  await refuseWhileEffySetsUp(shopId, id);
  const facts = await repo.reviewFacts(shopId, id);
  if (!facts) throw new ProductError("not_found", "product not found");
  const done = facts.approved ? await change.withdrawChange(shopId, id) : await repo.withdrawSubmission(shopId, id);
  if (!done) throw new ProductError("conflict", "there is nothing waiting for review on this product");
  return getProduct(shopId, id);
}


