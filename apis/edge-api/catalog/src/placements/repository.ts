// The one writer of `product_placement` (101), beside the taxonomy writer that drops a retired category's
// placements. A placement is an extra "also shown in" leaf for browsing; it never changes the product's form.
import { likePattern, limitOffsetClause, orderBy, query, runOffsetPage, type Queryable } from "@effy/edge-shared";

import { MISSING_DETAILS, type MissingDetailsRequest } from "../review/list";

export async function productHome(tx: Queryable, productId: string): Promise<string | null> {
  const r = await tx.query<{ c: string }>(`SELECT primary_category_id::text AS c FROM public.product WHERE id = $1 FOR UPDATE`, [productId]);
  return r.rows[0]?.c ?? null;
}

/** The ids among `ids` that are active leaves. */
export async function activeLeaves(tx: Queryable, ids: string[]): Promise<Set<string>> {
  const r = await tx.query<{ id: string }>(`SELECT category_id::text AS id FROM public.category_resolved WHERE is_leaf AND category_id = ANY($1::uuid[])`, [ids]);
  return new Set(r.rows.map((x) => x.id));
}

export async function currentPlacements(tx: Queryable, productId: string): Promise<string[]> {
  const r = await tx.query<{ id: string }>(`SELECT category_id::text AS id FROM public.product_placement WHERE product_id = $1 ORDER BY category_id`, [productId]);
  return r.rows.map((x) => x.id);
}

/** Replace: the product's placements become exactly `ids`. */
export async function replacePlacements(tx: Queryable, productId: string, ids: string[], actor: string): Promise<void> {
  await tx.query(`DELETE FROM public.product_placement WHERE product_id = $1 AND NOT (category_id = ANY($2::uuid[]))`, [productId, ids]);
  await tx.query(
    `INSERT INTO public.product_placement (product_id, category_id, created_by)
     SELECT $1, c, $3 FROM unnest($2::uuid[]) AS c
     ON CONFLICT DO NOTHING`,
    [productId, ids, actor],
  );
}

export async function auditPlacements(tx: Queryable, actor: string, productId: string, before: string[], after: string[]): Promise<void> {
  await tx.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, 'catalog.placements_set', 'product', $2, $3::jsonb)`,
    [actor, productId, JSON.stringify({ before, after })],
  );
}


/** Products with a required detail empty — added after they went on sale (FR-024) — newest change first, keyset by (updated_at, id). */
/** Products on sale with a required detail empty, one page with its exact total (103). */
export async function missingDetailsPage(req: MissingDetailsRequest, db: Queryable = { query }) {
  return runOffsetPage(req, async (read) => {
    const args: unknown[] = [req.filters.shopId ?? null, req.filters.categoryId ?? null, req.q ? likePattern(req.q) : null];
    const paging = limitOffsetClause(read, args);
    const r = await db.query<{ id: string; name: string; shop_name: string; path: string[]; missing: string[]; full_count: string }>(
      `SELECT p.id::text, p.name, s.name AS shop_name, r.path_names AS path, m.missing, count(*) OVER () AS full_count
         FROM public.product p
         JOIN public.shop s ON s.id = p.shop_id
         JOIN public.category_resolved r ON r.category_id = p.primary_category_id
         CROSS JOIN LATERAL (
           SELECT array_agg(DISTINCT x.attribute_name ORDER BY x.attribute_name) AS missing FROM public.product_missing_required(p.id) x
         ) m
        WHERE p.status <> 'archived' AND p.approved_at IS NOT NULL AND m.missing IS NOT NULL
          AND ($1::uuid IS NULL OR p.shop_id = $1)
          AND ($2::uuid IS NULL OR p.primary_category_id IN (SELECT ca.category_id FROM public.category_ancestor ca WHERE ca.ancestor_id = $2))
          AND ($3::text IS NULL OR p.name ILIKE $3)
        ${orderBy(MISSING_DETAILS, req)}
        ${paging}`,
      args,
    );
    return r.rows;
  });
}
