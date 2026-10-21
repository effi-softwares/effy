// 095 US2 — promotion skins: SQL only. Every write audits in the same transaction. Rules (validation,
// readability, the built-in Classic skin) are the service's.
import { query, withTransaction, type Queryable } from "@effy/edge-shared";
import type { AdminSkinDTO, AdminSkinListItemDTO, AdminSkinUsageDTO, DesignedLayout, GroupSize, SkinLayout, SkinSettings } from "@effy/shared-types";

interface SkinRow {
  id: string;
  name: string;
  layout: SkinLayout;
  settings: SkinSettings | Record<string, never>;
  version: number;
  usage_count: number;
  created_by: string;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const SELECT = `
  SELECT s.id::text, s.name, s.layout, s.settings, s.version, s.created_by, s.updated_by, s.created_at, s.updated_at,
         ((SELECT count(*) FROM public.promotion_group_member m WHERE m.skin_id = s.id)
        + (SELECT count(*) FROM public.promotion_group g WHERE g.default_skin_id = s.id OR g.default_code_skin_id = s.id))::int AS usage_count
    FROM public.promotion_skin s`;

function toItem(r: SkinRow): AdminSkinListItemDTO {
  return {
    id: r.id,
    name: r.name,
    layout: r.layout,
    version: r.version,
    builtIn: r.layout === "classic",
    usageCount: Number(r.usage_count),
    ...(r.layout === "classic" ? {} : { settings: r.settings as SkinSettings }),
    updatedAt: r.updated_at.toISOString(),
  };
}

async function audit(tx: Queryable, actor: string, action: string, id: string, detail: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'promotion_skin', $3, $4::jsonb)`,
    [actor, action, id, JSON.stringify(detail)],
  );
}

export async function listSkins(): Promise<AdminSkinListItemDTO[]> {
  // Classic first, then by name.
  return (await query<SkinRow>(`${SELECT} ORDER BY (s.layout = 'classic') DESC, lower(s.name)`)).rows.map(toItem);
}

export async function usageOf(db: Queryable, id: string): Promise<AdminSkinUsageDTO> {
  const [groups, defaults] = await Promise.all([
    db.query<{ id: string; key: string; name: string; members: number }>(
      `SELECT g.id::text, g.key, g.name, count(*)::int AS members
         FROM public.promotion_group_member m JOIN public.promotion_group g ON g.id = m.group_id
        WHERE m.skin_id = $1 GROUP BY g.id ORDER BY g.sort`,
      [id],
    ),
    db.query<{ id: string; key: string; name: string; for_code: boolean }>(
      `SELECT g.id::text, g.key, g.name, false AS for_code FROM public.promotion_group g WHERE g.default_skin_id = $1
       UNION ALL
       SELECT g.id::text, g.key, g.name, true FROM public.promotion_group g WHERE g.default_code_skin_id = $1`,
      [id],
    ),
  ]);
  return {
    placements: groups.rows.reduce((n, g) => n + Number(g.members), 0),
    groups: groups.rows.map((g) => ({ ...g, members: Number(g.members) })),
    defaultOf: defaults.rows.map((d) => ({ id: d.id, key: d.key, name: d.name, forCode: d.for_code })),
  };
}

export async function readSkin(id: string, db: Queryable = { query }): Promise<AdminSkinDTO | null> {
  const r = (await db.query<SkinRow>(`${SELECT} WHERE s.id = $1`, [id])).rows[0];
  if (!r) return null;
  return {
    ...toItem(r),
    usage: await usageOf(db, id),
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at.toISOString(),
  };
}

/** Sizes of the groups that would show this skin (as a member's choice or as a default). */
export async function sizesUsing(db: Queryable, id: string): Promise<GroupSize[]> {
  const res = await db.query<{ size: GroupSize }>(
    `SELECT DISTINCT g.size FROM public.promotion_group g
      WHERE g.default_skin_id = $1 OR g.default_code_skin_id = $1
         OR EXISTS (SELECT 1 FROM public.promotion_group_member m WHERE m.group_id = g.id AND m.skin_id = $1)`,
    [id],
  );
  return res.rows.map((r) => r.size);
}

export async function insertSkin(input: { name: string; layout: DesignedLayout; settings: SkinSettings }, actor: string, action = "promotion_skin.created", detail: Record<string, unknown> = {}): Promise<string> {
  return withTransaction(async (tx) => {
    const id = (
      await tx.query<{ id: string }>(
        `INSERT INTO public.promotion_skin (name, layout, settings, created_by) VALUES ($1, $2, $3::jsonb, $4) RETURNING id::text`,
        [input.name, input.layout, JSON.stringify(input.settings), actor],
      )
    ).rows[0]!.id;
    await audit(tx, actor, action, id, { name: input.name, layout: input.layout, ...detail });
    return id;
  });
}

/**
 * Update a skin if it is still at `expectedVersion` (FR-014). `check` runs inside the transaction with
 * the row locked, so a layout change cannot race a group that starts using the skin.
 */
export async function updateSkin(
  id: string,
  change: { name?: string; layout?: DesignedLayout; settings?: SkinSettings },
  expectedVersion: number,
  actor: string,
  check: (tx: Queryable, current: { layout: SkinLayout; version: number }) => Promise<void>,
): Promise<"updated" | "missing" | "stale"> {
  return withTransaction(async (tx) => {
    const cur = (await tx.query<{ layout: SkinLayout; version: number; settings: unknown }>(`SELECT layout, version, settings FROM public.promotion_skin WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!cur) return "missing";
    if (cur.version !== expectedVersion) return "stale";
    await check(tx, cur);
    await tx.query(
      `UPDATE public.promotion_skin
          SET name = coalesce($2, name), layout = coalesce($3, layout), settings = coalesce($4::jsonb, settings),
              version = version + 1, updated_by = $5, updated_at = now()
        WHERE id = $1`,
      [id, change.name ?? null, change.layout ?? null, change.settings ? JSON.stringify(change.settings) : null, actor],
    );
    const next = (change.settings ?? {}) as unknown as Record<string, unknown>;
    const before = cur.settings as Record<string, unknown>;
    const changedKeys = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
    await audit(tx, actor, "promotion_skin.updated", id, {
      ...(change.name ? { name: change.name } : {}),
      ...(change.layout && change.layout !== cur.layout ? { layout: change.layout } : {}),
      ...(changedKeys.length ? { settings: changedKeys } : {}),
      version: expectedVersion + 1,
    });
    return "updated";
  });
}

/** Delete a skin nothing uses. Answers the usage instead when something does (FR-013). */
export async function deleteSkin(id: string, actor: string): Promise<"deleted" | "missing" | AdminSkinUsageDTO> {
  return withTransaction(async (tx) => {
    const cur = (await tx.query<{ name: string }>(`SELECT name FROM public.promotion_skin WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!cur) return "missing";
    const usage = await usageOf(tx, id);
    if (usage.placements > 0 || usage.defaultOf.length > 0) return usage;
    await tx.query(`DELETE FROM public.promotion_skin WHERE id = $1`, [id]);
    await audit(tx, actor, "promotion_skin.deleted", id, { name: cur.name });
    return "deleted";
  });
}
