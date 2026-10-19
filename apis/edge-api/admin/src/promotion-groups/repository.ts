// Display groups (094 US2) — SQL only. Every write audits in the same transaction.
import { query, withTransaction, type Queryable } from "@effy/edge-shared";
import { hiddenBecause, loadPromotions, shopperPromotion } from "@effy/edge-shared/promotions";
import type { AdminPromotionGroupDetailDTO, AdminPromotionGroupDTO, AdminPromotionGroupPreviewDTO } from "@effy/shared-types";

import { PromoError } from "../promotions/types";

interface GroupRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort: number;
  count: number;
}

const toDTO = (r: GroupRow): AdminPromotionGroupDTO => ({ id: r.id, key: r.key, name: r.name, description: r.description, sort: r.sort, count: Number(r.count) });

const SELECT = `
  SELECT g.id::text, g.key, g.name, g.description, g.sort,
         (SELECT count(*)::int FROM public.promotion_group_member m WHERE m.group_id = g.id) AS count
    FROM public.promotion_group g`;

async function audit(tx: Queryable, actor: string, action: string, id: string, detail: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'promotion_group', $3, $4::jsonb)`,
    [actor, action, id, JSON.stringify(detail)],
  );
}

export async function listGroups(): Promise<AdminPromotionGroupDTO[]> {
  return (await query<GroupRow>(`${SELECT} ORDER BY g.sort, g.name`)).rows.map(toDTO);
}

export async function readGroup(id: string, now: Date): Promise<AdminPromotionGroupDetailDTO | null> {
  const g = (await query<GroupRow>(`${SELECT} WHERE g.id = $1`, [id])).rows[0];
  if (!g) return null;
  const members = await query<{ promotion_id: string; name: string; headline: string | null; state: string; position: number }>(
    `SELECT m.promotion_id::text, p.name, p.headline, public.promotion_state(p.id, $2) AS state, m.position
       FROM public.promotion_group_member m JOIN public.promotion p ON p.id = m.promotion_id
      WHERE m.group_id = $1 ORDER BY m.position, p.name`,
    [id, now],
  );
  return {
    ...toDTO(g),
    members: members.rows.map((m) => ({ promotionId: m.promotion_id, name: m.name, headline: m.headline, state: m.state as never, position: m.position })),
  };
}

export async function createGroup(input: { key: string; name: string; description: string | null }, actor: string): Promise<AdminPromotionGroupDTO> {
  try {
    return await withTransaction(async (tx) => {
      const r = (
        await tx.query<GroupRow>(
          `INSERT INTO public.promotion_group (key, name, description, sort)
           VALUES ($1, $2, $3, coalesce((SELECT max(sort) + 10 FROM public.promotion_group), 10))
           RETURNING id::text, key, name, description, sort, 0 AS count`,
          [input.key, input.name, input.description],
        )
      ).rows[0]!;
      await audit(tx, actor, "promotion_group.created", r.id, input);
      return toDTO(r);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new PromoError(409, "key_taken", "That key is already used by another group.", [{ field: "key", message: "taken" }]);
    throw err;
  }
}

export async function updateGroup(id: string, input: { name?: string; description?: string | null; sort?: number }, actor: string): Promise<void> {
  await withTransaction(async (tx) => {
    const res = await tx.query(
      `UPDATE public.promotion_group
          SET name = coalesce($2, name),
              description = CASE WHEN $5 THEN $3 ELSE description END,
              sort = coalesce($4, sort), updated_at = now()
        WHERE id = $1`,
      [id, input.name ?? null, input.description ?? null, input.sort ?? null, input.description !== undefined],
    );
    if (res.rowCount === 0) throw new PromoError(404, "not_found", "group not found");
    await audit(tx, actor, "promotion_group.updated", id, input);
  });
}

export async function deleteGroup(id: string, actor: string): Promise<void> {
  await withTransaction(async (tx) => {
    const res = await tx.query(`DELETE FROM public.promotion_group WHERE id = $1`, [id]);
    if (res.rowCount === 0) throw new PromoError(404, "not_found", "group not found");
    await audit(tx, actor, "promotion_group.deleted", id, {});
  });
}

/** Replace the members, in the order given. A promotion without a headline is refused (database trigger). */
export async function putMembers(id: string, promotionIds: string[], actor: string): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      const exists = await tx.query(`SELECT 1 FROM public.promotion_group WHERE id = $1 FOR UPDATE`, [id]);
      if (exists.rowCount === 0) throw new PromoError(404, "not_found", "group not found");
      // FR-024 — a promotion is shown only with words a shopper can read.
      const missing = await tx.query(`SELECT 1 FROM public.promotion WHERE id = ANY($1::uuid[]) AND headline IS NULL`, [promotionIds]);
      if ((missing.rowCount ?? 0) > 0) throw new PromoError(422, "headline_required", "A promotion needs a headline before it can be shown in a group.");
      await tx.query(`DELETE FROM public.promotion_group_member WHERE group_id = $1`, [id]);
      for (const [i, pid] of promotionIds.entries()) {
        await tx.query(`INSERT INTO public.promotion_group_member (group_id, promotion_id, position) VALUES ($1, $2, $3)`, [id, pid, i]);
      }
      await audit(tx, actor, "promotion_group.members_set", id, { promotionIds });
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23503") throw new PromoError(422, "unknown_promotion", "One of those promotions no longer exists.");
    throw err;
  }
}

/** What a signed-out shopper sees in this group now, and why each other member is hidden (FR-025). */
export async function previewGroup(id: string, now: Date): Promise<AdminPromotionGroupPreviewDTO> {
  const ids = (await query<{ promotion_id: string }>(`SELECT promotion_id::text FROM public.promotion_group_member WHERE group_id = $1 ORDER BY position`, [id])).rows.map((r) => r.promotion_id);
  const recs = ids.length ? await loadPromotions({ query }, { ids }, now) : [];
  const byId = new Map(recs.map((r) => [r.id, r]));
  const shown: AdminPromotionGroupPreviewDTO["shown"] = [];
  const hidden: AdminPromotionGroupPreviewDTO["hidden"] = [];
  for (const pid of ids) {
    const r = byId.get(pid);
    if (!r) continue;
    const why = hiddenBecause(r, null, false);
    if (why === null) shown.push(shopperPromotion(r, now));
    else hidden.push({ promotionId: r.id, name: r.name, why });
  }
  return { shown, hidden };
}
