// The Home rails. Wire rows only; composition is the service's job.
import { availabilityPredicate, pooled, type Queryable } from "@effy/edge-shared";

import { CARD_SELECT, type CardRow } from "../lib/cards";

/** A category that directly holds purchasable products (drives the Home category rails). */
export interface RailCandidate {
  key: string;
  name: string;
}

// ⚠ 054: RAILS use the FULL rule, and that is not an inconsistency with the listing filters in
// search. A rail is merchandising — "here are things to buy" — and 025 FR-023 requires that it
// carry only available products. A SEARCH RESULT or a PRODUCT PAGE is somewhere a shopper navigated
// to deliberately, or linked to, and there FR-013/A10 keep an out-of-stock product visible and
// marked. Two different questions, two different filters, one shared rule underneath.
const RAIL_WHERE = `WHERE ${availabilityPredicate("p")}`;

export interface HomeRepository {
  newestCards(limit: number): Promise<CardRow[]>;
  onSaleCards(limit: number): Promise<CardRow[]>;
  categoryCards(categoryKey: string, limit: number): Promise<CardRow[]>;
  railCandidates(limit: number): Promise<RailCandidate[]>;
}

export function createHomeRepository(db: Queryable = pooled): HomeRepository {
  const cards = async (sql: string, args: unknown[]) => (await db.query<CardRow>(sql, args)).rows;
  return {
    /** The "Featured" rail — newest purchasable products. */
    newestCards: (limit) =>
      cards(`${CARD_SELECT}
${RAIL_WHERE}
ORDER BY p.created_at DESC
LIMIT $1`, [limit]),

    /** The "On sale" rail — purchasable products with a compare-at above the current price. */
    onSaleCards: (limit) =>
      cards(`${CARD_SELECT}
${RAIL_WHERE}
  AND p.compare_at_amount IS NOT NULL
  AND p.compare_at_amount > p.price_amount
ORDER BY p.created_at DESC
LIMIT $1`, [limit]),

    /** A category rail — purchasable products whose primary category is `categoryKey`. */
    categoryCards: (categoryKey, limit) =>
      cards(`${CARD_SELECT}
${RAIL_WHERE}
  AND p.primary_category_id = (SELECT id FROM public.category WHERE key = $1)
ORDER BY p.created_at DESC
LIMIT $2`, [categoryKey, limit]),

    /**
     * Up to `limit` active categories that directly hold purchasable products (most products
     * first), so Home only renders non-empty category rails regardless of taxonomy depth.
     */
    async railCandidates(limit) {
      return (
        await db.query<RailCandidate>(
          `
SELECT c.key AS key, c.name AS name
FROM public.category c
JOIN public.product p ON p.primary_category_id = c.id AND ${availabilityPredicate("p")}
-- availability-exempt: public.category — a retired category is hidden whatever its products hold.
WHERE c.status = 'active'
GROUP BY c.key, c.name, c.display_order
ORDER BY c.display_order ASC, count(p.id) DESC
LIMIT $1`,
          [limit],
        )
      ).rows;
    },
  };
}
