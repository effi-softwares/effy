// Deliberately minimal: who the customer is, their points and last orders. Points come from @effy/edge-shared/points.
import { query } from "@effy/edge-shared";

export interface CustomerRow {
  id: string;
  name: string;
  email: string;
}

export interface SearchRow extends CustomerRow {
  points: number;
  order_count: number;
}

const ORDER_NUMBER = /^EFY-[0-9A-Z]{4,}$/i;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const NAME = `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.given_name, c.family_name)), ''), '')`;

/** By order number, exact email, or an email prefix of 3+ characters. No free-text name search. */
export async function search(q: string, limit = 20): Promise<SearchRow[]> {
  const text = q.trim();
  let where: string;
  let arg: string;
  if (ORDER_NUMBER.test(text)) {
    where = `c.id = (SELECT o.customer_id FROM public."order" o WHERE o.order_number = upper($1))`;
    arg = text;
  } else if (text.length >= 3) {
    // citext: Like is case-insensitive without lower.
    where = `c.email LIKE ($1 || '%')::citext`;
    arg = likeEscape(text);
  } else {
    return [];
  }
  return (
    await query<SearchRow>(
      `
SELECT c.id::text AS id, ${NAME} AS name, c.email::text AS email,
       GREATEST(0, public.points_usable(c.id, now()))::int AS points,
       (SELECT count(*) FROM public."order" o WHERE o.customer_id = c.id AND o.status NOT IN ('pending_payment', 'failed'))::int AS order_count
  FROM public.customer c
 WHERE ${where}
 ORDER BY c.email
 LIMIT $2`,
      [arg, limit],
    )
  ).rows;
}

export async function customer(id: string): Promise<CustomerRow | null> {
  return (await query<CustomerRow>(`SELECT c.id::text AS id, ${NAME} AS name, c.email::text AS email FROM public.customer c WHERE c.id = $1`, [id])).rows[0] ?? null;
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
 WHERE o.customer_id = $1 AND o.status NOT IN ('pending_payment', 'failed')
 ORDER BY o.created_at DESC
 LIMIT $2`,
      [customerId, limit],
    )
  ).rows;
}
