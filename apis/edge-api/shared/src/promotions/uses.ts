import type { Queryable } from "../lib/db";
import { emitMetric } from "../lib/metrics";
import { formatCents, parseCents } from "../lib/money";

import type { AppliedPromotion } from "./engine";

/**
 * THE writer of `promotion_use` (094 R5). Uses are HELD at the payment intent — the last server moment
 * before the shopper is charged — CONFIRMED when payment succeeds and RELEASED when it fails, when a
 * newer intent replaces this one, or when the order is cancelled before it is fulfilled.
 *
 * ⚠ THE CAPS AND THE BUDGET ARE CHECKED HERE, UNDER A LOCK. Each applied promotion's row is locked
 * `FOR UPDATE` (in id order, so two checkouts never deadlock), its held-and-unexpired plus confirmed
 * uses are re-counted, and only then is this order's use written. The 027 model counted paid orders
 * only, so two shoppers paying at the same moment could both take the last use (SC-004).
 */

export const PROMOTION_METRIC_NAMESPACE = "Effy/Promotions";

/** A promotion no longer fits — a cap, the budget or a single-use code was taken meanwhile. */
export class PromotionsChangedError extends Error {
  constructor(readonly promotionId: string, readonly why: "used_up" | "out_of_budget" | "already_used" | "code_used" | "unavailable") {
    super(`promotion ${promotionId} no longer applies (${why})`);
    this.name = "PromotionsChangedError";
  }
}

export interface HoldInput {
  orderId: string;
  customerId: string;
  applied: readonly AppliedPromotion[];
  /** Codes the applied promotions were entered with: single-use ones are protected by the index. */
  singleUseCodeIds: ReadonlySet<string>;
  expiresAt: Date;
  now: Date;
}

/**
 * Hold this order's uses, replacing any it held before (a newer intent supersedes the older one).
 * Must run inside the intent's transaction. Throws `PromotionsChangedError` when one no longer fits.
 */
export async function holdUses(tx: Queryable, input: HoldInput): Promise<void> {
  const { orderId, customerId, now } = input;
  const keep = new Set(input.applied.map((a) => a.promotionId));

  // What this order held before and no longer applies is let go.
  const superseded = await tx.query(
    `UPDATE public.promotion_use
        SET status = 'released', released_at = $3, release_reason = 'superseded', hold_expires_at = NULL
      WHERE order_id = $1 AND status = 'held' AND NOT (promotion_id = ANY($2::uuid[]))`,
    [orderId, [...keep], now],
  );
  if ((superseded.rowCount ?? 0) > 0) emitMetric(PROMOTION_METRIC_NAMESPACE, "PromotionUseReleased", superseded.rowCount ?? 0, { why: "superseded" });
  if (input.applied.length === 0) return;

  const ids = [...keep].sort();
  const locked = await tx.query<{ id: string; max_uses: number | null; max_uses_per_customer: number | null; budget_amount: string | null; live: boolean }>(
    `SELECT id::text, max_uses, max_uses_per_customer, budget_amount::text,
            (published_at IS NOT NULL AND archived_at IS NULL AND NOT paused
              AND (starts_at IS NULL OR starts_at <= $2) AND (ends_at IS NULL OR ends_at > $2)
              AND (ended_at IS NULL OR ended_at > $2)) AS live
       FROM public.promotion WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids, now],
  );
  const counts = await tx.query<{ promotion_id: string; uses: string; given: string; mine: string }>(
    `SELECT promotion_id::text, count(*)::text AS uses,
            coalesce(sum(goods_amount + delivery_amount), 0)::text AS given,
            count(*) FILTER (WHERE customer_id = $3)::text AS mine
       FROM public.promotion_use
      WHERE promotion_id = ANY($1::uuid[]) AND order_id <> $2
        AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > $4))
      GROUP BY promotion_id`,
    [ids, orderId, customerId, now],
  );
  const usage = new Map(counts.rows.map((r) => [r.promotion_id, r]));

  for (const a of input.applied) {
    const p = locked.rows.find((r) => r.id === a.promotionId);
    if (!p || !p.live) throw refuse(a.promotionId, "unavailable");
    const u = usage.get(a.promotionId);
    const uses = Number(u?.uses ?? 0);
    const mine = Number(u?.mine ?? 0);
    const given = parseCents(u?.given ?? "0");
    if (p.max_uses !== null && uses >= p.max_uses) throw refuse(a.promotionId, "used_up");
    if (p.max_uses_per_customer !== null && mine >= p.max_uses_per_customer) throw refuse(a.promotionId, "already_used");
    if (p.budget_amount !== null && given + a.goodsCents + a.deliveryCents > parseCents(p.budget_amount)) throw refuse(a.promotionId, "out_of_budget");

    const singleUse = a.codeId !== null && input.singleUseCodeIds.has(a.codeId);
    if (singleUse) {
      // An abandoned checkout's lapsed hold must not keep a single-use code forever.
      await tx.query(
        `UPDATE public.promotion_use SET status = 'released', released_at = $3, release_reason = 'expired', hold_expires_at = NULL
          WHERE code_id = $1 AND order_id <> $2 AND status = 'held' AND hold_expires_at <= $3`,
        [a.codeId, orderId, now],
      );
    }
    try {
      await tx.query(
        `INSERT INTO public.promotion_use
             (promotion_id, code_id, single_use, customer_id, order_id, goods_amount, delivery_amount, status, hold_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, 'held', $8)
         ON CONFLICT (order_id, promotion_id) DO UPDATE
            SET code_id = EXCLUDED.code_id, single_use = EXCLUDED.single_use,
                goods_amount = EXCLUDED.goods_amount, delivery_amount = EXCLUDED.delivery_amount,
                status = 'held', hold_expires_at = EXCLUDED.hold_expires_at,
                released_at = NULL, release_reason = NULL, confirmed_at = NULL`,
        [a.promotionId, a.codeId, singleUse, customerId, orderId, formatCents(a.goodsCents), formatCents(a.deliveryCents), input.expiresAt],
      );
    } catch (err) {
      if (isCodeTaken(err)) throw refuse(a.promotionId, "code_used");
      throw err;
    }
  }
  emitMetric(PROMOTION_METRIC_NAMESPACE, "PromotionUseHeld", input.applied.length);
}

function refuse(promotionId: string, why: PromotionsChangedError["why"]): PromotionsChangedError {
  emitMetric(PROMOTION_METRIC_NAMESPACE, "PromotionRefused", 1, { reason: why });
  return new PromotionsChangedError(promotionId, why);
}

function isCodeTaken(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && e.constraint === "promotion_use_code_once";
}

/**
 * Payment succeeded: this order's held uses are confirmed — even a hold that lapsed, because the
 * shopper was charged the discounted price (the late-payer rule 069 has for windows).
 */
export async function confirmUses(tx: Queryable, orderId: string, now: Date = new Date()): Promise<number> {
  const res = await tx.query(
    `UPDATE public.promotion_use
        SET status = 'confirmed', confirmed_at = $2, hold_expires_at = NULL
      WHERE order_id = $1 AND status = 'held'`,
    [orderId, now],
  );
  const n = res.rowCount ?? 0;
  if (n > 0) emitMetric(PROMOTION_METRIC_NAMESPACE, "PromotionUseConfirmed", n);
  return n;
}

/** Let this order's uses go: its payment failed, or it was cancelled before it was fulfilled (FR-040). */
export async function releaseUses(tx: Queryable, orderId: string, why: "payment_failed" | "cancelled", now: Date = new Date()): Promise<number> {
  const res = await tx.query(
    `UPDATE public.promotion_use
        SET status = 'released', released_at = $3, release_reason = $2, hold_expires_at = NULL
      WHERE order_id = $1 AND status IN ('held', 'confirmed')`,
    [orderId, why, now],
  );
  const n = res.rowCount ?? 0;
  if (n > 0) emitMetric(PROMOTION_METRIC_NAMESPACE, "PromotionUseReleased", n, { why });
  return n;
}
