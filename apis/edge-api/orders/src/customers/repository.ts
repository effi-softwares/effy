// Who the customer is, their points and last orders, and the browsable list of customers (103). Points come from
// @effy/edge-shared/points.
import { dayRangeCondition, likePattern, limitOffsetClause, orderBy, PLACED_ORDER_SQL, query, runOffsetPage } from "@effy/edge-shared";

import { CUSTOMER_LIST, type CustomerListRequest } from "./list";

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
}

export interface CustomerDetailRow extends CustomerRow {
  /** The date a deleted account is erased, while it can still be restored (113). */
  closing_erase_after: Date | null;
  /** This registration matched a barred, erased account (113 FR-016). */
  matches_erased_barred_on: string | null;
}

export interface ListRow extends CustomerRow {
  phone: string | null;
  joined_at: Date;
  points: number;
  order_count: number;
  last_order_at: Date | null;
}

const ORDER_NUMBER = /^EFY-[0-9A-Z]{4,}$/i;

const NAME = `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.given_name, c.family_name)), ''), '')`;

/** Paid orders per customer, once, for the page's rows and its sorts. */
const ORDER_FACTS = `
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS order_count, max(x.created_at) AS last_order_at
      FROM public."order" x
     WHERE x.customer_id = c.id AND ${PLACED_ORDER_SQL("x")}
  ) o ON TRUE`;

/**
 * One page of customers with its exact total (103). The search finds an order number exactly, or any part of
 * an email, a name or a phone number.
 */
export async function list(req: CustomerListRequest) {
  return runOffsetPage(req, async (read) => {
    const args: unknown[] = [];
    // 113: an erased customer has nothing left to show; their orders say "Deleted customer".
    const where: string[] = [`c.closure_state <> 'erased'`];
    if (req.q && ORDER_NUMBER.test(req.q)) {
      args.push(req.q.toUpperCase());
      where.push(`c.id = (SELECT x.customer_id FROM public."order" x WHERE x.order_number = $${args.length})`);
    } else if (req.q) {
      args.push(likePattern(req.q));
      where.push(`(c.email::text ILIKE $${args.length} OR ${NAME} ILIKE $${args.length} OR c.phone ILIKE $${args.length})`);
    }
    if (req.filters.hasOrdered !== undefined) where.push(req.filters.hasOrdered ? "COALESCE(o.order_count, 0) > 0" : "COALESCE(o.order_count, 0) = 0");
    const joined = dayRangeCondition("c.created_at", { from: req.filters.joinedFrom, to: req.filters.joinedTo }, args);
    if (joined) where.push(joined);
    const paging = limitOffsetClause(read, args);
    const res = await query<ListRow & { full_count: string }>(
      `SELECT c.id::text AS id, ${NAME} AS name, c.email::text AS email, c.phone, c.created_at AS joined_at,
              GREATEST(0, public.points_usable(c.id, now()))::int AS points,
              COALESCE(o.order_count, 0) AS order_count, o.last_order_at,
              count(*) OVER () AS full_count
         FROM public.customer c
         ${ORDER_FACTS}
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ${orderBy(CUSTOMER_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
}

export async function customer(id: string): Promise<CustomerDetailRow | null> {
  return (
    await query<CustomerDetailRow>(
      `SELECT c.id::text AS id, ${NAME} AS name, c.email::text AS email,
              (SELECT r.erase_after FROM public.customer_closure_request r
                WHERE r.customer_id = c.id AND r.cancelled_at IS NULL AND r.erased_at IS NULL
                  AND c.closure_state = 'closing') AS closing_erase_after,
              c.matches_erased_barred_on::text AS matches_erased_barred_on
         FROM public.customer c WHERE c.id = $1 AND c.closure_state <> 'erased'`,
      [id],
    )
  ).rows[0] ?? null;
}

export interface RecentOrderRow {
  id: string;
  order_number: string;
  placed_at: Date | null;
  grand_total_amount: string;
}

export async function recentOrders(customerId: string, limit = 5): Promise<RecentOrderRow[]> {
  return (
    await query<RecentOrderRow>(
      `
SELECT o.id::text AS id, o.order_number, o.placed_at, o.grand_total_amount::text AS grand_total_amount
  FROM public."order" o
 WHERE o.customer_id = $1 AND ${PLACED_ORDER_SQL("o")}
 ORDER BY o.created_at DESC
 LIMIT $2`,
      [customerId, limit],
    )
  ).rows;
}
