// A shop's pending change to an approved product. The live product is never written here: edits land
// in `product_change` / `product_change_media`, which no customer read sees, until Effy approves.
// One open change per product (unique product_id); a proposal that no longer differs is deleted.

import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";
import type { DetailInput, GstStatus, OptionInputDTO, Storage, UnitBasis, VariantInputDTO } from "@effy/shared-types";

import type { ProductChangeProposal, ProductDetail, ProductMedia } from "./types";

/** After merging this edit over what was already proposed. */
export interface TargetValues {
  name: string;
  primaryCategoryId: string;
  brand: string | null;
  shortDescription: string;
  longDescription: string | null;
  gstStatus: GstStatus;
  storage: Storage;
  ageRestricted: boolean;
  unitBasis: UnitBasis | null;
  /** The complete target sets: live, overlaid with the proposal, overlaid with this edit. */
  options: OptionInputDTO[];
  variants: VariantInputDTO[];
  details: DetailInput[];
}

/**
 * The live options and variants as a shop sends them: the base an edit is laid over. Removed variants
 * are excluded; an assumed weight is sent as "not supplied" so it never becomes a measured one.
 */
export function liveVariantInputs(live: ProductDetail): { options: OptionInputDTO[]; variants: VariantInputDTO[] } {
  return {
    options: live.options.map((o) => ({
      id: o.id, position: o.position, kind: o.kind, attributeId: o.attributeId,
      values: o.values.map((v) => ({ id: v.id, allowedValueId: v.allowedValueId, position: v.position })),
    })),
    variants: live.variants
      .filter((v) => v.state !== "removed")
      .map((v) => ({
        id: v.id, position: v.position, optionValueIds: v.optionValueIds, sku: v.sku, gtin: v.gtin,
        shopPriceAmount: v.shopPriceAmount, shopCompareAtAmount: v.shopCompareAtAmount,
        weightGrams: v.weightIsAssumed ? null : v.weightGrams,
        packQuantity: v.packQuantity, packUnit: v.packUnit, mediaStorageKey: v.mediaStorageKey,
      })),
  };
}

const money = (a: string | null | undefined) => (a === null || a === undefined || a === "" ? null : Number(a).toFixed(2));
const text = (a: string | null | undefined) => (a === null || a === undefined || a.trim() === "" ? null : a.trim());
const qty = (a: string | number | null | undefined) => (a === null || a === undefined || a === "" ? null : String(Number(a)));

/** Canonical, so "4.5" vs "4.50" or a different order is not a change. */
function canonicalSet(options: readonly OptionInputDTO[], variants: readonly VariantInputDTO[]): string {
  return JSON.stringify({
    options: [...options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        id: o.id, p: o.position, k: o.kind, a: o.attributeId ?? null,
        v: [...o.values].sort((a, b) => a.position - b.position).map((v) => [v.id, v.allowedValueId ?? null, v.position]),
      })),
    variants: [...variants]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((v) => [
        v.id, v.position, v.optionValueIds[0] ?? null, v.optionValueIds[1] ?? null, text(v.sku), text(v.gtin),
        money(v.shopPriceAmount), money(v.shopCompareAtAmount), v.weightGrams ?? null, qty(v.packQuantity), v.packUnit ?? null,
        text(v.mediaStorageKey),
      ]),
  });
}

export function sameVariantSet(
  a: { options: readonly OptionInputDTO[]; variants: readonly VariantInputDTO[] },
  b: { options: readonly OptionInputDTO[]; variants: readonly VariantInputDTO[] },
): boolean {
  return canonicalSet(a.options, a.variants) === canonicalSet(b.options, b.variants);
}

/** Canonical details: attribute order, variant order and number spelling ("1.50" vs "1.5") do not count. */
function canonicalDetails(details: readonly DetailInput[]): string {
  const value = (v: DetailInput["value"]) => {
    if (!v) return null;
    if ("number" in v) return { number: String(Number(v.number)), unit: v.unit ?? null };
    if ("valueIds" in v) return { valueIds: [...v.valueIds].sort() };
    if ("text" in v) return { text: v.text.trim() };
    return v;
  };
  return JSON.stringify(
    [...details]
      .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
      .map((d) => ({
        a: d.attributeId,
        v: value(d.value),
        p: d.perVariant
          ? [...d.perVariant].sort((x, y) => x.variantId.localeCompare(y.variantId)).map((x) => [x.variantId, value(x.value)])
          : null,
      })),
  );
}

export function sameDetails(a: readonly DetailInput[], b: readonly DetailInput[]): boolean {
  return canonicalDetails(a) === canonicalDetails(b);
}

/** Only what differs from live; empty means nothing proposed (including a change undone). */
export function diffProposal(live: ProductDetail, target: TargetValues): ProductChangeProposal {
  const out: ProductChangeProposal = {};
  if (target.name !== live.name) out.name = target.name;
  if (target.shortDescription !== live.shortDescription) out.shortDescription = target.shortDescription;
  if ((target.longDescription ?? null) !== (live.longDescription ?? null)) out.longDescription = target.longDescription;
  if ((target.brand ?? null) !== (live.brand ?? null)) out.brand = target.brand;
  if (target.primaryCategoryId !== live.primaryCategoryId) out.primaryCategoryId = target.primaryCategoryId;
  if (target.gstStatus !== live.gstStatus) out.gstStatus = target.gstStatus;
  if (target.storage !== live.storage) out.storage = target.storage;
  if (target.ageRestricted !== live.ageRestricted) out.ageRestricted = target.ageRestricted;
  if ((target.unitBasis ?? null) !== (live.unitBasis ?? null)) out.unitBasis = target.unitBasis;
  // The option and variant sets travel whole, together, or not at all; details likewise.
  if (!sameVariantSet(target, liveVariantInputs(live))) {
    out.options = target.options;
    out.variants = target.variants;
  }
  if (!sameDetails(target.details, live.details)) out.details = target.details;
  return out;
}

/** The base a further edit patches. */
export function overlay(live: ProductDetail, proposed: ProductChangeProposal | null): ProductDetail {
  if (!proposed) return live;
  return {
    ...live,
    name: proposed.name ?? live.name,
    shortDescription: proposed.shortDescription ?? live.shortDescription,
    longDescription: "longDescription" in proposed ? (proposed.longDescription ?? null) : live.longDescription,
    brand: "brand" in proposed ? (proposed.brand ?? null) : live.brand,
    primaryCategoryId: proposed.primaryCategoryId ?? live.primaryCategoryId,
    gstStatus: proposed.gstStatus ?? live.gstStatus,
    storage: proposed.storage ?? live.storage,
    ageRestricted: proposed.ageRestricted ?? live.ageRestricted,
    unitBasis: "unitBasis" in proposed ? (proposed.unitBasis ?? null) : live.unitBasis,
    details: proposed.details ?? live.details,
    // Variant sets are not overlaid here (live rows carry stock and state); see `proposedVariantInputs`.
  };
}

/** Proposed, else live. */
export function proposedVariantInputs(
  live: ProductDetail,
  proposed: ProductChangeProposal | null,
): { options: OptionInputDTO[]; variants: VariantInputDTO[] } {
  if (proposed?.options && proposed.variants) return { options: proposed.options, variants: proposed.variants };
  return liveVariantInputs(live);
}

export interface ChangeRow {
  id: string;
  proposed: ProductChangeProposal;
  mediaChanged: boolean;
  state: "in_review" | "sent_back";
  reason: string | null;
  submittedAt: string;
}

interface ChangeDbRow {
  id: string;
  proposed: ProductChangeProposal;
  media_changed: boolean;
  state: "in_review" | "sent_back";
  reason: string | null;
  submitted_at: Date;
}

interface ChangeMediaRow {
  id: string;
  storage_key: string;
  is_primary: boolean;
  display_order: number;
  alt_text: string | null;
}

const toChange = (r: ChangeDbRow): ChangeRow => ({
  id: r.id,
  proposed: r.proposed,
  mediaChanged: r.media_changed,
  state: r.state,
  reason: r.reason,
  submittedAt: r.submitted_at.toISOString(),
});

const toMedia = (m: ChangeMediaRow): ProductMedia => ({
  id: m.id,
  url: m.storage_key,
  storageKey: m.storage_key,
  isPrimary: m.is_primary,
  displayOrder: m.display_order,
  altText: m.alt_text,
});

/** On one of this shop's products, or null. */
export async function readChange(shopId: string, productId: string): Promise<ChangeRow | null> {
  const res = await query<ChangeDbRow>(
    `SELECT pc.id, pc.proposed, pc.media_changed, pc.state, pc.reason, pc.submitted_at
       FROM public.product_change pc
      WHERE pc.product_id = $1 AND pc.shop_id = $2`,
    [productId, shopId],
  );
  return res.rows[0] ? toChange(res.rows[0]) : null;
}

export async function readChangeMedia(changeId: string): Promise<ProductMedia[]> {
  const res = await query<ChangeMediaRow>(
    `SELECT id, storage_key, is_primary, display_order, alt_text
       FROM public.product_change_media WHERE change_id = $1
      ORDER BY is_primary DESC, display_order, created_at`,
    [changeId],
  );
  return res.rows.map(toMedia);
}

/** Drops a change that proposes nothing, after every write. */
async function dropIfEmpty(client: PoolClient, productId: string): Promise<void> {
  await client.query(
    `DELETE FROM public.product_change
      WHERE product_id = $1 AND proposed = '{}'::jsonb AND NOT media_changed`,
    [productId],
  );
}

/**
 * The insert's where refuses another shop's product or one never approved (that is edited in place).
 * A change Effy sent back returns to the queue when edited again.
 */
export async function saveProposal(
  shopId: string,
  productId: string,
  proposed: ProductChangeProposal,
): Promise<"saved" | "not_found"> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO public.product_change (product_id, shop_id, proposed)
       SELECT p.id, p.shop_id, $3::jsonb
         FROM public.product p
        WHERE p.id = $1 AND p.shop_id = $2 AND p.approved_at IS NOT NULL
       ON CONFLICT (product_id) DO UPDATE
          SET proposed     = EXCLUDED.proposed,
              submitted_at = CASE WHEN public.product_change.state = 'sent_back'
                                  THEN now() ELSE public.product_change.submitted_at END,
              state        = 'in_review',
              reason       = NULL,
              updated_at   = now()`,
      [productId, shopId, JSON.stringify(proposed)],
    );
    if ((res.rowCount ?? 0) === 0) return "not_found";
    await dropIfEmpty(client, productId);
    return "saved";
  });
}

/** The live product was never touched, so there is nothing to undo. */
export async function withdrawChange(shopId: string, productId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM public.product_change WHERE product_id = $1 AND shop_id = $2`,
    [productId, shopId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** The first image edit copies the live set, so a proposal is always the complete image set. */
async function ensureMediaChange(client: PoolClient, shopId: string, productId: string): Promise<string | null> {
  const ins = await client.query<{ id: string; media_changed: boolean }>(
    `INSERT INTO public.product_change (product_id, shop_id, proposed)
     SELECT p.id, p.shop_id, '{}'::jsonb
       FROM public.product p
      WHERE p.id = $1 AND p.shop_id = $2 AND p.approved_at IS NOT NULL
     ON CONFLICT (product_id) DO UPDATE
        SET submitted_at = CASE WHEN public.product_change.state = 'sent_back'
                                THEN now() ELSE public.product_change.submitted_at END,
            state        = 'in_review',
            reason       = NULL,
            updated_at   = now()
     RETURNING id, media_changed`,
    [productId, shopId],
  );
  const row = ins.rows[0];
  if (!row) return null;
  if (!row.media_changed) {
    await client.query(
      `INSERT INTO public.product_change_media
           (change_id, storage_key, source_media_id, is_primary, display_order, alt_text)
       SELECT $1, m.storage_key, m.id, m.is_primary, m.display_order, m.alt_text
         FROM public.product_media m WHERE m.product_id = $2`,
      [row.id, productId],
    );
    await client.query(`UPDATE public.product_change SET media_changed = true WHERE id = $1`, [row.id]);
  }
  return row.id;
}

/** A proposed set identical to live is forgotten, with the change if nothing else is in it. */
async function settleMedia(client: PoolClient, changeId: string, productId: string): Promise<void> {
  const same = await client.query<{ same: boolean }>(
    `SELECT NOT EXISTS (
              SELECT storage_key, is_primary, display_order, COALESCE(alt_text, '')
                FROM public.product_change_media WHERE change_id = $1
              EXCEPT
              SELECT storage_key, is_primary, display_order, COALESCE(alt_text, '')
                FROM public.product_media WHERE product_id = $2)
        AND NOT EXISTS (
              SELECT storage_key, is_primary, display_order, COALESCE(alt_text, '')
                FROM public.product_media WHERE product_id = $2
              EXCEPT
              SELECT storage_key, is_primary, display_order, COALESCE(alt_text, '')
                FROM public.product_change_media WHERE change_id = $1) AS same`,
    [changeId, productId],
  );
  if (same.rows[0]?.same) {
    await client.query(`DELETE FROM public.product_change_media WHERE change_id = $1`, [changeId]);
    await client.query(`UPDATE public.product_change SET media_changed = false WHERE id = $1`, [changeId]);
  }
  await dropIfEmpty(client, productId);
}

export async function registerChangeMedia(
  shopId: string,
  productId: string,
  m: { storageKey: string; isPrimary: boolean; altText: string | null; displayOrder: number },
): Promise<ProductMedia | null> {
  return withTransaction(async (client) => {
    const changeId = await ensureMediaChange(client, shopId, productId);
    if (!changeId) return null;
    if (m.isPrimary) {
      await client.query(
        `UPDATE public.product_change_media SET is_primary = false WHERE change_id = $1 AND is_primary`,
        [changeId],
      );
    }
    const res = await client.query<ChangeMediaRow>(
      `INSERT INTO public.product_change_media (change_id, storage_key, is_primary, display_order, alt_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, storage_key, is_primary, display_order, alt_text`,
      [changeId, m.storageKey, m.isPrimary, m.displayOrder, m.altText],
    );
    return toMedia(res.rows[0]!);
  });
}

/** `mediaId` may name a live or a proposed image; both resolve to the same proposed row. */
const RESOLVE_MEDIA = `(id = $2 OR source_media_id = $2)`;

export async function updateChangeMedia(
  shopId: string,
  productId: string,
  mediaId: string,
  patch: { isPrimary?: boolean; displayOrder?: number; altText?: string | null },
): Promise<ProductMedia | null> {
  return withTransaction(async (client) => {
    const changeId = await ensureMediaChange(client, shopId, productId);
    if (!changeId) return null;
    const target = await client.query<{ id: string }>(
      `SELECT id FROM public.product_change_media WHERE change_id = $1 AND ${RESOLVE_MEDIA}`,
      [changeId, mediaId],
    );
    const id = target.rows[0]?.id;
    if (!id) {
      await settleMedia(client, changeId, productId);
      return null;
    }
    if (patch.isPrimary === true) {
      await client.query(
        `UPDATE public.product_change_media SET is_primary = false WHERE change_id = $1 AND is_primary AND id <> $2`,
        [changeId, id],
      );
    }
    const res = await client.query<ChangeMediaRow>(
      `UPDATE public.product_change_media
          SET is_primary    = COALESCE($2, is_primary),
              display_order = COALESCE($3, display_order),
              alt_text      = CASE WHEN $4::boolean THEN $5 ELSE alt_text END
        WHERE id = $1
        RETURNING id, storage_key, is_primary, display_order, alt_text`,
      [id, patch.isPrimary ?? null, patch.displayOrder ?? null, patch.altText !== undefined, patch.altText ?? null],
    );
    const out = toMedia(res.rows[0]!);
    await settleMedia(client, changeId, productId);
    return out;
  });
}

export async function deleteChangeMedia(
  shopId: string,
  productId: string,
  mediaId: string,
): Promise<"deleted" | "not_found" | "blocked"> {
  return withTransaction(async (client) => {
    const changeId = await ensureMediaChange(client, shopId, productId);
    if (!changeId) return "not_found";
    const target = await client.query<{ id: string; is_primary: boolean }>(
      `SELECT id, is_primary FROM public.product_change_media WHERE change_id = $1 AND ${RESOLVE_MEDIA}`,
      [changeId, mediaId],
    );
    const row = target.rows[0];
    if (!row) {
      await settleMedia(client, changeId, productId);
      return "not_found";
    }
    const count = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.product_change_media WHERE change_id = $1`,
      [changeId],
    );
    // An approved product must keep a primary image in what it proposes too.
    if (row.is_primary || Number(count.rows[0]!.n) <= 1) {
      await settleMedia(client, changeId, productId);
      return "blocked";
    }
    await client.query(`DELETE FROM public.product_change_media WHERE id = $1`, [row.id]);
    await settleMedia(client, changeId, productId);
    return "deleted";
  });
}
