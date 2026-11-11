// The sending worker's SQL (112 R3). With the admin service's repository, the only writer of a message's state
// (messages.guard.test.ts): it moves due messages on, keeps the cursor, adds to the matched counts and marks a message
// sent. The recipients' notifications are written by notify(), never here.
import type { Queryable } from "@effy/edge-shared";
import type { AudienceFilter, MessageDestination, MessageKind, MessageStatus, NotificationAudience } from "@effy/shared-types";

export interface SendingAudience {
  audience: NotificationAudience;
  filter: AudienceFilter;
  destination: MessageDestination;
}

export interface SendingMessage {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  pictureKey: string | null;
  push: boolean;
  status: MessageStatus;
  sendAt: Date | null;
  endsAt: Date | null;
  cursorAudience: NotificationAudience | null;
  cursorSub: string | null;
  audiences: SendingAudience[];
}

/** Scheduled messages whose time has come, oldest first. */
export async function dueIds(db: Queryable, now: Date, limit = 20): Promise<string[]> {
  return (await db.query<{ id: string }>(
    `SELECT id::text AS id FROM public.message WHERE status = 'scheduled' AND send_at <= $1 ORDER BY send_at, id LIMIT $2`,
    [now, limit],
  )).rows.map((r) => r.id);
}

export async function sendingIds(db: Queryable): Promise<string[]> {
  return (await db.query<{ id: string }>(`SELECT id::text AS id FROM public.message WHERE status = 'sending' ORDER BY send_at, id`)).rows.map((r) => r.id);
}

/**
 * The message, locked for this transaction, if it is still in `status` and no other pass holds it (SKIP LOCKED): a stop,
 * a withdrawal or another pass simply makes it disappear from this one.
 */
export async function lockIn(tx: Queryable, id: string, status: MessageStatus): Promise<SendingMessage | null> {
  const row = (await tx.query<{
    id: string; kind: MessageKind; title: string; body: string; picture_key: string | null; push: boolean; status: MessageStatus;
    send_at: Date | null; ends_at: Date | null; cursor_audience: NotificationAudience | null; cursor_sub: string | null;
  }>(
    `SELECT id::text AS id, kind, title, body, picture_key, push, status, send_at, ends_at, cursor_audience, cursor_sub
       FROM public.message WHERE id = $1 AND status = $2 FOR UPDATE SKIP LOCKED`,
    [id, status],
  )).rows[0];
  if (!row) return null;
  const audiences = (await tx.query<SendingAudience>(
    `SELECT audience, filter, destination FROM public.message_audience WHERE message_id = $1
      ORDER BY array_position(ARRAY['customer', 'driver', 'shop'], audience)`,
    [id],
  )).rows;
  return {
    id: row.id, kind: row.kind, title: row.title, body: row.body, pictureKey: row.picture_key, push: row.push, status: row.status,
    sendAt: row.send_at, endsAt: row.ends_at, cursorAudience: row.cursor_audience, cursorSub: row.cursor_sub, audiences,
  };
}

export async function startSending(tx: Queryable, id: string): Promise<void> {
  await tx.query(`UPDATE public.message SET status = 'sending', version = version + 1, updated_at = now() WHERE id = $1`, [id]);
  await event(tx, id, "sending", {});
}

export async function markNotSent(tx: Queryable, id: string, count: number, limit: number): Promise<void> {
  await tx.query(
    `UPDATE public.message SET status = 'not_sent', not_sent_reason = 'too_many_recipients', version = version + 1, updated_at = now() WHERE id = $1`,
    [id],
  );
  await event(tx, id, "not_sent", { count, limit });
}

/** One page written: its matched count, and where the next page starts. */
export async function advance(tx: Queryable, id: string, audience: NotificationAudience, matched: number, cursorSub: string | null): Promise<void> {
  if (matched > 0) {
    await tx.query(`UPDATE public.message_audience SET matched_count = matched_count + $3 WHERE message_id = $1 AND audience = $2`, [id, audience, matched]);
  }
  await tx.query(`UPDATE public.message SET cursor_audience = $2, cursor_sub = $3, updated_at = now() WHERE id = $1`, [id, audience, cursorSub]);
}

export async function markSent(tx: Queryable, id: string): Promise<number> {
  await tx.query(`UPDATE public.message SET status = 'sent', sent_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [id]);
  const reached = (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.notification WHERE message_id = $1`, [id])).rows[0]?.n ?? 0;
  await event(tx, id, "sent", { reached });
  return reached;
}

export async function maxRecipients(db: Queryable): Promise<number> {
  return (await db.query<{ n: number }>(`SELECT max_recipients_per_message AS n FROM public.notification_settings WHERE id = 1`)).rows[0]?.n ?? 20000;
}

/** Withdrawn messages whose recipients' open screens haven't been told yet (R8). */
export async function withdrawnToAnnounce(db: Queryable): Promise<string[]> {
  return (await db.query<{ id: string }>(
    `SELECT id::text AS id FROM public.message WHERE status = 'withdrawn' AND withdraw_announced_at IS NULL ORDER BY withdrawn_at`,
  )).rows.map((r) => r.id);
}

export async function recipientsOf(db: Queryable, id: string): Promise<{ audience: NotificationAudience; sub: string }[]> {
  return (await db.query<{ audience: NotificationAudience; sub: string }>(
    `SELECT DISTINCT audience, recipient_sub AS sub FROM public.notification WHERE message_id = $1 ORDER BY recipient_sub`,
    [id],
  )).rows;
}

export async function markWithdrawAnnounced(db: Queryable, id: string): Promise<void> {
  await db.query(`UPDATE public.message SET withdraw_announced_at = now() WHERE id = $1 AND withdraw_announced_at IS NULL`, [id]);
}

async function event(tx: Queryable, id: string, kind: string, detail: Record<string, number>): Promise<void> {
  await tx.query(`INSERT INTO public.message_event (message_id, event, detail, actor) VALUES ($1, $2, $3::jsonb, 'system')`, [id, kind, JSON.stringify(detail)]);
}
