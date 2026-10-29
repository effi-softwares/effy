/**
 * What a balance and its history look like: one read for the customer's screens and back-office's.
 * The customer shape has no note and no author: `{ staff: false }` does not select them.
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
  /** The earliest Melbourne date points stop, and how many. */
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

interface Row {
  id: string;
  kind: EntryKind;
  points: number;
  reason: string;
  order_number: string | null;
  expires_at: Date | null;
  created_at: Date;
  /** The same instant as Postgres writes it — the cursor's value (a JS Date keeps only milliseconds). */
  created_at_text: string;
}

/**
 * An opaque page cursor: the last line's time and id. ⚠ The time is Postgres's own text, never a JS Date: a
 * Date keeps milliseconds, Postgres microseconds, and every entry in the same millisecond after the cursor's
 * would be skipped (103).
 */
export const encodeCursor = (at: string, id: string) => Buffer.from(`${at}|${id}`).toString("base64url");
export function decodeCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

/** The customer's history, newest first. Back-office reads the ledger as an activity log (104), not here. */
export async function history(
  q: Queryable,
  customerId: string,
  page: { cursor?: string; limit: number },
): Promise<{ lines: HistoryLine[]; nextCursor?: string }> {
  const limit = Math.min(Math.max(1, page.limit), 100);
  const after = decodeCursor(page.cursor);
  const [{ centsPerPoint }, rows] = await Promise.all([
    loadSettings(q),
    q.query<Row>(
      `
SELECT e.id::text AS id, e.kind, e.points, e.reason, o.order_number, e.expires_at, e.created_at, e.created_at::text AS created_at_text
  FROM public.points_entry e
  LEFT JOIN public."order" o ON o.id = e.order_id
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
    return line;
  });
  const last = rows.rows[Math.min(rows.rows.length, limit) - 1];
  return { lines, ...(more && last ? { nextCursor: encodeCursor(last.created_at_text, last.id) } : {}) };
}
