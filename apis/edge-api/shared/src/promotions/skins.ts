import {
  pickPicture,
  type DesignedLayout,
  type GroupSize,
  type ShopperSkinDTO,
  type SkinLayout,
  type SkinSettings,
} from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { imageWidthsField, publicImageUrl, renditionWidthsSql } from "../lib/media-public";

/**
 * 095 — how a promotion looks in one place. The group reads (storefront, commerce) and back-office's group
 * preview resolve a member's skin and picture HERE, so every reader agrees on which skin a placement wears:
 *
 *   the member's own skin  ?? (a shared code ? the group's code default : —)  ?? the group's default
 *
 * and which picture it shows (`pickPicture`, @effy/shared-types: the member's choice if it still exists,
 * else the best fit for the layout, else none).
 */

export interface SkinRow {
  id: string;
  layout: SkinLayout;
  settings: SkinSettings | Record<string, never>;
  version: number;
}

export interface PictureRow {
  id: string;
  promotionId: string;
  storageKey: string;
  width: number;
  height: number;
  alt: string;
  focusX: number;
  focusY: number;
  position: number;
  widths: number[] | null;
}

/** A member's placement facts, as the group query returns them. */
export interface Placement {
  size: GroupSize;
  memberSkinId: string | null;
  defaultSkinId: string;
  defaultCodeSkinId: string | null;
  imageId: string | null;
}

/** The SQL columns a group-member query selects for `Placement` (g = promotion_group, m = member). */
export const PLACEMENT_COLUMNS = `g.size, m.skin_id::text AS member_skin_id, g.default_skin_id::text AS default_skin_id,
       g.default_code_skin_id::text AS default_code_skin_id, m.image_id::text AS image_id`;

export function placementOf(r: { size: string; member_skin_id: string | null; default_skin_id: string; default_code_skin_id: string | null; image_id: string | null }): Placement {
  return {
    size: r.size as GroupSize,
    memberSkinId: r.member_skin_id,
    defaultSkinId: r.default_skin_id,
    defaultCodeSkinId: r.default_code_skin_id,
    imageId: r.image_id,
  };
}

export async function loadSkins(db: Queryable, ids: readonly string[]): Promise<Map<string, SkinRow>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const res = await db.query<{ id: string; layout: SkinLayout; settings: SkinRow["settings"]; version: number }>(
    `SELECT id::text, layout, settings, version FROM public.promotion_skin WHERE id = ANY($1::uuid[])`,
    [wanted],
  );
  return new Map(res.rows.map((r) => [r.id, r]));
}

export async function loadPictures(db: Queryable, promotionIds: readonly string[]): Promise<Map<string, PictureRow[]>> {
  const wanted = [...new Set(promotionIds)];
  const out = new Map<string, PictureRow[]>();
  if (wanted.length === 0) return out;
  const res = await db.query<{
    id: string; promotion_id: string; storage_key: string; width: number; height: number; alt: string;
    focus_x: string; focus_y: string; position: number; widths: number[] | null;
  }>(
    `SELECT i.id::text, i.promotion_id::text, i.storage_key, i.width, i.height, i.alt, i.focus_x::text, i.focus_y::text,
            i.position, ${renditionWidthsSql("i.storage_key")} AS widths
       FROM public.promotion_image i
      WHERE i.promotion_id = ANY($1::uuid[])
      ORDER BY i.promotion_id, i.position, i.created_at`,
    [wanted],
  );
  for (const r of res.rows) {
    const list = out.get(r.promotion_id) ?? [];
    list.push({
      id: r.id, promotionId: r.promotion_id, storageKey: r.storage_key, width: r.width, height: r.height, alt: r.alt,
      focusX: Number(r.focus_x), focusY: Number(r.focus_y), position: r.position, widths: r.widths,
    });
    out.set(r.promotion_id, list);
  }
  return out;
}

/** Every skin id a set of placements could wear. */
export function skinIdsOf(placements: readonly Placement[]): string[] {
  return placements.flatMap((p) => [p.memberSkinId, p.defaultSkinId, p.defaultCodeSkinId]).filter((x): x is string => x !== null);
}

/** The skin a placement wears — or undefined when none could be loaded (a client then draws its own look). */
export function resolveSkin(
  placement: Placement,
  hasCode: boolean,
  skins: ReadonlyMap<string, SkinRow>,
  pictures: readonly PictureRow[],
): ShopperSkinDTO | undefined {
  const id = placement.memberSkinId ?? (hasCode ? placement.defaultCodeSkinId : null) ?? placement.defaultSkinId;
  const skin = skins.get(id) ?? skins.get(placement.defaultSkinId);
  if (!skin) return undefined;
  if (skin.layout === "classic") return { id: skin.id, version: skin.version, layout: "classic", size: placement.size };
  const settings = skin.settings as SkinSettings;
  const dto: ShopperSkinDTO = { id: skin.id, version: skin.version, layout: skin.layout, size: placement.size, settings };
  const picture = pickPicture(skin.layout as DesignedLayout, settings, pictures, placement.imageId);
  const url = picture ? publicImageUrl(picture.storageKey) : null;
  if (picture && url) {
    dto.picture = {
      url,
      ...imageWidthsField(picture.widths),
      width: picture.width,
      height: picture.height,
      alt: picture.alt,
      focusX: picture.focusX,
      focusY: picture.focusY,
    };
  }
  return dto;
}
