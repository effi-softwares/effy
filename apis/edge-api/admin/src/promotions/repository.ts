// Repository for the order rules (027 FR-053) — the single policy row. SQL only (Principle VI).
//
// ⚠ Promotions themselves moved to `promotion-repository.ts` with the 094 model.
import { query, withTransaction } from "@effy/edge-shared";

import { type OrderPolicy, PromoError } from "./types";

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
