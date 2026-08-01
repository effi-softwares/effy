// Repository for delivery PRICING RULES (032) — raw parameterized SQL + explicit row → domain
// mapping (Principle VI, no ORM). Split from ./repository.ts, which owns 021's zones and rate grid:
// these are different concerns with different lifetimes, and the file was already 700 lines.
//
// ⚠ Every mutation writes admin.audit_log inside the SAME transaction as the change it records
// (FR-013/SC-014). An audit row written afterwards can be lost by the very failure it should explain.
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  type BandDimension,
  type DeliveryMethod,
  type PriceBand,
  type PricingRule,
  type PricingRuleInput,
} from "./types";

interface RuleRow {
  method: DeliveryMethod;
  base_amount: string;
  rounding_step: string;
  max_amount: string;
  status: "active" | "disabled";
  updated_by: string;
  updated_at: Date;
}

interface BandRow {
  method: DeliveryMethod;
  dimension: BandDimension;
  upper_bound: string;
  add_amount: string;
}

/**
 * Every rule with its bands. Two queries, not one per rule — there are only three rules, but the join
 * would fan the rule row out across its bands and need de-duplicating in JS for no benefit.
 */
export async function listRules(): Promise<PricingRule[]> {
  const [rules, bands] = await Promise.all([
    query<RuleRow>(
      `SELECT method, base_amount, rounding_step, max_amount, status, updated_by, updated_at
         FROM public.delivery_pricing_rule
        ORDER BY method`,
    ),
    query<BandRow>(
      `SELECT r.method, b.dimension, b.upper_bound, b.add_amount
         FROM public.delivery_price_band b
         JOIN public.delivery_pricing_rule r ON r.id = b.rule_id
        ORDER BY r.method, b.dimension, b.upper_bound`,
    ),
  ]);

  return rules.rows.map((r) => ({
    method: r.method,
    baseAmount: r.base_amount,
    roundingStep: r.rounding_step,
    maxAmount: r.max_amount,
    status: r.status,
    distanceBands: bandsFor(bands.rows, r.method, "distance"),
    weightBands: bandsFor(bands.rows, r.method, "weight"),
    updatedBy: r.updated_by,
    updatedAt: r.updated_at.toISOString(),
  }));
}

function bandsFor(rows: BandRow[], method: DeliveryMethod, dimension: BandDimension): PriceBand[] {
  return rows
    .filter((b) => b.method === method && b.dimension === dimension)
    .map((b) => ({ upperBound: b.upper_bound, addAmount: b.add_amount }));
}

export async function getRule(method: DeliveryMethod): Promise<PricingRule | null> {
  const all = await listRules();
  return all.find((r) => r.method === method) ?? null;
}

/**
 * Replace one method's rule AND its entire band set, in one transaction.
 *
 * ⚠ WHOLE-SET REPLACEMENT, NOT PER-BAND CRUD. Bands are only meaningful as an ordered set: inserting
 * one in the middle changes what its neighbours mean, and a per-band endpoint would let a quote in
 * flight observe a half-edited table — pricing an order against three distance bands where the
 * operator intended four. One transaction, one consistent set.
 *
 * Upsert rather than insert-or-update-by-id: the method IS the identity (one rule per method), so
 * whether a rule already existed is not something the caller should have to know.
 */
export async function replaceRule(
  method: DeliveryMethod,
  input: PricingRuleInput,
  actorSub: string,
): Promise<PricingRule> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.delivery_pricing_rule
           (method, base_amount, rounding_step, max_amount, status, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT delivery_pricing_rule_method_uq
       DO UPDATE SET base_amount   = EXCLUDED.base_amount,
                     rounding_step = EXCLUDED.rounding_step,
                     max_amount    = EXCLUDED.max_amount,
                     status        = EXCLUDED.status,
                     updated_by    = EXCLUDED.updated_by,
                     updated_at    = now()
         RETURNING id`,
      [method, input.baseAmount, input.roundingStep, input.maxAmount, input.status, actorSub],
    );
    const ruleId = res.rows[0]!.id;

    // ⚠ Delete-then-insert inside the transaction. An upsert per band would leave any band the
    // operator REMOVED still in the table — the set would only ever grow, and a band nobody can see
    // in the console would keep pricing orders.
    await client.query(`DELETE FROM public.delivery_price_band WHERE rule_id = $1`, [ruleId]);
    await insertBands(client, ruleId, "distance", input.distanceBands);
    await insertBands(client, ruleId, "weight", input.weightBands);

    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
            VALUES ($1, 'delivery_pricing.replace', 'delivery_pricing_rule', $2, $3::jsonb)`,
      [actorSub, ruleId, JSON.stringify({ method, ...input })],
    );
  });

  // Re-read so the caller sees exactly what was stored (numeric normalisation included) rather than
  // an echo of what it sent.
  const stored = await getRule(method);
  return stored!;
}

async function insertBands(
  client: PoolClient,
  ruleId: string,
  dimension: BandDimension,
  bands: PriceBand[],
): Promise<void> {
  for (const b of bands) {
    await client.query(
      `INSERT INTO public.delivery_price_band (rule_id, dimension, upper_bound, add_amount)
            VALUES ($1, $2, $3, $4)`,
      [ruleId, dimension, b.upperBound, b.addAmount],
    );
  }
}
