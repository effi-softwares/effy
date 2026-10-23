import { pooled, productAvailableSql, type Queryable } from "@effy/edge-shared";

import { CARD_SELECT, type CardRow } from "../lib/cards";
import { categorySubtreeById } from "../lib/category-tree";

/**
 * `rail` is `featured`, `on_sale` or `category:<key>`; `rail_title` is set on category rails only.
 * Rows arrive in rail order, newest first within a rail.
 */
export interface RailRow extends CardRow {
  rail: string;
  rail_title: string | null;
}

// Rails use the full availability rule: merchandising offers only what can be bought. Search and
// product pages keep out-of-stock products visible and marked.
const RAIL_WHERE = `WHERE ${productAvailableSql("p")}`;

export interface HomeRepository {
  /** Every rail in one statement, because the pool is one connection. */
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
    JOIN public.product p ON p.primary_category_id = c.id AND ${productAvailableSql("p")}
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
  AND p.list_compare_at_amount IS NOT NULL
  AND p.list_compare_at_amount > p.list_price_amount
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
