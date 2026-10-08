/**
 * What a balance and its history LOOK like (074) — one read for the customer's own screens (`customer`)
 * and back-office's (`orders`), so the two can never show one customer two different balances.
 *
 * ⚠ THE CUSTOMER SHAPE HAS NO NOTE AND NO AUTHOR. `history(…, { staff: false })` does not select them,
 * so there is nothing to forget to strip.
 */
import type { Queryable } from "../lib/db";
import { formatCents } from "../lib/money";
import { lastUsableDateOf } from "./expiry";
import { usable } from "./ledger";
import { loadSettings } from "./settings";
import { customerWords, type EntryKind } from "./vocabulary";

export interface BalanceSummary {
  usable: number;
  valueCents: number;
  centsPerPoint: number;
  /** Points set aside by a checkout in progress. */
  held: number;
  /** The earliest Melbourne date on which points stop, and how many stop then. */
  nextExpiry: { points: number; date: string } | null;
}

export async function balanceSummary(q: Queryable, customerId: string, now: Date): Promise<BalanceSummary> {
  const [u, settings, held, lots] = await Promise.all([
    usable(q, customerId, now),
    loadSettings(q),
    q.query<{ n: number }>(
      `SELECT COALESCE(SUM(points), 0)::int AS n FROM public.points_hold WHERE customer_id = $1 AND state = 'held' AND held_until > $2`,
      [customerId, now],
    ),
    q.query<{ expires_at: Date; left: number }>(
      `
SELECT e.expires_at,
       (e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0))::int AS left
  FROM public.points_entry e
 WHERE e.customer_id = $1 AND e.points > 0 AND e.expires_at > $2
 ORDER BY e.expires_at`,
      [customerId, now],
    ),
  ]);

  let nextExpiry: BalanceSummary["nextExpiry"] = null;
  for (const lot of lots.rows) {
    if (lot.left <= 0) continue;
    const date = lastUsableDateOf(lot.expires_at);
    if (nextExpiry === null) nextExpiry = { points: 0, date };
    if (date !== nextExpiry.date) break;
    nextExpiry.points += lot.left;
  }
  const shown = Math.max(0, u);
  return {
    usable: shown, valueCents: shown * settings.centsPerPoint, centsPerPoint: settings.centsPerPoint,
    held: held.rows[0]?.n ?? 0, nextExpiry,
  };
}

export interface HistoryLine {
  id: string;
  kind: EntryKind;
  points: number;
  valueAmount: string;
  words: string;
  orderNumber: string | null;
  expiresOn: string | null;
  at: Date;
}

export interface StaffHistoryLine extends HistoryLine {
  reason: string;
  note: string | null;
  authorKind: "staff" | "system" | "customer";
  authorName: string;
  orderId: string | null;
  refundId: string | null;
}

interface Row {
  id: string;
  kind: EntryKind;
  points: number;
  reason: string;
  order_number: string | null;
  expires_at: Date | null;
  created_at: Date;
  note?: string | null;
  author_kind?: "staff" | "system" | "customer";
  author_flow?: string | null;
  staff_name?: string | null;
  order_id?: string | null;
  refund_id?: string | null;
}

/** An opaque page cursor: the last line's time and id. */
export const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const when = new Date(at ?? "");
  if (!id || Number.isNaN(when.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at: when, id };
}

const FLOW_NAMES: Readonly<Record<string, string>> = {
  refund: "Refund",
  points_expiry: "Expiry",
  account_closure: "Account closure",
  courier_override: "Courier override",
};

export function history(q: Queryable, customerId: string, page: { cursor?: string; limit: number }, opts: { staff: true }): Promise<{ lines: StaffHistoryLine[]; nextCursor?: string }>;
export function history(q: Queryable, customerId: string, page: { cursor?: string; limit: number }, opts?: { staff?: false }): Promise<{ lines: HistoryLine[]; nextCursor?: string }>;
export async function history(
  q: Queryable,
  customerId: string,
  page: { cursor?: string; limit: number },
  opts: { staff?: boolean } = {},
): Promise<{ lines: (HistoryLine | StaffHistoryLine)[]; nextCursor?: string }> {
  const limit = Math.min(Math.max(1, page.limit), 100);
  const after = decodeCursor(page.cursor);
  const staffCols = opts.staff
    ? `, e.note, e.author_kind, e.author_flow, s.name AS staff_name, e.order_id::text AS order_id, e.refund_id::text AS refund_id`
    : "";
  // ⚠ admin.staff is joined ONLY for the staff read: the customer service has no business there.
  const staffJoin = opts.staff ? `LEFT JOIN admin.staff s ON e.author_kind = 'staff' AND s.cognito_sub = e.author_sub` : "";
  const [{ centsPerPoint }, rows] = await Promise.all([
    loadSettings(q),
    q.query<Row>(
      `
SELECT e.id::text AS id, e.kind, e.points, e.reason, o.order_number, e.expires_at, e.created_at${staffCols}
  FROM public.points_entry e
  LEFT JOIN public."order" o ON o.id = e.order_id
  ${staffJoin}
 WHERE e.customer_id = $1
   AND ($2::timestamptz IS NULL OR (e.created_at, e.id) < ($2::timestamptz, $3::uuid))
 ORDER BY e.created_at DESC, e.id DESC
 LIMIT $4`,
      [customerId, after?.at ?? null, after?.id ?? null, limit + 1],
    ),
  ]);

  const more = rows.rows.length > limit;
  const lines = rows.rows.slice(0, limit).map((r) => {
    const line: HistoryLine = {
      id: r.id, kind: r.kind, points: r.points, valueAmount: formatCents(r.points * centsPerPoint),
      words: customerWords(r.kind, r.reason, r.order_number), orderNumber: r.order_number,
      expiresOn: r.expires_at ? lastUsableDateOf(r.expires_at) : null, at: r.created_at,
    };
    if (!opts.staff) return line;
    const authorKind = r.author_kind ?? "system";
    return {
      ...line, reason: r.reason, note: r.note ?? null, authorKind,
      authorName: authorKind === "staff" ? (r.staff_name ?? "Staff") : authorKind === "customer" ? "Customer" : (FLOW_NAMES[r.author_flow ?? ""] ?? "Effy"),
      orderId: r.order_id ?? null, refundId: r.refund_id ?? null,
    } satisfies StaffHistoryLine;
  });
  const last = lines[lines.length - 1];
  return { lines, ...(more && last ? { nextCursor: encodeCursor(last.at, last.id) } : {}) };
}
