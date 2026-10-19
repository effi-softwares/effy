// A promotion's chosen customers (US6), single-use code batches (US7) and performance (US9) — 094.
// Repository and rules together: each is small, and each writes its audit row in the same transaction.
import { randomInt, randomUUID } from "node:crypto";

import { announce } from "@effy/edge-shared/live";
import { query, withTransaction } from "@effy/edge-shared";
import type {
  AdminAddPromotionCustomersResponse,
  AdminGenerateCodesResponse,
  AdminPromotionCodeListDTO,
  AdminPromotionCustomerListDTO,
  AdminPromotionPerformanceDTO,
  PromotionPerformanceWindowDTO,
} from "@effy/shared-types";

import { PromoError } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** R15 — no look-alikes (0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;
const MAX_BATCH = 10_000;

const notFound = () => new PromoError(404, "not_found", "promotion not found");
const changed = () => announce([{ scope: "ops", kind: "promotions" }]);
const page = (n: unknown) => (typeof n === "string" && Number(n) > 0 ? Math.floor(Number(n)) : 1);

async function assertPromotion(id: string): Promise<{ trigger: string; audience: string }> {
  if (!UUID.test(id)) throw notFound();
  const r = (await query<{ trigger: string; audience: string }>(`SELECT trigger, audience FROM public.promotion WHERE id = $1`, [id])).rows[0];
  if (!r) throw notFound();
  return r;
}

// ── chosen customers ────────────────────────────────────────────────────────────────────────────

export async function listCustomers(id: string, q: Record<string, string | undefined>): Promise<AdminPromotionCustomerListDTO> {
  await assertPromotion(id);
  const p = page(q.page);
  const pageSize = 50;
  const res = await query<{ id: string; name: string | null; email: string; total: string }>(
    `SELECT c.id::text, NULLIF(TRIM(CONCAT_WS(' ', c.given_name, c.family_name)), '') AS name, c.email, count(*) OVER() AS total
       FROM public.promotion_customer pc JOIN public.customer c ON c.id = pc.customer_id
      WHERE pc.promotion_id = $1 ORDER BY c.email LIMIT $2 OFFSET $3`,
    [id, pageSize, (p - 1) * pageSize],
  );
  return {
    items: res.rows.map((r) => ({ customerId: r.id, name: r.name, email: r.email })),
    total: res.rows[0] ? Number(res.rows[0].total) : 0,
    page: p,
    pageSize,
  };
}

/** Add by id or by email; emails that match no customer are listed back, never invented. */
export async function addCustomers(id: string, body: Record<string, unknown>, actor: string): Promise<AdminAddPromotionCustomersResponse> {
  const p = await assertPromotion(id);
  if (p.audience !== "chosen") throw new PromoError(409, "not_chosen_audience", "This promotion is not for chosen customers. Change who it is for first.");
  const ids = Array.isArray(body.customerIds) ? body.customerIds.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  const emails = Array.isArray(body.emails)
    ? [...new Set(body.emails.filter((x): x is string => typeof x === "string").map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))]
    : [];
  if (ids.length + emails.length === 0) throw new PromoError(422, "validation_failed", "customerIds or emails: add at least one", [{ field: "emails", message: "required" }]);
  if (ids.length + emails.length > 5_000) throw new PromoError(422, "validation_failed", "emails: at most 5,000 at a time", [{ field: "emails", message: "too many" }]);
  return withTransaction(async (tx) => {
    const found = emails.length
      ? (await tx.query<{ id: string; email: string }>(`SELECT id::text, lower(email) AS email FROM public.customer WHERE lower(email) = ANY($1::text[])`, [emails])).rows
      : [];
    const all = [...new Set([...ids, ...found.map((f) => f.id)])];
    const res = await tx.query(
      `INSERT INTO public.promotion_customer (promotion_id, customer_id)
       SELECT $1, c.id FROM public.customer c WHERE c.id = ANY($2::uuid[])
       ON CONFLICT DO NOTHING`,
      [id, all],
    );
    const known = new Set(found.map((f) => f.email));
    const unknownEmails = emails.filter((e) => !known.has(e));
    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, 'promotion.customers_added', 'promotion', $2, $3::jsonb)`,
      [actor, id, JSON.stringify({ added: res.rowCount ?? 0, unknown: unknownEmails.length })],
    );
    return { added: res.rowCount ?? 0, unknownEmails };
  }).finally(changed);
}

export async function removeCustomer(id: string, customerId: string, actor: string): Promise<void> {
  await assertPromotion(id);
  if (!UUID.test(customerId)) throw notFound();
  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM public.promotion_customer WHERE promotion_id = $1 AND customer_id = $2`, [id, customerId]);
    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, 'promotion.customer_removed', 'promotion', $2, '{}'::jsonb)`,
      [actor, id],
    );
  });
  await changed();
}

// ── single-use codes ────────────────────────────────────────────────────────────────────────────

function newCode(prefix: string): string {
  let s = prefix;
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export async function generateCodes(id: string, body: Record<string, unknown>, actor: string): Promise<AdminGenerateCodesResponse> {
  const p = await assertPromotion(id);
  if (p.trigger !== "code") throw new PromoError(409, "not_code_promotion", "Codes are for a promotion that applies with a code.");
  const count = typeof body.count === "number" && Number.isInteger(body.count) ? body.count : 0;
  if (count < 1 || count > MAX_BATCH) throw new PromoError(422, "validation_failed", `count: 1 to ${MAX_BATCH}`, [{ field: "count", message: `1 to ${MAX_BATCH}` }]);
  const prefix = typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : "";
  if (prefix && !/^[A-Z0-9]{1,8}-?$/.test(prefix)) throw new PromoError(422, "validation_failed", "prefix: up to 8 letters or numbers", [{ field: "prefix", message: "letters or numbers" }]);
  const batchId = randomUUID();
  return withTransaction(async (tx) => {
    let created = 0;
    // Insert in chunks; a code that collides with one ever issued is simply drawn again.
    for (let tries = 0; created < count && tries < 20; tries++) {
      const want = Math.min(count - created, 1000);
      const codes = Array.from({ length: want }, () => newCode(prefix));
      const res = await tx.query(
        `INSERT INTO public.promotion_code (promotion_id, code, single_use, batch_id)
         SELECT $1, c, true, $2 FROM unnest($3::text[]) AS c
         ON CONFLICT DO NOTHING`,
        [id, batchId, codes],
      );
      created += res.rowCount ?? 0;
    }
    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, 'promotion_code.batch_generated', 'promotion', $2, $3::jsonb)`,
      [actor, id, JSON.stringify({ batchId, created })],
    );
    return { batchId, created };
  }).finally(changed);
}

const CODE_STATE_SQL = `
  CASE WHEN EXISTS (SELECT 1 FROM public.promotion_use u WHERE u.code_id = c.id AND u.status = 'confirmed') THEN 'used'
       WHEN EXISTS (SELECT 1 FROM public.promotion_use u WHERE u.code_id = c.id AND u.status = 'held' AND u.hold_expires_at > now()) THEN 'held'
       ELSE 'unused' END`;

export async function listCodes(id: string, q: Record<string, string | undefined>): Promise<AdminPromotionCodeListDTO> {
  await assertPromotion(id);
  const p = page(q.page);
  const pageSize = 100;
  const state = q.state === "unused" || q.state === "held" || q.state === "used" ? q.state : null;
  const res = await query<{ code: string; state: "unused" | "held" | "used"; order_id: string | null; total: string }>(
    `SELECT y.*, count(*) OVER() AS total FROM (
       SELECT c.code, ${CODE_STATE_SQL} AS state,
              (SELECT u.order_id::text FROM public.promotion_use u WHERE u.code_id = c.id AND u.status = 'confirmed' LIMIT 1) AS order_id,
              c.created_at
         FROM public.promotion_code c WHERE c.promotion_id = $1 AND c.single_use) y
      WHERE ($2::text IS NULL OR y.state = $2)
      ORDER BY y.created_at, y.code LIMIT $3 OFFSET $4`,
    [id, state, pageSize, (p - 1) * pageSize],
  );
  return {
    items: res.rows.map((r) => ({ code: r.code, state: r.state, orderId: r.order_id })),
    total: res.rows[0] ? Number(res.rows[0].total) : 0,
    page: p,
    pageSize,
  };
}

/** Every single-use code with its state, as CSV (R15 — no file storage). */
export async function exportCodes(id: string): Promise<string> {
  await assertPromotion(id);
  const rows = (
    await query<{ code: string; state: string; order_id: string | null }>(
      `SELECT c.code, ${CODE_STATE_SQL} AS state,
              (SELECT u.order_id::text FROM public.promotion_use u WHERE u.code_id = c.id AND u.status = 'confirmed' LIMIT 1) AS order_id
         FROM public.promotion_code c WHERE c.promotion_id = $1 AND c.single_use ORDER BY c.created_at, c.code`,
      [id],
    )
  ).rows;
  return ["code,state,order_id", ...rows.map((r) => `${r.code},${r.state},${r.order_id ?? ""}`)].join("\n") + "\n";
}

// ── performance ─────────────────────────────────────────────────────────────────────────────────

/** Uses, customers, discount, orders and sales — lifetime, last 7 and last 30 days (FR-042). */
export async function performance(id: string): Promise<AdminPromotionPerformanceDTO> {
  await assertPromotion(id);
  const win = async (days: number | null): Promise<PromotionPerformanceWindowDTO> => {
    const r = (
      await query<{ uses: number; customers: number; discount: string; orders: number; sales: string }>(
        `SELECT count(*)::int AS uses, count(DISTINCT u.customer_id)::int AS customers,
                coalesce(sum(u.goods_amount + u.delivery_amount), 0)::numeric(12,2)::text AS discount,
                count(DISTINCT u.order_id)::int AS orders,
                coalesce(sum(o.grand_total_amount), 0)::numeric(12,2)::text AS sales
           FROM public.promotion_use u JOIN public."order" o ON o.id = u.order_id
          WHERE u.promotion_id = $1 AND u.status = 'confirmed'
            AND ($2::int IS NULL OR u.confirmed_at >= now() - make_interval(days => $2))`,
        [id, days],
      )
    ).rows[0]!;
    return { uses: r.uses, customers: r.customers, discount: r.discount, orders: r.orders, sales: r.sales };
  };
  const [lifetime, last7, last30, budget] = await Promise.all([
    win(null),
    win(7),
    win(30),
    query<{ left: string | null }>(
      `SELECT (p.budget_amount - coalesce((SELECT sum(u.goods_amount + u.delivery_amount) FROM public.promotion_use u
                 WHERE u.promotion_id = p.id AND (u.status = 'confirmed' OR (u.status = 'held' AND u.hold_expires_at > now()))), 0))::numeric(12,2)::text AS left
         FROM public.promotion p WHERE p.id = $1`,
      [id],
    ),
  ]);
  return { lifetime, last7, last30, budgetLeft: budget.rows[0]?.left ?? null };
}
