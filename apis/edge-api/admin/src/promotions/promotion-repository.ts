// Every write audits in the same transaction. State is never stored (`public.promotion_state`). Once
// used, what a promotion gives and who it is for are fixed: the service refuses, triggers back it up.
import { query, withTransaction, type Queryable } from "@effy/edge-shared";
import { loadPromotions, type PromotionRecord } from "@effy/edge-shared/promotions";

import type { AdminPromotionImageDTO } from "@effy/shared-types";

import { listImages } from "./images";
import { type AuditEntry, type Paged, PromoError } from "./types";

export const PROMOTION_STATES = ["draft", "scheduled", "active", "paused", "used_up", "out_of_budget", "ended", "archived"] as const;
export type PromotionState = (typeof PROMOTION_STATES)[number];

/** Undefined leaves a column as it is (PATCH). */
export interface PromotionWrite {
  name?: string;
  kind?: "cart" | "item" | "bxgy" | "delivery";
  trigger?: "automatic" | "code";
  valueType?: "percent" | "amount" | "free";
  percentOff?: number | null;
  amountOff?: string | null;
  maxDiscount?: string | null;
  bxgyBuy?: number | null;
  bxgyGet?: number | null;
  bxgyMaxPerOrder?: number | null;
  appliesTo?: "cart" | "products" | "categories" | "brands";
  deliveryTypes?: ("effy" | "courier")[];
  audience?: "everyone" | "first_order" | "new_customers" | "chosen";
  minSubtotal?: string;
  minQuantity?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  daysOfWeek?: number[] | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  maxUses?: number | null;
  maxUsesPerCustomer?: number | null;
  budget?: string | null;
  combinable?: boolean;
  headline?: string | null;
  supportingLine?: string | null;
  label?: string | null;
}

export interface PromotionWriteExtras {
  targets?: { productIds: string[]; categoryIds: string[]; brands: string[] };
  sharedCode?: string | null;
  groupIds?: string[];
  publish?: boolean;
}

const COLUMN: Record<keyof PromotionWrite, string> = {
  name: "name",
  kind: "kind",
  trigger: "trigger",
  valueType: "value_type",
  percentOff: "percent_off",
  amountOff: "amount_off",
  maxDiscount: "max_discount_amount",
  bxgyBuy: "bxgy_buy_qty",
  bxgyGet: "bxgy_get_qty",
  bxgyMaxPerOrder: "bxgy_max_per_order",
  appliesTo: "applies_to",
  deliveryTypes: "delivery_types",
  audience: "audience",
  minSubtotal: "min_subtotal_amount",
  minQuantity: "min_quantity",
  startsAt: "starts_at",
  endsAt: "ends_at",
  daysOfWeek: "days_of_week",
  timeFrom: "time_from",
  timeTo: "time_to",
  maxUses: "max_uses",
  maxUsesPerCustomer: "max_uses_per_customer",
  budget: "budget_amount",
  combinable: "combinable",
  headline: "headline",
  supportingLine: "supporting_line",
  label: "label",
};

async function audit(tx: Queryable, actor: string, action: string, targetType: string, targetId: string | null, detail: Record<string, unknown>) {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actor, action, targetType, targetId, JSON.stringify(detail)],
  );
}

function asRefusal(err: unknown): unknown {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code === "23505" && e.constraint === "promotion_code_code_uq") {
    return new PromoError(409, "code_taken", "That code is already used by another promotion.", [{ field: "sharedCode", message: "taken" }]);
  }
  if (e?.code === "P0001" && e.message === "promotion_used") {
    return new PromoError(409, "promotion_used", "This promotion has been used, so what it gives and who it is for can no longer change.");
  }
  if (e?.code === "P0001" && e.message === "headline_required") {
    return new PromoError(422, "headline_required", "Add a headline before showing this promotion in a group.", [{ field: "headline", message: "required" }]);
  }
  if (e?.code === "23514") return new PromoError(422, "invalid", "That combination of settings is not allowed.");
  return err;
}

export interface ListRow {
  id: string;
  name: string;
  state: PromotionState;
  starts_at: Date | null;
  ends_at: Date | null;
  max_uses: number | null;
  uses: string;
  shared_code: string | null;
  single_use: string;
  groups: string[];
  updated_at: Date;
  total: string;
}

export async function listPromotions(p: {
  q: string | null;
  state: PromotionState | null;
  kind: string | null;
  trigger: string | null;
  groupId: string | null;
  page: number;
  pageSize: number;
  now: Date;
}): Promise<{ rows: ListRow[]; records: Map<string, PromotionRecord>; counts: Record<PromotionState, number>; total: number }> {
  const where = `
    WHERE ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%'
           OR EXISTS (SELECT 1 FROM public.promotion_code c WHERE c.promotion_id = p.id AND upper(c.code) = upper($2)))
      AND ($3::text IS NULL OR p.kind = $3)
      AND ($4::text IS NULL OR p.trigger = $4)
      AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM public.promotion_group_member m WHERE m.promotion_id = p.id AND m.group_id = $5))`;
  const base = [p.now, p.q, p.kind, p.trigger, p.groupId];
  const [rows, counts] = await Promise.all([
    query<ListRow>(
      `SELECT y.*, count(*) OVER() AS total FROM (
         SELECT p.id::text, p.name, public.promotion_state(p.id, $1) AS state, p.starts_at, p.ends_at, p.max_uses, p.updated_at,
                (SELECT count(*) FROM public.promotion_use u WHERE u.promotion_id = p.id
                    AND (u.status = 'confirmed' OR (u.status = 'held' AND u.hold_expires_at > $1)))::text AS uses,
                (SELECT c.code FROM public.promotion_code c WHERE c.promotion_id = p.id AND NOT c.single_use) AS shared_code,
                (SELECT count(*) FROM public.promotion_code c WHERE c.promotion_id = p.id AND c.single_use)::text AS single_use,
                coalesce((SELECT array_agg(g.name ORDER BY g.sort) FROM public.promotion_group_member m
                            JOIN public.promotion_group g ON g.id = m.group_id WHERE m.promotion_id = p.id), '{}') AS groups
           FROM public.promotion p ${where}) y
        WHERE ($6::text IS NULL OR y.state = $6)
        ORDER BY y.updated_at DESC
        LIMIT $7 OFFSET $8`,
      [...base, p.state, p.pageSize, (p.page - 1) * p.pageSize],
    ),
    query<{ state: PromotionState; n: number }>(
      `SELECT public.promotion_state(p.id, $1) AS state, count(*)::int AS n FROM public.promotion p ${where} GROUP BY 1`,
      base,
    ),
  ]);
  const byState = Object.fromEntries(PROMOTION_STATES.map((s) => [s, 0])) as Record<PromotionState, number>;
  for (const r of counts.rows) byState[r.state] = Number(r.n);
  const ids = rows.rows.map((r) => r.id);
  const records = new Map((ids.length ? await loadPromotions({ query }, { ids }, p.now) : []).map((r) => [r.id, r]));
  return { rows: rows.rows, records, counts: byState, total: rows.rows[0] ? Number(rows.rows[0].total) : 0 };
}

export interface DetailExtras {
  published_at: Date | null;
  ended_at: Date | null;
  created_by: string;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  chosen: number;
  single_use: number;
  used: boolean;
  groups: { id: string; key: string; name: string; position: number }[];
  targets: { products: { id: string; name: string }[]; categories: { id: string; name: string }[]; brands: string[] };
  images: AdminPromotionImageDTO[];
}

export async function readPromotion(id: string, now: Date): Promise<{ record: PromotionRecord; extras: DetailExtras } | null> {
  const [record] = await loadPromotions({ query }, { ids: [id] }, now);
  if (!record) return null;
  const extras = (
    await query<DetailExtras>(
      `SELECT p.published_at, p.ended_at, p.created_by, p.updated_by, p.created_at, p.updated_at,
              (SELECT count(*)::int FROM public.promotion_customer pc WHERE pc.promotion_id = p.id) AS chosen,
              (SELECT count(*)::int FROM public.promotion_code c WHERE c.promotion_id = p.id AND c.single_use) AS single_use,
              public.promotion_is_used(p.id) AS used,
              coalesce((SELECT json_agg(json_build_object('id', g.id, 'key', g.key, 'name', g.name, 'position', m.position) ORDER BY g.sort)
                          FROM public.promotion_group_member m JOIN public.promotion_group g ON g.id = m.group_id
                         WHERE m.promotion_id = p.id), '[]') AS groups,
              json_build_object(
                'products', coalesce((SELECT json_agg(json_build_object('id', pr.id, 'name', pr.name) ORDER BY pr.name)
                                        FROM public.promotion_target t JOIN public.product pr ON pr.id = t.product_id WHERE t.promotion_id = p.id), '[]'),
                'categories', coalesce((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
                                          FROM public.promotion_target t JOIN public.category c ON c.id = t.category_id WHERE t.promotion_id = p.id), '[]'),
                'brands', coalesce((SELECT json_agg(t.brand ORDER BY t.brand) FROM public.promotion_target t
                                     WHERE t.promotion_id = p.id AND t.brand IS NOT NULL), '[]')
              ) AS targets
         FROM public.promotion p WHERE p.id = $1`,
      [id],
    )
  ).rows[0]!;
  extras.images = await listImages(id);
  return { record, extras };
}

async function writeExtras(tx: Queryable, id: string, x: PromotionWriteExtras, actor: string) {
  if (x.targets) {
    await tx.query(`DELETE FROM public.promotion_target WHERE promotion_id = $1`, [id]);
    for (const pid of x.targets.productIds) await tx.query(`INSERT INTO public.promotion_target (promotion_id, target_type, product_id) VALUES ($1, 'product', $2)`, [id, pid]);
    for (const cid of x.targets.categoryIds) await tx.query(`INSERT INTO public.promotion_target (promotion_id, target_type, category_id) VALUES ($1, 'category', $2)`, [id, cid]);
    for (const b of x.targets.brands) await tx.query(`INSERT INTO public.promotion_target (promotion_id, target_type, brand) VALUES ($1, 'brand', $2)`, [id, b]);
  }
  if (x.sharedCode !== undefined) {
    const current = (await tx.query<{ id: string; code: string }>(`SELECT id::text, code FROM public.promotion_code WHERE promotion_id = $1 AND NOT single_use`, [id])).rows[0];
    if (x.sharedCode === null) {
      if (current) await tx.query(`DELETE FROM public.promotion_code WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM public.promotion_use WHERE code_id = $1)`, [current.id]);
    } else if (!current) {
      await tx.query(`INSERT INTO public.promotion_code (promotion_id, code) VALUES ($1, $2)`, [id, x.sharedCode]);
    } else if (current.code !== x.sharedCode) {
      await tx.query(`UPDATE public.promotion_code SET code = $2 WHERE id = $1`, [current.id, x.sharedCode]);
    }
  }
  if (x.groupIds) {
    if (x.groupIds.length > 0) {
      const h = await tx.query<{ headline: string | null }>(`SELECT headline FROM public.promotion WHERE id = $1`, [id]);
      if (!h.rows[0]?.headline) throw new PromoError(422, "headline_required", "Add a headline before showing this promotion in a group.", [{ field: "headline", message: "required" }]);
    }
    await tx.query(`DELETE FROM public.promotion_group_member WHERE promotion_id = $1 AND NOT (group_id = ANY($2::uuid[]))`, [id, x.groupIds]);
    for (const g of x.groupIds) {
      // Newly placed in a group: goes to its end.
      await tx.query(
        `INSERT INTO public.promotion_group_member (group_id, promotion_id, position)
         SELECT $1, $2, coalesce(max(position) + 1, 0) FROM public.promotion_group_member WHERE group_id = $1
         ON CONFLICT (group_id, promotion_id) DO NOTHING`,
        [g, id],
      );
    }
  }
  void actor;
}

export async function createPromotion(w: PromotionWrite, x: PromotionWriteExtras, actor: string): Promise<string> {
  const keys = (Object.keys(w) as (keyof PromotionWrite)[]).filter((k) => w[k] !== undefined);
  const cols = [...keys.map((k) => COLUMN[k]), "created_by", ...(x.publish ? ["published_at"] : [])];
  const vals: unknown[] = [...keys.map((k) => w[k]), actor, ...(x.publish ? [new Date()] : [])];
  try {
    return await withTransaction(async (tx) => {
      const id = (
        await tx.query<{ id: string }>(
          `INSERT INTO public.promotion (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id::text AS id`,
          vals,
        )
      ).rows[0]!.id;
      await writeExtras(tx, id, x, actor);
      await audit(tx, actor, "promotion.created", "promotion", id, { ...w, ...x });
      return id;
    });
  } catch (err) {
    throw asRefusal(err);
  }
}

/** Whether it was used is decided under the promotion's row lock, the one the payment intent takes. */
export async function updatePromotion(id: string, w: PromotionWrite, x: PromotionWriteExtras, actor: string, touchesFixed = false): Promise<void> {
  const keys = (Object.keys(w) as (keyof PromotionWrite)[]).filter((k) => w[k] !== undefined);
  try {
    await withTransaction(async (tx) => {
      const locked = await tx.query<{ used: boolean }>(`SELECT public.promotion_is_used(id) AS used FROM public.promotion WHERE id = $1 FOR UPDATE`, [id]);
      if (!locked.rows[0]) throw new PromoError(404, "not_found", "promotion not found");
      if (touchesFixed && locked.rows[0].used) {
        throw new PromoError(409, "promotion_used", "This promotion has been used, so what it gives and who it is for can no longer change.");
      }
      const sets = keys.map((k, i) => `${COLUMN[k]} = $${i + 3}`);
      const res = await tx.query(
        `UPDATE public.promotion SET ${[...sets, "updated_by = $2", "updated_at = now()"].join(", ")} WHERE id = $1`,
        [id, actor, ...keys.map((k) => w[k])],
      );
      if (res.rowCount === 0) throw new PromoError(404, "not_found", "promotion not found");
      await writeExtras(tx, id, x, actor);
      await audit(tx, actor, "promotion.updated", "promotion", id, { changed: [...keys, ...Object.keys(x)] });
    });
  } catch (err) {
    throw asRefusal(err);
  }
}

export async function applyAction(id: string, action: "publish" | "pause" | "resume" | "end" | "archive", actor: string): Promise<void> {
  const set: Record<typeof action, string> = {
    publish: "published_at = coalesce(published_at, now())",
    pause: "paused = true",
    resume: "paused = false",
    end: "ended_at = coalesce(ended_at, now())",
    archive: "archived_at = coalesce(archived_at, now()), ended_at = coalesce(ended_at, now())",
  };
  await withTransaction(async (tx) => {
    const res = await tx.query(`UPDATE public.promotion SET ${set[action]}, updated_by = $2, updated_at = now() WHERE id = $1`, [id, actor]);
    if (res.rowCount === 0) throw new PromoError(404, "not_found", "promotion not found");
    // Archived or ended: it leaves every group.
    if (action === "archive") await tx.query(`DELETE FROM public.promotion_group_member WHERE promotion_id = $1`, [id]);
    await audit(tx, actor, `promotion.${action}`, "promotion", id, {});
  });
}

export async function deletePromotion(id: string, actor: string): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      await tx.query(`DELETE FROM public.promotion_group_member WHERE promotion_id = $1`, [id]);
      const res = await tx.query(`DELETE FROM public.promotion WHERE id = $1 AND NOT public.promotion_is_used($1)`, [id]);
      if (res.rowCount === 0) throw new PromoError(409, "promotion_used", "A promotion that has been used can't be deleted. Archive it instead.");
      await audit(tx, actor, "promotion.deleted", "promotion", id, {});
    });
  } catch (err) {
    throw asRefusal(err);
  }
}

export async function promotionAudit(id: string, limit: number): Promise<AuditEntry[]> {
  const res = await query<{ id: string; actor_sub: string; action: string; target_type: string; target_id: string | null; detail: Record<string, unknown>; created_at: Date }>(
    `SELECT a.id::text, a.actor_sub, a.action, a.target_type, a.target_id, a.detail, a.created_at
       FROM admin.audit_log a
      WHERE a.target_type = 'promotion' AND a.target_id = $1::uuid
      ORDER BY a.created_at DESC LIMIT $2`,
    [id, limit],
  );
  return res.rows.map((r) => ({ id: r.id, actorSub: r.actor_sub, action: r.action, targetType: r.target_type, targetId: r.target_id, detail: r.detail, createdAt: r.created_at.toISOString() }));
}

/** By name, SKU or brand; approved, not archived. */
export async function searchProducts(q: string, limit: number): Promise<{ id: string; name: string; brand: string | null }[]> {
  return (
    await query<{ id: string; name: string; brand: string | null }>(
      `SELECT p.id::text, p.name, p.brand FROM public.product p
        WHERE p.status <> 'archived'
          AND (p.name ILIKE '%' || $1 || '%' OR p.brand ILIKE '%' || $1 || '%'
               -- Stock codes are the variants'; a promotion still targets the PRODUCT.
               OR EXISTS (SELECT 1 FROM public.product_variant v
                           WHERE v.product_id = p.id AND v.state <> 'removed' AND (v.sku ILIKE '%' || $1 || '%' OR v.code = upper($1))))
        ORDER BY p.name LIMIT $2`,
      [q, limit],
    )
  ).rows;
}

export type { Paged };
