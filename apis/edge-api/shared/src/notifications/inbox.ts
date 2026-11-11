// A person's notification inbox (110 R1–R5): the list, the bell count, seen, mark all read, archive and undo.
//
// Every statement is keyed on the subject AND the audience: another person's notification, or one addressed to the
// same person under another audience, is simply not there. With `read.ts`, the only module that changes a
// notification's state (notifications.guard.test.ts).
//
// Listed  = not archived and not ended.
// Unseen  = listed and never seen (the bell).
// Pinned  = listed, important, unread and its pin not yet passed; sent apart from the time-ordered pages and never in
//           them, so a cursor stays exact.
import {
  INBOX_CATEGORIES,
  OPERATING_TZ,
  type InboxCategory,
  type InboxFilter,
  type InboxItemDTO,
  type InboxPageDTO,
  type NotificationAudience,
} from "@effy/shared-types";

import { pooled, type Queryable } from "../lib/db";
import { isNotificationId } from "./read";

export const INBOX_PAGE_SIZE = 30;
export const INBOX_MAX_PAGE_SIZE = 50;

/** Categories whose end time is worth saying ("Ends Sun"). A housekeeping expiry ("Run opens soon") leaves silently. */
const ENDS_SHOWN = new Set(["offers", "news", "announcements", "important"]);

const LISTED = `recipient_sub = $1 AND audience = $2 AND archived_at IS NULL AND (expires_at IS NULL OR expires_at > now())`;
const PINNED = `importance = 'important' AND read_at IS NULL AND pinned_until IS NOT NULL AND pinned_until > now()`;
/** Microseconds kept, so a cut-off or cursor built from it names exactly this row. */
const STAMP = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const COLUMNS = `id::text AS id, type, category, importance, title, body, destination, expires_at, image_url,
  ${STAMP("created_at")} AS created_at, ${STAMP("read_at")} AS read_at, ${STAMP("pinned_until")} AS pinned_until`;

interface Row {
  id: string;
  type: string;
  category: string;
  importance: "normal" | "important";
  title: string;
  body: string;
  destination: Record<string, string>;
  expires_at: Date | null;
  image_url: string | null;
  created_at: string;
  read_at: string | null;
  pinned_until: string | null;
}

export interface InboxQuery {
  filter?: InboxFilter;
  category?: InboxCategory;
  cursor?: string;
  limit?: number;
}

// ---- cursor: base64url of "<created_at with microseconds>|<id>" ----

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  let text: string;
  try {
    text = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [createdAt, id, extra] = text.split("|");
  if (extra !== undefined || !createdAt || !id || !isNotificationId(id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(createdAt)) return null;
  return { createdAt, id };
}

// ---- "Ends …" on Effy's clock ----

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: OPERATING_TZ }).format(d);
const time = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: OPERATING_TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .format(d)
    .replace(":00", "")
    .replace(/\s?([ap])\.?m\.?/i, " $1m")
    .toLowerCase();

/** "Ends today 5 pm", "Ends tomorrow", "Ends Sun", "Ends 12 Nov". */
export function endsLabel(category: string, expiresAt: Date | null, now: Date = new Date()): string | null {
  if (!expiresAt || !ENDS_SHOWN.has(category)) return null;
  const days = Math.round((Date.parse(dayKey(expiresAt)) - Date.parse(dayKey(now))) / 86_400_000);
  if (days <= 0) return `Ends today ${time(expiresAt)}`;
  if (days === 1) return "Ends tomorrow";
  if (days < 7) return `Ends ${new Intl.DateTimeFormat("en-AU", { timeZone: OPERATING_TZ, weekday: "short" }).format(expiresAt)}`;
  return `Ends ${new Intl.DateTimeFormat("en-AU", { timeZone: OPERATING_TZ, day: "numeric", month: "short" }).format(expiresAt)}`;
}

function toItem(r: Row, now: Date): InboxItemDTO {
  return {
    id: r.id,
    type: r.type,
    category: r.category,
    importance: r.importance,
    title: r.title,
    body: r.body,
    destination: r.destination,
    createdAt: r.created_at,
    readAt: r.read_at,
    pinnedUntil: r.pinned_until,
    endsLabel: endsLabel(r.category, r.expires_at ? new Date(r.expires_at) : null, now),
    imageUrl: r.image_url,
  };
}

// ---- reads ----

export async function unseenCount(sub: string, audience: NotificationAudience, db: Queryable = pooled): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.notification WHERE ${LISTED} AND seen_at IS NULL`,
    [sub, audience],
  );
  return rows[0]?.n ?? 0;
}

export async function listInbox(
  sub: string,
  audience: NotificationAudience,
  query: InboxQuery = {},
  db: Queryable = pooled,
  now: Date = new Date(),
): Promise<InboxPageDTO> {
  const limit = Math.min(Math.max(query.limit ?? INBOX_PAGE_SIZE, 1), INBOX_MAX_PAGE_SIZE);
  const after = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !after) throw new Error("inbox: invalid cursor");

  const params: unknown[] = [sub, audience];
  const where = [LISTED];
  if (query.filter === "unread") where.push("read_at IS NULL");
  if (query.category) {
    params.push(query.category);
    where.push(`category = $${params.length}`);
  }
  const filtered = where.join(" AND ");

  const pageParams = [...params];
  let page = `${filtered} AND NOT (${PINNED})`;
  if (after) {
    pageParams.push(after.createdAt, after.id);
    page += ` AND (created_at, id) < ($${pageParams.length - 1}::timestamptz, $${pageParams.length}::uuid)`;
  }
  pageParams.push(limit + 1);
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM public.notification WHERE ${page}
      ORDER BY created_at DESC, id DESC LIMIT $${pageParams.length}`,
    pageParams,
  );
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];

  const first = !after;
  const [pinned, categories, unseen] = await Promise.all([
    first
      ? db.query<Row>(`SELECT ${COLUMNS} FROM public.notification WHERE ${filtered} AND ${PINNED} ORDER BY created_at DESC, id DESC`, params)
      : Promise.resolve({ rows: [] as Row[] }),
    first
      ? db.query<{ category: string }>(`SELECT DISTINCT category FROM public.notification WHERE ${LISTED}`, [sub, audience])
      : Promise.resolve(null),
    unseenCount(sub, audience, db),
  ]);

  const order = Object.keys(INBOX_CATEGORIES);
  return {
    pinned: pinned.rows.map((r) => toItem(r, now)),
    items: items.map((r) => toItem(r, now)),
    nextCursor: more && last ? encodeCursor(last.created_at, last.id) : null,
    categories: categories
      ? categories.rows.map((r) => r.category).sort((a, b) => order.indexOf(a) - order.indexOf(b))
      : null,
    unseenCount: unseen,
  };
}

// ---- changes ----

/**
 * Opening the inbox: everything created up to `before` (capped at now) is seen. Returns the count after. `before` is
 * the ISO string the list sent, microseconds kept: a Date would drop them and miss the newest item shown.
 */
export async function markSeen(
  sub: string,
  audience: NotificationAudience,
  before: string,
  db: Queryable = pooled,
): Promise<number> {
  await db.query(
    `UPDATE public.notification SET seen_at = now()
      WHERE recipient_sub = $1 AND audience = $2 AND seen_at IS NULL AND archived_at IS NULL
        AND created_at <= LEAST($3::timestamptz, now())`,
    [sub, audience, before],
  );
  return unseenCount(sub, audience, db);
}

/** Mark all read: every listed item created up to `before` (capped at now) is read and seen. */
export async function readAll(
  sub: string,
  audience: NotificationAudience,
  before: string,
  db: Queryable = pooled,
): Promise<{ updated: number; unseenCount: number }> {
  const res = await db.query(
    `UPDATE public.notification
        SET read_at = COALESCE(read_at, now()), seen_at = COALESCE(seen_at, now())
      WHERE ${LISTED} AND read_at IS NULL AND created_at <= LEAST($3::timestamptz, now())`,
    [sub, audience, before],
  );
  return { updated: res.rowCount ?? 0, unseenCount: await unseenCount(sub, audience, db) };
}

/** Archive (the first time is kept) or undo. Read and seen are untouched. `false` when it is not this person's. */
export async function setArchived(
  sub: string,
  audience: NotificationAudience,
  notificationId: string,
  archived: boolean,
  db: Queryable = pooled,
): Promise<boolean> {
  if (!sub || !isNotificationId(notificationId)) return false;
  const res = await db.query(
    `UPDATE public.notification
        SET archived_at = CASE WHEN $4::boolean THEN COALESCE(archived_at, now()) ELSE NULL END
      WHERE id = $3 AND recipient_sub = $1 AND audience = $2`,
    [sub, audience, notificationId, archived],
  );
  return (res.rowCount ?? 0) > 0;
}
