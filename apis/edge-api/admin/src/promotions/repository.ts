// Repository for promotions & order rules (027 US10). SQL only — no HTTP, no validation (Principle VI).
//
// ⚠ Every mutation writes an `admin.audit_log` row inside the SAME transaction as the change (009
// pattern). An audit trail written separately is one that can be missing for the change that mattered.
//
// ⚠ `redemptionCount` is COUNTED from `promo_redemption` on every read, never stored. A counter column
// and the redemption rows can disagree, and when they do nobody can tell which is true — the rows are the
// money, so the rows are the count. It is also what makes the used-code immutability rule (FR-068)
// enforceable without a second source of truth.
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import { type OrderPolicy, type Paged, type PromoCode, PromoError, type PromoStatus } from "./types";

interface PromoRow {
  id: string;
  code: string;
  kind: string;
  percent_off: number | null;
  amount_off: string | null;
  currency: string;
  minimum_subtotal_amount: string;
  starts_at: Date | null;
  ends_at: Date | null;
  max_redemptions: number | null;
  max_per_customer: number | null;
  status: string;
  redemption_count: string;
  created_by: string;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  is_advertised: boolean;
  banner_title: string | null;
  banner_subtitle: string | null;
  banner_image_key: string | null;
  banner_position: number;
  total?: string;
}

function mapPromo(row: PromoRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as PromoCode["kind"],
    percentOff: row.percent_off,
    amountOff: row.amount_off,
    currency: row.currency,
    minimumSubtotalAmount: row.minimum_subtotal_amount,
    startsAt: row.starts_at ? row.starts_at.toISOString() : null,
    endsAt: row.ends_at ? row.ends_at.toISOString() : null,
    maxRedemptions: row.max_redemptions,
    maxPerCustomer: row.max_per_customer,
    status: row.status as PromoStatus,
    redemptionCount: Number(row.redemption_count),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    isAdvertised: row.is_advertised,
    bannerTitle: row.banner_title,
    bannerSubtitle: row.banner_subtitle,
    bannerImageKey: row.banner_image_key,
    bannerPosition: row.banner_position,
  };
}

const PROMO_SELECT = `
  SELECT p.id, p.code, p.kind, p.percent_off, p.amount_off::text AS amount_off, p.currency,
         p.minimum_subtotal_amount::text AS minimum_subtotal_amount,
         p.starts_at, p.ends_at, p.max_redemptions, p.max_per_customer, p.status,
         p.created_by, p.updated_by, p.created_at, p.updated_at,
         p.is_advertised, p.banner_title, p.banner_subtitle, p.banner_image_key, p.banner_position,
         (SELECT count(*) FROM public.promo_redemption r WHERE r.promo_code_id = p.id) AS redemption_count`;

async function insertAudit(
  client: PoolClient,
  actorSub: string,
  action: string,
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
          VALUES ($1, $2, 'promo_code', $3, $4::jsonb)`,
    [actorSub, action, targetId, JSON.stringify(detail)],
  );
}

/** A Postgres unique_violation on the code becomes a duplicate refusal; anything else rethrows. */
function asDuplicate(err: unknown): PromoError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new PromoError(409, "promo_code_duplicate", "a code with this name already exists");
  }
  throw err;
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────

export async function listPromos(params: {
  page: number;
  pageSize: number;
  status: PromoStatus | null;
  q: string | null;
}): Promise<Paged<PromoCode>> {
  const { page, pageSize, status, q } = params;
  const res = await query<PromoRow>(
    `${PROMO_SELECT}, count(*) OVER() AS total
       FROM public.promo_code p
      WHERE ($1::text IS NULL OR p.status = $1)
        AND ($2::text IS NULL OR p.code ILIKE '%' || $2 || '%')
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4`,
    [status, q, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return { items: res.rows.map(mapPromo), total, page, pageSize };
}

export async function readPromo(id: string): Promise<PromoCode | null> {
  const res = await query<PromoRow>(`${PROMO_SELECT} FROM public.promo_code p WHERE p.id = $1`, [id]);
  const row = res.rows[0];
  return row ? mapPromo(row) : null;
}

export async function auditFor(promoId: string, limit: number) {
  const res = await query<{
    id: string;
    actor_sub: string;
    action: string;
    target_type: string;
    target_id: string | null;
    detail: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT a.id, a.actor_sub, a.action, a.target_type, a.target_id, a.detail, a.created_at
       FROM admin.audit_log a
      WHERE a.target_type = 'promo_code' AND a.target_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [promoId, limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    actorSub: r.actor_sub,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    detail: r.detail,
    createdAt: r.created_at.toISOString(),
  }));
}

// ── Mutations ────────────────────────────────────────────────────────────────────────────────

export interface CreateInput {
  code: string;
  kind: string;
  percentOff: number | null;
  amountOff: string | null;
  minimumSubtotalAmount: string;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  isAdvertised: boolean;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  bannerImageKey: string | null;
  bannerPosition: number;
}

export async function createPromo(input: CreateInput, actorSub: string): Promise<PromoCode> {
  const id = await withTransaction(async (client) => {
    let newId: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.promo_code
           (code, kind, percent_off, amount_off, minimum_subtotal_amount,
            starts_at, ends_at, max_redemptions, max_per_customer, created_by,
            is_advertised, banner_title, banner_subtitle, banner_image_key, banner_position)
         VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          input.code, input.kind, input.percentOff, input.amountOff, input.minimumSubtotalAmount,
          input.startsAt, input.endsAt, input.maxRedemptions, input.maxPerCustomer, actorSub,
          input.isAdvertised, input.bannerTitle, input.bannerSubtitle, input.bannerImageKey,
          input.bannerPosition,
        ],
      );
      newId = ins.rows[0]!.id;
    } catch (err) {
      throw asDuplicate(err);
    }
    await insertAudit(client, actorSub, "promo_code.create", newId, { ...input });
    return newId;
  });
  const created = await readPromo(id);
  if (!created) throw new PromoError(500, "promo_read_failed", "the code was created but could not be read");
  return created;
}

export interface UpdateInput {
  code?: string;
  kind?: string;
  percentOff?: number | null;
  amountOff?: string | null;
  minimumSubtotalAmount?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  maxPerCustomer?: number | null;
  // 028 — presentation, not value. Editable at any time, including on a redeemed code.
  isAdvertised?: boolean;
  bannerTitle?: string | null;
  bannerSubtitle?: string | null;
  bannerImageKey?: string | null;
  bannerPosition?: number;
}

/**
 * Update a code.
 *
 * ⚠ The used-code rule (FR-068) is enforced HERE, inside the transaction, by re-counting redemptions
 * under the same snapshot as the write. Checking it in the service and writing here would leave a window
 * in which a code is redeemed between the two — and the whole point is that a redeemed code's VALUE can
 * never be rewritten, because a paid order's stored discount was computed from it.
 */
export async function updatePromo(id: string, input: UpdateInput, actorSub: string): Promise<PromoCode> {
  await withTransaction(async (client) => {
    const cur = await client.query<{ redemptions: string }>(
      `SELECT (SELECT count(*) FROM public.promo_redemption r WHERE r.promo_code_id = p.id) AS redemptions
         FROM public.promo_code p WHERE p.id = $1 FOR UPDATE`,
      [id],
    );
    if (cur.rowCount === 0) throw new PromoError(404, "promo_not_found", "no such code");

    const used = Number(cur.rows[0]!.redemptions) > 0;
    const rewritesValue =
      input.code !== undefined ||
      input.kind !== undefined ||
      input.percentOff !== undefined ||
      input.amountOff !== undefined ||
      input.minimumSubtotalAmount !== undefined;

    if (used && rewritesValue) {
      throw new PromoError(
        409,
        "promo_immutable_once_used",
        "this code has been redeemed — its window, caps and status can change, but its value cannot",
      );
    }

    try {
      // ⚠ Every field is guarded by an explicit "was it sent?" boolean rather than COALESCE. A nullable
      // column cannot use COALESCE to mean "leave it alone", because `null` is also a legitimate VALUE
      // here — an uncapped code has `max_redemptions = NULL`, and clearing a cap must be possible.
      await client.query(
        `UPDATE public.promo_code SET
           code                    = CASE WHEN $2  THEN $3            ELSE code END,
           kind                    = CASE WHEN $4  THEN $5            ELSE kind END,
           percent_off             = CASE WHEN $6  THEN $7            ELSE percent_off END,
           amount_off              = CASE WHEN $8  THEN $9::numeric   ELSE amount_off END,
           minimum_subtotal_amount = CASE WHEN $10 THEN $11::numeric  ELSE minimum_subtotal_amount END,
           starts_at               = CASE WHEN $12 THEN $13           ELSE starts_at END,
           ends_at                 = CASE WHEN $14 THEN $15           ELSE ends_at END,
           max_redemptions         = CASE WHEN $16 THEN $17           ELSE max_redemptions END,
           max_per_customer        = CASE WHEN $18 THEN $19           ELSE max_per_customer END,
           -- ⚠ 028: PRESENTATION ONLY. These sit alongside the value fields above but are NOT subject
           -- to the redeemed-code guard — a headline typo must be correctable on a promotion people
           -- are already using, because changing a headline changes nothing about a paid order.
           is_advertised           = CASE WHEN $21 THEN $22           ELSE is_advertised END,
           banner_title            = CASE WHEN $23 THEN $24           ELSE banner_title END,
           banner_subtitle         = CASE WHEN $25 THEN $26           ELSE banner_subtitle END,
           banner_image_key        = CASE WHEN $27 THEN $28           ELSE banner_image_key END,
           banner_position         = CASE WHEN $29 THEN $30           ELSE banner_position END,
           updated_by = $20, updated_at = now()
         WHERE id = $1`,
        [
          id,
          input.code !== undefined, input.code ?? null,
          input.kind !== undefined, input.kind ?? null,
          input.percentOff !== undefined, input.percentOff ?? null,
          input.amountOff !== undefined, input.amountOff ?? null,
          input.minimumSubtotalAmount !== undefined, input.minimumSubtotalAmount ?? null,
          input.startsAt !== undefined, input.startsAt ?? null,
          input.endsAt !== undefined, input.endsAt ?? null,
          input.maxRedemptions !== undefined, input.maxRedemptions ?? null,
          input.maxPerCustomer !== undefined, input.maxPerCustomer ?? null,
          actorSub,
          input.isAdvertised !== undefined, input.isAdvertised ?? null,
          input.bannerTitle !== undefined, input.bannerTitle ?? null,
          input.bannerSubtitle !== undefined, input.bannerSubtitle ?? null,
          input.bannerImageKey !== undefined, input.bannerImageKey ?? null,
          input.bannerPosition !== undefined, input.bannerPosition ?? null,
        ],
      );
    } catch (err) {
      throw asDuplicate(err);
    }
    await insertAudit(client, actorSub, "promo_code.update", id, { ...input });
  });
  const updated = await readPromo(id);
  if (!updated) throw new PromoError(404, "promo_not_found", "no such code");
  return updated;
}

export async function setStatus(id: string, status: PromoStatus, actorSub: string): Promise<PromoCode> {
  await withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE public.promo_code SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
      [id, status, actorSub],
    );
    if (res.rowCount === 0) throw new PromoError(404, "promo_not_found", "no such code");
    await insertAudit(client, actorSub, `promo_code.${status === "active" ? "enable" : "disable"}`, id, { status });
  });
  const updated = await readPromo(id);
  if (!updated) throw new PromoError(404, "promo_not_found", "no such code");
  return updated;
}

/**
 * Delete a code — ONLY one that has never been redeemed (FR-070).
 *
 * ⚠ Disabling is the removal path for anything that has been used, so every paid order keeps a code that
 * still explains it. The `ON DELETE RESTRICT` on `promo_redemption` would refuse this anyway; the explicit
 * check exists so the operator gets "disable it instead" rather than a foreign-key error.
 */
export async function deletePromo(id: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    const cur = await client.query<{ redemptions: string }>(
      `SELECT (SELECT count(*) FROM public.promo_redemption r WHERE r.promo_code_id = p.id) AS redemptions
         FROM public.promo_code p WHERE p.id = $1 FOR UPDATE`,
      [id],
    );
    if (cur.rowCount === 0) throw new PromoError(404, "promo_not_found", "no such code");
    if (Number(cur.rows[0]!.redemptions) > 0) {
      throw new PromoError(
        409,
        "promo_delete_blocked",
        "this code has been redeemed and cannot be deleted — disable it instead",
      );
    }
    await client.query(`DELETE FROM public.promo_code WHERE id = $1`, [id]);
    await insertAudit(client, actorSub, "promo_code.delete", id, {});
  });
}

// ── Order rules (the single policy row) ──────────────────────────────────────────────────────

export async function readOrderPolicy(): Promise<OrderPolicy> {
  const res = await query<{
    minimum_subtotal_amount: string;
    currency: string;
    max_line_quantity: number;
    max_distinct_items: number;
    updated_by: string | null;
    updated_at: Date;
  }>(
    `SELECT minimum_subtotal_amount::text AS minimum_subtotal_amount, currency,
            max_line_quantity, max_distinct_items, updated_by, updated_at
       FROM public.order_policy WHERE singleton`,
  );
  const row = res.rows[0];
  if (!row) throw new PromoError(500, "order_policy_missing", "the order policy row is missing");
  return {
    minimumSubtotalAmount: row.minimum_subtotal_amount,
    currency: row.currency,
    maxLineQuantity: row.max_line_quantity,
    maxDistinctItems: row.max_distinct_items,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function writeOrderPolicy(
  input: { minimumSubtotalAmount: string; maxLineQuantity: number; maxDistinctItems: number },
  actorSub: string,
): Promise<OrderPolicy> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE public.order_policy SET minimum_subtotal_amount = $1::numeric,
              max_line_quantity = $2, max_distinct_items = $3, updated_by = $4, updated_at = now()
        WHERE singleton`,
      [input.minimumSubtotalAmount, input.maxLineQuantity, input.maxDistinctItems, actorSub],
    );
    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
            VALUES ($1, 'order_policy.update', 'order_policy', NULL, $2::jsonb)`,
      [actorSub, JSON.stringify(input)],
    );
  });
  return readOrderPolicy();
}
