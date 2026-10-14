// The Home rails. Wire rows only; composition is the service's job.
import { availabilityPredicate, pooled, type Queryable } from "@effy/edge-shared";

import { CARD_SELECT, type CardRow } from "../lib/cards";
import { categorySubtreeById } from "../lib/category-tree";

/**
 * One product on one Home rail: the card, plus which rail it is on and where that rail sits.
 *
 * `rail` is `featured`, `on_sale` or `category:<key>`; `rail_title` is the category's name on a
 * category rail and NULL on the other two (their titles are the service's words). Rows arrive in
 * rail order, and newest first within a rail.
 */
export interface RailRow extends CardRow {
  rail: string;
  rail_title: string | null;
}

// ⚠ 054: RAILS use the FULL rule, and that is not an inconsistency with the listing filters in
// search. A rail is merchandising — "here are things to buy" — and 025 FR-023 requires that it
// carry only available products. A SEARCH RESULT or a PRODUCT PAGE is somewhere a shopper navigated
// to deliberately, or linked to, and there FR-013/A10 keep an out-of-stock product visible and
// marked. Two different questions, two different filters, one shared rule underneath.
const RAIL_WHERE = `WHERE ${availabilityPredicate("p")}`;

export interface HomeRepository {
  /**
   * Every Home rail in ONE statement (PERF-11): Featured (newest), On sale, and up to `categoryMax`
   * category rails, each at most `limit` products.
   *
   * ⚠ ONE STATEMENT BECAUSE THE POOL IS ONE CONNECTION (`max: 1`, shared/src/lib/db.ts). The
   * `Promise.all` this replaced looked like two waves of parallel reads; on one connection it was
   * seven queries in series, each a full round trip to the database.
   */
  rails(limit: number, categoryMax: number): Promise<RailRow[]>;
}

export function createHomeRepository(db: Queryable = pooled): HomeRepository {
  return {
    async rails(limit, categoryMax) {
      return (
        await db.query<RailRow>(
          `
WITH candidates AS (
    -- The categories that DIRECTLY hold purchasable products, most products first within the
    -- taxonomy's own order, so Home renders only non-empty category rails at any taxonomy depth.
    SELECT c.id, c.key, c.name,
           row_number() OVER (ORDER BY c.display_order ASC, count(p.id) DESC, c.key ASC) AS pos
    FROM public.category c
    JOIN public.product p ON p.primary_category_id = c.id AND ${availabilityPredicate("p")}
    -- availability-exempt: public.category — a retired category is hidden whatever its products hold.
    WHERE c.status = 'active'
    GROUP BY c.id, c.key, c.name, c.display_order
    ORDER BY pos
    LIMIT $2
)
SELECT r.*
FROM (
    (SELECT 'featured' AS rail, NULL::text AS rail_title, 0::bigint AS rail_pos, x.*
       FROM (${CARD_SELECT}
${RAIL_WHERE}
ORDER BY p.created_at DESC
LIMIT $1) x)
    UNION ALL
    (SELECT 'on_sale', NULL::text, 1::bigint, x.*
       FROM (${CARD_SELECT}
${RAIL_WHERE}
  AND p.compare_at_amount IS NOT NULL
  AND p.compare_at_amount > p.price_amount
ORDER BY p.created_at DESC
LIMIT $1) x)
    UNION ALL
    -- A category rail holds products filed in the category OR anywhere under it.
    (SELECT 'category:' || c.key, c.name, 1 + c.pos, x.*
       FROM candidates c
       CROSS JOIN LATERAL (${CARD_SELECT}
${RAIL_WHERE}
  AND p.primary_category_id IN ${categorySubtreeById("c.id")}
ORDER BY p.created_at DESC
LIMIT $1) x)
) r
ORDER BY r.rail_pos ASC, r.created_at DESC, r.id ASC`,
          [limit, categoryMax],
        )
      ).rows;
    },
  };
}
