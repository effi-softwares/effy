// Pictures on a promotion. SQL and rules together: each rule is one statement under the promotion's row lock.
import {
  imageWidthsField,
  isDimensionsBeyondBuffer,
  isMediaValidationError,
  isUnsupportedImage,
  presignUpload,
  publicImageUrl,
  query,
  readImageDimensions,
  readObjectPrefix,
  renditionWidthsSql,
  withTransaction,
  type Queryable,
} from "@effy/edge-shared";
import { announce } from "@effy/edge-shared/live";
import type { AdminPromotionImageDTO, AdminPromotionImageUploadResponse } from "@effy/shared-types";

import { PromoError } from "./types";

export const MAX_IMAGES = 10;
/** Enough of the file to find its size in any accepted header. */
const HEADER_BYTES = 64 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new PromoError(404, "not_found", "promotion not found");
const invalid = (field: string, message: string) => new PromoError(422, "validation_failed", `${field}: ${message}`, [{ field, message }]);
const changed = () => announce([{ scope: "ops", kind: "promotions" }]);

async function audit(tx: Queryable, actor: string, action: string, promotionId: string, detail: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'promotion', $3, $4::jsonb)`,
    [actor, action, promotionId, JSON.stringify(detail)],
  );
}

function alt(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < 1 || s.length > 150) throw invalid("alt", "describe the picture for people who can't see it, in 1–150 characters");
  return s;
}

function focus(field: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) throw invalid(field, "a point from 0 to 1");
  return Math.round(v * 1000) / 1000;
}

interface ImageRow {
  id: string;
  storage_key: string;
  width: number;
  height: number;
  alt: string;
  focus_x: string;
  focus_y: string;
  position: number;
  widths: number[] | null;
  used_in: { id: string; key: string; name: string }[];
}

function toDTO(r: ImageRow): AdminPromotionImageDTO {
  return {
    id: r.id,
    url: publicImageUrl(r.storage_key) ?? "",
    ...imageWidthsField(r.widths),
    width: r.width,
    height: r.height,
    alt: r.alt,
    focusX: Number(r.focus_x),
    focusY: Number(r.focus_y),
    position: r.position,
    usedIn: r.used_in,
  };
}

/** In order, each with the groups that chose it. */
export async function listImages(promotionId: string, db: Queryable = { query }): Promise<AdminPromotionImageDTO[]> {
  const res = await db.query<ImageRow>(
    `SELECT i.id::text, i.storage_key, i.width, i.height, i.alt, i.focus_x::text, i.focus_y::text, i.position,
            ${renditionWidthsSql("i.storage_key")} AS widths,
            coalesce((SELECT json_agg(json_build_object('id', g.id, 'key', g.key, 'name', g.name) ORDER BY g.sort)
                        FROM public.promotion_group_member m JOIN public.promotion_group g ON g.id = m.group_id
                       WHERE m.image_id = i.id), '[]') AS used_in
       FROM public.promotion_image i
      WHERE i.promotion_id = $1
      ORDER BY i.position, i.created_at`,
    [promotionId],
  );
  return res.rows.map(toDTO);
}

async function lockPromotion(tx: Queryable, id: string): Promise<void> {
  const res = await tx.query(`SELECT 1 FROM public.promotion WHERE id = $1 FOR UPDATE`, [id]);
  if (res.rowCount === 0) throw notFound();
}

/** A presigned PUT under `promotions/<id>/`. */
export async function uploadUrl(promotionId: string, body: Record<string, unknown>): Promise<AdminPromotionImageUploadResponse> {
  if (!UUID.test(promotionId)) throw notFound();
  const exists = await query(`SELECT 1 FROM public.promotion WHERE id = $1`, [promotionId]);
  if (exists.rowCount === 0) throw notFound();
  try {
    return await presignUpload("promotions", promotionId, body.contentType, body.fileSize);
  } catch (e) {
    if (isMediaValidationError(e)) {
      throw new PromoError(422, "invalid_upload", "That file can't be used: a JPEG, PNG or WebP picture up to 10 MB.", e.fields);
    }
    throw e;
  }
}

/** The size is read from the stored file: the presigned upload never passes through here. */
export async function addImage(promotionId: string, body: Record<string, unknown>, actor: string): Promise<AdminPromotionImageDTO> {
  if (!UUID.test(promotionId)) throw notFound();
  const key = typeof body.storageKey === "string" ? body.storageKey : "";
  if (!key.startsWith(`promotions/${promotionId}/`) || key.includes("..")) throw invalid("storageKey", "upload the picture first");
  const description = alt(body.alt);
  const fx = body.focusX === undefined ? 0.5 : focus("focusX", body.focusX);
  const fy = body.focusY === undefined ? 0.5 : focus("focusY", body.focusY);

  let width: number;
  let height: number;
  try {
    ({ width, height } = readImageDimensions(await readObjectPrefix(key, HEADER_BYTES)));
  } catch (e) {
    if (isUnsupportedImage(e) || isDimensionsBeyondBuffer(e)) throw new PromoError(422, "not_a_picture", "That file isn't a picture we can show.", [{ field: "storageKey", message: "not a picture" }]);
    if ((e as { name?: string }).name === "NoSuchKey") throw new PromoError(422, "not_uploaded", "The picture hasn't finished uploading.", [{ field: "storageKey", message: "not uploaded" }]);
    throw e;
  }
  if (Math.min(width, height) < 320) throw new PromoError(422, "picture_too_small", "That picture is too small - at least 320 pixels on its shorter side.", [{ field: "storageKey", message: "too small" }]);

  const id = await withTransaction(async (tx) => {
    await lockPromotion(tx, promotionId);
    const count = Number((await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.promotion_image WHERE promotion_id = $1`, [promotionId])).rows[0]!.n);
    if (count >= MAX_IMAGES) throw new PromoError(409, "too_many_images", `A promotion has at most ${MAX_IMAGES} pictures.`);
    const r = await tx.query<{ id: string }>(
      `INSERT INTO public.promotion_image (promotion_id, storage_key, width, height, alt, focus_x, focus_y, position, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text`,
      [promotionId, key, width, height, description, fx, fy, count, actor],
    );
    await audit(tx, actor, "promotion.image_added", promotionId, { imageId: r.rows[0]!.id, alt: description, width, height });
    return r.rows[0]!.id;
  }).catch((e: { code?: string }) => {
    if (e.code === "23505") throw new PromoError(409, "already_added", "That picture is already on this promotion.");
    throw e;
  });
  await changed();
  return (await listImages(promotionId)).find((i) => i.id === id)!;
}

export async function updateImage(promotionId: string, imageId: string, body: Record<string, unknown>, actor: string): Promise<AdminPromotionImageDTO> {
  if (!UUID.test(promotionId) || !UUID.test(imageId)) throw notFound();
  const change: Record<string, unknown> = {};
  if ("alt" in body) change.alt = alt(body.alt);
  if ("focusX" in body) change.focus_x = focus("focusX", body.focusX);
  if ("focusY" in body) change.focus_y = focus("focusY", body.focusY);
  let position: number | undefined;
  if ("position" in body) {
    if (!Number.isInteger(body.position) || (body.position as number) < 0) throw invalid("position", "a place in the order");
    position = body.position as number;
  }
  await withTransaction(async (tx) => {
    await lockPromotion(tx, promotionId);
    const ids = (await tx.query<{ id: string }>(`SELECT id::text FROM public.promotion_image WHERE promotion_id = $1 ORDER BY position, created_at`, [promotionId])).rows.map((r) => r.id);
    if (!ids.includes(imageId)) throw new PromoError(404, "not_found", "picture not found");
    const sets = Object.keys(change);
    if (sets.length) {
      await tx.query(
        `UPDATE public.promotion_image SET ${sets.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`,
        [imageId, ...sets.map((c) => change[c])],
      );
    }
    if (position !== undefined) {
      const order = ids.filter((x) => x !== imageId);
      order.splice(Math.min(position, order.length), 0, imageId);
      for (const [i, x] of order.entries()) await tx.query(`UPDATE public.promotion_image SET position = $2 WHERE id = $1`, [x, i]);
    }
    await audit(tx, actor, "promotion.image_updated", promotionId, { imageId, ...change, ...(position !== undefined ? { position } : {}) });
  });
  await changed();
  return (await listImages(promotionId)).find((i) => i.id === imageId)!;
}

/**
 * A picture a group chose asks first (409 with its uses); with `confirm` those places fall back to the
 * best remaining picture (the FK nulls them). The stored file is left.
 */
export async function removeImage(promotionId: string, imageId: string, confirm: boolean, actor: string): Promise<void> {
  if (!UUID.test(promotionId) || !UUID.test(imageId)) throw notFound();
  await withTransaction(async (tx) => {
    await lockPromotion(tx, promotionId);
    const used = await tx.query<{ id: string; key: string; name: string }>(
      `SELECT g.id::text, g.key, g.name FROM public.promotion_group_member m JOIN public.promotion_group g ON g.id = m.group_id
        WHERE m.image_id = $1 ORDER BY g.sort`,
      [imageId],
    );
    if (used.rows.length > 0 && !confirm) {
      throw new PromoError(409, "image_in_use", `This picture is shown in ${used.rows.map((g) => g.name).join(", ")}.`, used.rows.map((g) => ({ field: "groups", message: g.name })));
    }
    const res = await tx.query(`DELETE FROM public.promotion_image WHERE id = $1 AND promotion_id = $2`, [imageId, promotionId]);
    if (res.rowCount === 0) throw new PromoError(404, "not_found", "picture not found");
    await tx.query(
      `UPDATE public.promotion_image SET position = ranked.n
         FROM (SELECT id, (row_number() OVER (ORDER BY position, created_at) - 1)::int AS n FROM public.promotion_image WHERE promotion_id = $1) ranked
        WHERE promotion_image.id = ranked.id`,
      [promotionId],
    );
    await audit(tx, actor, "promotion.image_removed", promotionId, { imageId, usedIn: used.rows.map((g) => g.key) });
  });
  await changed();
}
