// Every write audits in the same transaction.
import { query, withTransaction, type Queryable } from "@effy/edge-shared";
import {
  hiddenBecause,
  loadPictures,
  loadPromotions,
  loadSkins,
  placedPromotion,
  PLACEMENT_COLUMNS,
  placementOf,
  skinIdsOf,
} from "@effy/edge-shared/promotions";
import {
  layoutFits,
  type AdminPromotionGroupDetailDTO,
  type AdminPromotionGroupDTO,
  type AdminPromotionGroupPreviewDTO,
  type AdminSkinRefDTO,
  type GroupSize,
  type SkinLayout,
} from "@effy/shared-types";

import { PromoError } from "../promotions/types";

interface GroupRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort: number;
  count: number;
  size: GroupSize;
  ds_id: string;
  ds_name: string;
  ds_layout: SkinLayout;
  cs_id: string | null;
  cs_name: string | null;
  cs_layout: SkinLayout | null;
}

const toDTO = (r: GroupRow): AdminPromotionGroupDTO => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  sort: r.sort,
  count: Number(r.count),
  size: r.size,
  defaultSkin: { id: r.ds_id, name: r.ds_name, layout: r.ds_layout },
  defaultCodeSkin: r.cs_id ? { id: r.cs_id, name: r.cs_name!, layout: r.cs_layout! } : null,
});

const SELECT = `
  SELECT g.id::text, g.key, g.name, g.description, g.sort, g.size,
         ds.id::text AS ds_id, ds.name AS ds_name, ds.layout AS ds_layout,
         cs.id::text AS cs_id, cs.name AS cs_name, cs.layout AS cs_layout,
         (SELECT count(*)::int FROM public.promotion_group_member m WHERE m.group_id = g.id) AS count
    FROM public.promotion_group g
    JOIN public.promotion_skin ds ON ds.id = g.default_skin_id
    LEFT JOIN public.promotion_skin cs ON cs.id = g.default_code_skin_id`;

async function audit(tx: Queryable, actor: string, action: string, id: string, detail: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'promotion_group', $3, $4::jsonb)`,
    [actor, action, id, JSON.stringify(detail)],
  );
}

const doesNotFit = (field: string, layout: string, size: GroupSize) =>
  new PromoError(422, "skin_does_not_fit", `A ${layout.replace("_", " ")} skin doesn't fit a ${size} place.`, [{ field, message: `doesn't fit a ${size} place` }]);

/** A missing skin is refused. */
async function layoutsOf(db: Queryable, ids: readonly string[], field: string): Promise<Map<string, SkinLayout>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();
  const res = await db.query<{ id: string; layout: SkinLayout }>(`SELECT id::text, layout FROM public.promotion_skin WHERE id = ANY($1::uuid[])`, [wanted]);
  if (res.rowCount !== wanted.length) throw new PromoError(422, "unknown_skin", "That skin no longer exists.", [{ field, message: "unknown" }]);
  return new Map(res.rows.map((r) => [r.id, r.layout]));
}

export async function listGroups(): Promise<AdminPromotionGroupDTO[]> {
  return (await query<GroupRow>(`${SELECT} ORDER BY g.sort, g.name`)).rows.map(toDTO);
}

export async function readGroup(id: string, now: Date): Promise<AdminPromotionGroupDetailDTO | null> {
  const g = (await query<GroupRow>(`${SELECT} WHERE g.id = $1`, [id])).rows[0];
  if (!g) return null;
  const members = await query<{
    promotion_id: string; name: string; headline: string | null; state: string; position: number;
    size: string; member_skin_id: string | null; default_skin_id: string; default_code_skin_id: string | null; image_id: string | null;
  }>(
    `SELECT m.promotion_id::text, p.name, p.headline, public.promotion_state(p.id, $2) AS state, m.position, ${PLACEMENT_COLUMNS}
       FROM public.promotion_group_member m
       JOIN public.promotion p ON p.id = m.promotion_id
       JOIN public.promotion_group g ON g.id = m.group_id
      WHERE m.group_id = $1 ORDER BY m.position, p.name`,
    [id, now],
  );
  const placements = members.rows.map(placementOf);
  const ids = members.rows.map((m) => m.promotion_id);
  const db = { query };
  const [recs, skins, pictures] = await Promise.all([
    ids.length ? loadPromotions(db, { ids }, now) : Promise.resolve([]),
    loadSkins(db, skinIdsOf(placements)),
    loadPictures(db, ids),
  ]);
  const byId = new Map(recs.map((r) => [r.id, r]));
  return {
    ...toDTO(g),
    members: members.rows.flatMap((m, i) => {
      const rec = byId.get(m.promotion_id);
      if (!rec) return [];
      return [{
        promotionId: m.promotion_id,
        name: m.name,
        headline: m.headline,
        state: m.state as never,
        position: m.position,
        skinId: m.member_skin_id,
        imageId: m.image_id,
        resolved: placedPromotion(rec, placements[i]!, skins, pictures.get(m.promotion_id) ?? [], now),
      }];
    }),
  };
}

export async function createGroup(input: { key: string; name: string; description: string | null; size: GroupSize }, actor: string): Promise<AdminPromotionGroupDTO> {
  try {
    return await withTransaction(async (tx) => {
      const r = (
        await tx.query<{ id: string }>(
          `INSERT INTO public.promotion_group (key, name, description, sort, size, default_skin_id)
           VALUES ($1, $2, $3, coalesce((SELECT max(sort) + 10 FROM public.promotion_group), 10), $4,
                   (SELECT id FROM public.promotion_skin WHERE layout = 'classic'))
           RETURNING id::text`,
          [input.key, input.name, input.description, input.size],
        )
      ).rows[0]!;
      await audit(tx, actor, "promotion_group.created", r.id, input);
      return toDTO((await tx.query<GroupRow>(`${SELECT} WHERE g.id = $1`, [r.id])).rows[0]!);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new PromoError(409, "key_taken", "That key is already used by another group.", [{ field: "key", message: "taken" }]);
    throw err;
  }
}

export interface GroupChange {
  name?: string;
  description?: string | null;
  sort?: number;
  size?: GroupSize;
  defaultSkinId?: string;
  defaultCodeSkinId?: string | null;
}

/** A new size keeps only members whose skin fits (the rest revert to the default and are returned). */
export async function updateGroup(id: string, input: GroupChange, actor: string): Promise<{ reset: string[] }> {
  return withTransaction(async (tx) => {
    const cur = (
      await tx.query<{ size: GroupSize; default_skin_id: string; default_code_skin_id: string | null }>(
        `SELECT size, default_skin_id::text, default_code_skin_id::text FROM public.promotion_group WHERE id = $1 FOR UPDATE`,
        [id],
      )
    ).rows[0];
    if (!cur) throw new PromoError(404, "not_found", "group not found");
    const size = input.size ?? cur.size;
    const defaultSkin = input.defaultSkinId ?? cur.default_skin_id;
    const codeSkin = input.defaultCodeSkinId !== undefined ? input.defaultCodeSkinId : cur.default_code_skin_id;
    const layouts = await layoutsOf(tx, [defaultSkin, ...(codeSkin ? [codeSkin] : [])], "defaultSkinId");
    if (!layoutFits(layouts.get(defaultSkin)!, size)) throw doesNotFit("defaultSkinId", layouts.get(defaultSkin)!, size);
    if (codeSkin && !layoutFits(layouts.get(codeSkin)!, size)) throw doesNotFit("defaultCodeSkinId", layouts.get(codeSkin)!, size);

    await tx.query(
      `UPDATE public.promotion_group
          SET name = coalesce($2, name),
              description = CASE WHEN $5 THEN $3 ELSE description END,
              sort = coalesce($4, sort),
              size = $6, default_skin_id = $7, default_code_skin_id = $8,
              updated_at = now()
        WHERE id = $1`,
      [id, input.name ?? null, input.description ?? null, input.sort ?? null, input.description !== undefined, size, defaultSkin, codeSkin],
    );
    let reset: string[] = [];
    if (size !== cur.size) {
      const stranded = await tx.query<{ promotion_id: string; layout: SkinLayout }>(
        `SELECT m.promotion_id::text, s.layout FROM public.promotion_group_member m JOIN public.promotion_skin s ON s.id = m.skin_id WHERE m.group_id = $1`,
        [id],
      );
      reset = stranded.rows.filter((r) => !layoutFits(r.layout, size)).map((r) => r.promotion_id);
      if (reset.length) {
        await tx.query(`UPDATE public.promotion_group_member SET skin_id = NULL WHERE group_id = $1 AND promotion_id = ANY($2::uuid[])`, [id, reset]);
      }
    }
    await audit(tx, actor, "promotion_group.updated", id, { ...input, ...(reset.length ? { reset } : {}) });
    return { reset };
  });
}

export async function deleteGroup(id: string, actor: string): Promise<void> {
  await withTransaction(async (tx) => {
    const res = await tx.query(`DELETE FROM public.promotion_group WHERE id = $1`, [id]);
    if (res.rowCount === 0) throw new PromoError(404, "not_found", "group not found");
    await audit(tx, actor, "promotion_group.deleted", id, {});
  });
}

export interface MemberInput {
  promotionId: string;
  skinId: string | null;
  imageId: string | null;
}

/** In the order given. */
export async function putMembers(id: string, members: MemberInput[], actor: string): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      const g = (await tx.query<{ size: GroupSize }>(`SELECT size FROM public.promotion_group WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!g) throw new PromoError(404, "not_found", "group not found");
      const promotionIds = members.map((m) => m.promotionId);
      // Shown only with words a shopper can read.
      const missing = await tx.query(`SELECT 1 FROM public.promotion WHERE id = ANY($1::uuid[]) AND headline IS NULL`, [promotionIds]);
      if ((missing.rowCount ?? 0) > 0) throw new PromoError(422, "headline_required", "A promotion needs a headline before it can be shown in a group.");
      // The skin fits the group's size, and the picture is its own promotion's.
      const layouts = await layoutsOf(tx, members.flatMap((m) => (m.skinId ? [m.skinId] : [])), "members.skinId");
      for (const m of members) {
        if (m.skinId && !layoutFits(layouts.get(m.skinId)!, g.size)) throw doesNotFit("members.skinId", layouts.get(m.skinId)!, g.size);
      }
      const chosen = members.filter((m) => m.imageId);
      if (chosen.length) {
        const owned = await tx.query<{ id: string; promotion_id: string }>(
          `SELECT id::text, promotion_id::text FROM public.promotion_image WHERE id = ANY($1::uuid[])`,
          [chosen.map((m) => m.imageId)],
        );
        const owner = new Map(owned.rows.map((r) => [r.id, r.promotion_id]));
        if (chosen.some((m) => owner.get(m.imageId!) !== m.promotionId)) {
          throw new PromoError(422, "image_not_on_promotion", "That picture belongs to another promotion.", [{ field: "members.imageId", message: "not this promotion's" }]);
        }
      }
      await tx.query(`DELETE FROM public.promotion_group_member WHERE group_id = $1`, [id]);
      for (const [i, m] of members.entries()) {
        await tx.query(
          `INSERT INTO public.promotion_group_member (group_id, promotion_id, position, skin_id, image_id) VALUES ($1, $2, $3, $4, $5)`,
          [id, m.promotionId, i, m.skinId, m.imageId],
        );
      }
      await audit(tx, actor, "promotion_group.members_set", id, { members });
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23503") throw new PromoError(422, "unknown_promotion", "One of those promotions no longer exists.");
    throw err;
  }
}

/** In the skins a signed-out shopper would see, and why each other member is hidden. */
export async function previewGroup(id: string, now: Date): Promise<AdminPromotionGroupPreviewDTO> {
  const rows = (
    await query<{ promotion_id: string; size: string; member_skin_id: string | null; default_skin_id: string; default_code_skin_id: string | null; image_id: string | null }>(
      `SELECT m.promotion_id::text, ${PLACEMENT_COLUMNS}
         FROM public.promotion_group_member m JOIN public.promotion_group g ON g.id = m.group_id
        WHERE m.group_id = $1 ORDER BY m.position`,
      [id],
    )
  ).rows;
  const ids = rows.map((r) => r.promotion_id);
  const placements = rows.map(placementOf);
  const db = { query };
  const [recs, skins, pictures] = await Promise.all([
    ids.length ? loadPromotions(db, { ids }, now) : Promise.resolve([]),
    loadSkins(db, skinIdsOf(placements)),
    loadPictures(db, ids),
  ]);
  const byId = new Map(recs.map((r) => [r.id, r]));
  const shown: AdminPromotionGroupPreviewDTO["shown"] = [];
  const hidden: AdminPromotionGroupPreviewDTO["hidden"] = [];
  rows.forEach((row, i) => {
    const r = byId.get(row.promotion_id);
    if (!r) return;
    const why = hiddenBecause(r, null, false);
    if (why === null) shown.push(placedPromotion(r, placements[i]!, skins, pictures.get(r.id) ?? [], now));
    else hidden.push({ promotionId: r.id, name: r.name, why });
  });
  return { shown, hidden };
}

export type { AdminSkinRefDTO };
