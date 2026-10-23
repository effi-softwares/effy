/**
 * Stock is per variant. Every write records the count and its movement in one transaction, takes the
 * prior value from the UPDATE itself (`RETURNING`), and never touches `updated_at`, which means a
 * catalogue edit.
 */

import {
  EFFECTIVE_LOW_STOCK_THRESHOLD,
  LOW_STOCK_PREDICATE,
  LOW_STOCK_SEVERITY,
  query,
  withTransaction,
} from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import type { LowStockRowDTO, StockMovementReason } from "@effy/shared-types";

import { notFound, type Actor, type MovementRow, type StockRow } from "./types";

interface StockDbRow {
  product_id: string;
  variant_id: string;
  shop_id: string;
  stock_tracked: boolean;
  stock_on_hand: number | null;
  low_stock_threshold: number | null;
  shop_default_threshold: number | null;
}

/** Shop-scoped in the predicate, so another shop's variant is indistinguishable from none. Removed variants have no stock screen. */
const SELECT_STOCK = `
SELECT v.product_id::text    AS product_id,
       v.id::text            AS variant_id,
       v.shop_id::text       AS shop_id,
       v.stock_tracked       AS stock_tracked,
       v.stock_on_hand       AS stock_on_hand,
       v.low_stock_threshold AS low_stock_threshold,
       s.default_low_stock_threshold AS shop_default_threshold
  FROM public.product_variant v
  LEFT JOIN public.shop_stock_settings s ON s.shop_id = v.shop_id
 WHERE v.id = $1 AND v.shop_id = $2 AND v.state <> 'removed'
`;

function toStockRow(r: StockDbRow): StockRow {
  return {
    productId: r.product_id,
    variantId: r.variant_id,
    shopId: r.shop_id,
    tracked: r.stock_tracked,
    onHand: r.stock_on_hand,
    threshold: r.low_stock_threshold,
    shopDefaultThreshold: r.shop_default_threshold,
  };
}

export async function readStock(variantId: string, shopId: string): Promise<StockRow | null> {
  const res = await query<StockDbRow>(SELECT_STOCK, [variantId, shopId]);
  const row = res.rows[0];
  return row ? toStockRow(row) : null;
}

/** Newest first. `actorLabel` is a name, never an email; left JOINs because `actor_sub` is a snapshot, not an FK. */
const SELECT_MOVEMENTS = `
SELECT m.id::text          AS id,
       m.quantity_delta    AS quantity_delta,
       m.quantity_before   AS quantity_before,
       m.quantity_after    AS quantity_after,
       m.reason            AS reason,
       m.actor_kind        AS actor_kind,
       coalesce(ss.name, ast.name) AS actor_label,
       o.order_number      AS order_number,
       m.note              AS note,
       m.created_at        AS created_at
  FROM public.stock_movement m
  LEFT JOIN public.shop_staff ss ON ss.cognito_sub = m.actor_sub
  LEFT JOIN admin.staff     ast ON ast.cognito_sub = m.actor_sub
  LEFT JOIN public."order"    o ON o.id = m.order_id
 WHERE m.variant_id = $1
 ORDER BY m.created_at DESC, m.id DESC
 LIMIT $2
`;

interface MovementDbRow {
  id: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: StockMovementReason;
  actor_kind: "shop" | "back_office" | "system";
  actor_label: string | null;
  order_number: string | null;
  note: string | null;
  created_at: Date;
}

export async function readMovements(variantId: string, limit = 50): Promise<MovementRow[]> {
  const res = await query<MovementDbRow>(SELECT_MOVEMENTS, [variantId, limit]);
  return res.rows.map((r) => ({
    id: r.id,
    quantityDelta: r.quantity_delta,
    quantityBefore: r.quantity_before,
    quantityAfter: r.quantity_after,
    reason: r.reason,
    actorKind: r.actor_kind,
    actorLabel: r.actor_label,
    orderNumber: r.order_number,
    note: r.note,
    createdAt: r.created_at.toISOString(),
  }));
}

/** The state after the write, so the caller never re-reads. */
export interface WriteResult {
  before: number;
  after: number;
}

const MOVEMENT_INSERT = `
INSERT INTO public.stock_movement
  (product_id, variant_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind, actor_sub, note)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`;

/**
 * The `prev` CTE locks the row and carries the old value out in the same statement, so concurrent
 * changes chain (before₂ = after₁). Do not fetch it with a sub-SELECT in RETURNING.
 */
export async function setCount(
  actor: Actor,
  variantId: string,
  onHand: number,
  reason: StockMovementReason,
  note: string | null,
): Promise<WriteResult> {
  return withTransaction(async (client) => {
    const res = await client.query<{ product_id: string; before: number; after: number }>(
      `WITH prev AS (
         SELECT id, stock_on_hand
           FROM public.product_variant
          WHERE id = $1 AND shop_id = $2 AND stock_tracked AND state <> 'removed'
          FOR UPDATE
       )
       UPDATE public.product_variant v
          SET stock_on_hand = $3
         FROM prev
        WHERE v.id = prev.id
        RETURNING v.product_id::text AS product_id, prev.stock_on_hand AS before, v.stock_on_hand AS after`,
      [variantId, actor.shopId, onHand],
    );
    const row = res.rows[0];
    if (!row) throw notFound();
    await client.query(MOVEMENT_INSERT, [
      row.product_id, variantId, actor.shopId, row.after - row.before, row.before, row.after,
      reason, actor.kind, actor.sub, note,
    ]);
    return { before: row.before, after: row.after };
  });
}

/** The floor is in the statement (`GREATEST(0, …)`), so a concurrent change cannot go negative. */
export async function adjustCount(
  actor: Actor,
  variantId: string,
  delta: number,
  reason: StockMovementReason,
  note: string | null,
): Promise<WriteResult> {
  return withTransaction(async (client) => {
    const res = await client.query<{ product_id: string; before: number; after: number }>(
      `WITH prev AS (
         SELECT id, stock_on_hand
           FROM public.product_variant
          WHERE id = $1 AND shop_id = $2 AND stock_tracked AND state <> 'removed'
          FOR UPDATE
       )
       UPDATE public.product_variant v
          SET stock_on_hand = GREATEST(0, prev.stock_on_hand + $3)
         FROM prev
        WHERE v.id = prev.id
        RETURNING v.product_id::text AS product_id, prev.stock_on_hand AS before, v.stock_on_hand AS after`,
      [variantId, actor.shopId, delta],
    );
    const row = res.rows[0];
    if (!row) throw notFound();
    await client.query(MOVEMENT_INSERT, [
      row.product_id, variantId, actor.shopId, row.after - row.before, row.before, row.after,
      reason, actor.kind, actor.sub, note,
    ]);
    return { before: row.before, after: row.after };
  });
}

/** Disabling keeps the count and history; re-enabling always takes a fresh count. */
export async function setTracking(
  actor: Actor,
  variantId: string,
  tracked: boolean,
  onHand: number | null,
): Promise<WriteResult> {
  return withTransaction(async (client) => {
    const res = await client.query<{ product_id: string; before: number | null; after: number | null }>(
      `WITH prev AS (
         SELECT id, stock_on_hand
           FROM public.product_variant
          WHERE id = $1 AND shop_id = $2 AND state <> 'removed'
          FOR UPDATE
       )
       UPDATE public.product_variant v
          SET stock_tracked = $3,
              stock_on_hand = CASE WHEN $3 THEN $4::int ELSE v.stock_on_hand END
         FROM prev
        WHERE v.id = prev.id
        RETURNING v.product_id::text AS product_id, prev.stock_on_hand AS before, v.stock_on_hand AS after`,
      [variantId, actor.shopId, tracked, onHand],
    );
    const row = res.rows[0];
    if (!row) throw notFound();
    const before = row.before ?? 0;
    const after = row.after ?? 0;
    await client.query(MOVEMENT_INSERT, [
      row.product_id, variantId, actor.shopId, after - before, before, after,
      tracked ? "tracking_enabled" : "tracking_disabled", actor.kind, actor.sub, null,
    ]);
    return { before, after };
  });
}

/** Moves no count, so it writes no movement. */
export async function setThreshold(
  actor: Actor,
  variantId: string,
  threshold: number | null,
): Promise<void> {
  const res = await query(
    `UPDATE public.product_variant SET low_stock_threshold = $3 WHERE id = $1 AND shop_id = $2 AND state <> 'removed'`,
    [variantId, actor.shopId, threshold],
  );
  if ((res.rowCount ?? 0) === 0) throw notFound();
}

export async function readSettings(shopId: string): Promise<number | null> {
  const res = await query<{ default_low_stock_threshold: number | null }>(
    `SELECT default_low_stock_threshold FROM public.shop_stock_settings WHERE shop_id = $1`,
    [shopId],
  );
  return res.rows[0]?.default_low_stock_threshold ?? null;
}

export async function writeSettings(
  shopId: string,
  defaultThreshold: number | null,
  updatedBy: string,
): Promise<void> {
  await query(
    `INSERT INTO public.shop_stock_settings (shop_id, default_low_stock_threshold, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (shop_id) DO UPDATE
        SET default_low_stock_threshold = EXCLUDED.default_low_stock_threshold,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()`,
    [shopId, defaultThreshold, updatedBy],
  );
}

/**
 * Everything at zero (`out`) and everything at or below its effective threshold (`low`, which
 * excludes zero). No threshold anywhere means never low, but still reported at zero. Rides
 * `product_variant_low_stock_idx`.
 */
const SELECT_LOW_STOCK = `
SELECT v.product_id::text AS product_id,
       v.id::text AS variant_id,
       p.name     AS name,
       ${variantLabelSql("v")} AS variant_label,
       v.sku      AS sku,
       v.stock_on_hand AS on_hand,
       ${EFFECTIVE_LOW_STOCK_THRESHOLD} AS effective_threshold,
       ${LOW_STOCK_SEVERITY} AS severity
  FROM public.product_variant v
  JOIN public.product p ON p.id = v.product_id
  LEFT JOIN public.shop_stock_settings s ON s.shop_id = v.shop_id
 WHERE v.shop_id = $1
   AND ${LOW_STOCK_PREDICATE}
 -- ⚠ Most urgent first — the order IS the guarantee. Any presentation grouping is the
 -- client's job, over a list that is already urgency-ordered.
 ORDER BY (v.stock_on_hand <= 0) DESC, v.stock_on_hand ASC, p.name ASC, v.position ASC
 LIMIT 500
`;

interface LowStockDbRow {
  product_id: string;
  variant_id: string;
  name: string;
  variant_label: string | null;
  sku: string | null;
  on_hand: number;
  effective_threshold: number | null;
  severity: "out" | "low";
}

export async function readLowStock(shopId: string): Promise<LowStockRowDTO[]> {
  const res = await query<LowStockDbRow>(SELECT_LOW_STOCK, [shopId]);
  return res.rows.map((r) => ({
    productId: r.product_id,
    variantId: r.variant_id,
    name: r.name,
    variantLabel: r.variant_label,
    sku: r.sku,
    onHand: r.on_hand,
    effectiveThreshold: r.effective_threshold,
    severity: r.severity,
  }));
}
