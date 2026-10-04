// A shop's pending change to an APPROVED product — 067-product-approval-margin.
//
// ⚠ THE LIVE PRODUCT IS NEVER WRITTEN FROM THIS FILE. Once Effy has approved a product, what
// customers see — `public.product`, its attribute values, its media — is the last approved version
// and stays that way until Effy approves the next one. A shop's edit lands HERE, in
// `product_change` and `product_change_media`, where no customer read ever looks.
//
// The alternative (a `pending` flag on the live rows) would need `AND NOT pending` on every
// storefront read, and missing one shows customers an unapproved photo with nothing failing.
//
// ⚠ ONE open change per product — the table's own UNIQUE (product_id). A second edit updates it.
// ⚠ A proposal that no longer differs from the live product is DELETED, not stored (FR-022): an
// empty row in Effy's queue is a review of nothing.

import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import type {
  AttributeValueInput,
  ProductAttributeValue,
  ProductChangeProposal,
  ProductDetail,
  ProductMedia,
} from "./types";

// ── The diff (pure) ────────────────────────────────────────────────────────────────────────────

/** What the shop wants the product to be, after merging its edit over what it already proposed. */
export interface TargetValues {
  name: string;
  productTypeId: string;
  primaryCategoryId: string;
  sku: string | null;
  gtin: string | null;
  brand: string | null;
  priceAmount: string;
  compareAtAmount: string | null;
  shortDescription: string;
  longDescription: string | null;
  weightGrams: number | null;
}

/** Money compares as numbers: "10" and "10.00" are one price, not a change. */
function sameMoney(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}

function sameAttribute(live: ProductAttributeValue | undefined, next: AttributeValueInput): boolean {
  if (!live) return false;
  const options = (v: string[] | null | undefined) => JSON.stringify([...(v ?? [])].sort());
  return (
    (live.valueText ?? null) === (next.valueText ?? null) &&
    (live.valueNumber ?? null) === (next.valueNumber ?? null) &&
    (live.valueBoolean ?? null) === (next.valueBoolean ?? null) &&
    options(live.valueOptions) === options(next.valueOptions)
  );
}

/**
 * Only what DIFFERS from the live product. An empty result means the shop has proposed nothing —
 * including the case where it changed something and then changed it back.
 */
export function diffProposal(
  live: ProductDetail,
  target: TargetValues,
  attributes: readonly AttributeValueInput[],
): ProductChangeProposal {
  const out: ProductChangeProposal = {};
  if (target.name !== live.name) out.name = target.name;
  if (target.shortDescription !== live.shortDescription) out.shortDescription = target.shortDescription;
  if ((target.longDescription ?? null) !== (live.longDescription ?? null)) out.longDescription = target.longDescription;
  if ((target.brand ?? null) !== (live.brand ?? null)) out.brand = target.brand;
  if ((target.sku ?? null) !== (live.sku ?? null)) out.sku = target.sku;
  if ((target.gtin ?? null) !== (live.gtin ?? null)) out.gtin = target.gtin;
  if (target.primaryCategoryId !== live.primaryCategoryId) out.primaryCategoryId = target.primaryCategoryId;
  if (target.productTypeId !== live.productTypeId) out.productTypeId = target.productTypeId;
  if (!sameMoney(target.priceAmount, live.priceAmount)) out.priceAmount = target.priceAmount;
  if (!sameMoney(target.compareAtAmount, live.compareAtAmount)) out.compareAtAmount = target.compareAtAmount;
  if (target.weightGrams !== null && target.weightGrams !== live.weightGrams) out.weightGrams = target.weightGrams;

  const liveById = new Map(live.attributes.map((a) => [a.attributeId, a]));
  const changed = attributes.filter((a) => !sameAttribute(liveById.get(a.attributeId), a));
  if (changed.length > 0) out.attributes = changed;
  return out;
}

/** The live product with an existing proposal laid over it — the base a further edit patches. */
export function overlay(live: ProductDetail, proposed: ProductChangeProposal | null): ProductDetail {
  if (!proposed) return live;
  return {
    ...live,
    name: proposed.name ?? live.name,
    shortDescription: proposed.shortDescription ?? live.shortDescription,
    longDescription: "longDescription" in proposed ? (proposed.longDescription ?? null) : live.longDescription,
    brand: "brand" in proposed ? (proposed.brand ?? null) : live.brand,
    sku: "sku" in proposed ? (proposed.sku ?? null) : live.sku,
    gtin: "gtin" in proposed ? (proposed.gtin ?? null) : live.gtin,
    primaryCategoryId: proposed.primaryCategoryId ?? live.primaryCategoryId,
    productTypeId: proposed.productTypeId ?? live.productTypeId,
    priceAmount: proposed.priceAmount ?? live.priceAmount,
    compareAtAmount: "compareAtAmount" in proposed ? (proposed.compareAtAmount ?? null) : live.compareAtAmount,
    weightGrams: proposed.weightGrams ?? live.weightGrams,
  };
}

/** Earlier proposed attribute values, with this edit's laid over them by attribute. */
export function mergeAttributes(
  earlier: readonly AttributeValueInput[] | undefined,
  next: readonly AttributeValueInput[],
): AttributeValueInput[] {
  const byId = new Map((earlier ?? []).map((a) => [a.attributeId, a]));
  for (const a of next) byId.set(a.attributeId, a);
  return [...byId.values()];
}

// ── Rows ───────────────────────────────────────────────────────────────────────────────────────

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
  url: m.storage_key, // the service replaces this with a presigned url
  storageKey: m.storage_key,
  isPrimary: m.is_primary,
  displayOrder: m.display_order,
  altText: m.alt_text,
});

/** The open change on one of THIS shop's products, or null. */
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

// ── Proposing details ──────────────────────────────────────────────────────────────────────────

/**
 * Drop a change that proposes nothing: no differing detail and no image change.
 * Runs after every write to a change, so "changed it and changed it back" leaves no row behind.
 */
async function dropIfEmpty(client: PoolClient, productId: string): Promise<void> {
  await client.query(
    `DELETE FROM public.product_change
      WHERE product_id = $1 AND proposed = '{}'::jsonb AND NOT media_changed`,
    [productId],
  );
}

/**
 * Save the shop's proposal for an approved product.
 *
 * ⚠ The INSERT's own WHERE refuses a product that is not this shop's or has never been approved —
 * a never-approved product is edited in place, and a proposal for one would be a review item for
 * something Effy has not seen at all.
 *
 * A change Effy sent back returns to the queue when the shop edits it again, as a fresh submission.
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

/** Discard the pending change. The live product was never touched, so there is nothing to undo. */
export async function withdrawChange(shopId: string, productId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM public.product_change WHERE product_id = $1 AND shop_id = $2`,
    [productId, shopId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Proposing images ───────────────────────────────────────────────────────────────────────────

/**
 * Make sure an approved product has a change carrying a PROPOSED IMAGE SET, and return its id.
 *
 * The first image edit copies the live images into `product_change_media` (each remembering the live
 * row it came from), so the proposal is always the COMPLETE set — a reviewer sees exactly what the
 * product would look like, and approval can replace the live set in one statement.
 */
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

/**
 * If the proposed image set has ended up identical to the live one, the images are not being
 * changed after all: forget the proposed set, and the change itself if nothing else is in it.
 */
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

/**
 * ⚠ `mediaId` MAY NAME EITHER SIDE. Before the first image edit the client holds the LIVE image
 * ids; afterwards it holds the proposed ones. Both resolve to the same proposed row, so a client
 * that has not refetched yet still edits the image it meant.
 */
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
    // An approved product must keep a primary image — in what it PROPOSES as much as in what is live.
    if (row.is_primary || Number(count.rows[0]!.n) <= 1) {
      await settleMedia(client, changeId, productId);
      return "blocked";
    }
    await client.query(`DELETE FROM public.product_change_media WHERE id = $1`, [row.id]);
    await settleMedia(client, changeId, productId);
    return "deleted";
  });
}
