// A back-office message's SQL (112): the ONE place a message is created, and with the sending worker the only place its
// state changes (messages.guard.test.ts). Its activity log (`message_event`) is only ever added to.
import { limitOffsetClause, likePattern, orderBy, pooled, query, runOffsetPage, staffNameSql, type Queryable } from "@effy/edge-shared";
import type {
  AudienceFilter,
  MessageDestination,
  MessageEventKind,
  MessageKind,
  MessageStatus,
  NotificationAudience,
} from "@effy/shared-types";

import { MESSAGE_LIST, type MessageListRequest } from "./list";

export interface AudienceRecord {
  audience: NotificationAudience;
  filter: AudienceFilter;
  destination: MessageDestination;
  matchedCount: number;
}

export interface MessageRecord {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  pictureKey: string | null;
  push: boolean;
  email: boolean;
  nameFallback: string;
  automationId: string | null;
  status: MessageStatus;
  sendAt: Date | null;
  endsAt: Date | null;
  sentAt: Date | null;
  notSentReason: "too_many_recipients" | null;
  withdrawnAt: Date | null;
  duplicatedFrom: string | null;
  version: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
  audiences: AudienceRecord[];
}

export interface MessageWrite {
  kind: MessageKind;
  title: string;
  body: string;
  pictureKey: string | null;
  push: boolean;
  /** 115: also by email (customers only). */
  email: boolean;
  /** 115: the word in place of `{first name}`. */
  nameFallback: string;
  endsAt: Date | null;
  audiences: { audience: NotificationAudience; filter: AudienceFilter; destination: MessageDestination }[];
}

interface MessageRow {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  picture_key: string | null;
  push: boolean;
  email: boolean;
  name_fallback: string;
  automation_id: string | null;
  status: MessageStatus;
  send_at: Date | null;
  ends_at: Date | null;
  sent_at: Date | null;
  not_sent_reason: "too_many_recipients" | null;
  withdrawn_at: Date | null;
  duplicated_from: string | null;
  version: number;
  created_by: string;
  created_by_name: string | null;
  created_at: Date;
}

const COLUMNS = `m.id::text AS id, m.kind, m.title, m.body, m.picture_key, m.push, m.email, m.name_fallback,
  m.automation_id::text AS automation_id, m.status, m.send_at, m.ends_at, m.sent_at,
  m.not_sent_reason, m.withdrawn_at, m.duplicated_from::text AS duplicated_from, m.version, m.created_by,
  ${staffNameSql("m.created_by")} AS created_by_name, m.created_at`;

async function audiencesOf(db: Queryable, ids: readonly string[]): Promise<Map<string, AudienceRecord[]>> {
  const out = new Map<string, AudienceRecord[]>();
  if (ids.length === 0) return out;
  const res = await db.query<{ message_id: string; audience: NotificationAudience; filter: AudienceFilter; destination: MessageDestination; matched_count: number }>(
    `SELECT message_id::text AS message_id, audience, filter, destination, matched_count
       FROM public.message_audience WHERE message_id = ANY($1::uuid[])
      ORDER BY array_position(ARRAY['customer', 'driver', 'shop'], audience)`,
    [ids],
  );
  for (const r of res.rows) {
    const list = out.get(r.message_id) ?? [];
    list.push({ audience: r.audience, filter: r.filter, destination: r.destination, matchedCount: r.matched_count });
    out.set(r.message_id, list);
  }
  return out;
}

function toRecord(r: MessageRow, audiences: AudienceRecord[]): MessageRecord {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    pictureKey: r.picture_key,
    push: r.push,
    email: r.email,
    nameFallback: r.name_fallback,
    automationId: r.automation_id,
    status: r.status,
    sendAt: r.send_at,
    endsAt: r.ends_at,
    sentAt: r.sent_at,
    notSentReason: r.not_sent_reason,
    withdrawnAt: r.withdrawn_at,
    duplicatedFrom: r.duplicated_from,
    version: r.version,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    audiences,
  };
}

/** One message with its audiences; `lock` takes the row lock for a state change in `db`'s transaction. */
export async function readMessage(db: Queryable, id: string, lock = false): Promise<MessageRecord | null> {
  const row = (await db.query<MessageRow>(`SELECT ${COLUMNS} FROM public.message m WHERE m.id = $1${lock ? " FOR UPDATE OF m" : ""}`, [id])).rows[0];
  if (!row) return null;
  return toRecord(row, (await audiencesOf(db, [id])).get(id) ?? []);
}

export async function insertMessage(tx: Queryable, w: MessageWrite, actor: string, duplicatedFrom: string | null): Promise<string> {
  const id = (await tx.query<{ id: string }>(
    `INSERT INTO public.message (kind, title, body, picture_key, push, email, name_fallback, ends_at, duplicated_from, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id::text AS id`,
    [w.kind, w.title, w.body, w.pictureKey, w.push, w.email, w.nameFallback, w.endsAt, duplicatedFrom, actor],
  )).rows[0]!.id;
  await writeAudiences(tx, id, w);
  return id;
}

async function writeAudiences(tx: Queryable, id: string, w: MessageWrite): Promise<void> {
  await tx.query(`DELETE FROM public.message_audience WHERE message_id = $1`, [id]);
  for (const a of w.audiences) {
    await tx.query(
      `INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [id, a.audience, JSON.stringify(a.filter), JSON.stringify(a.destination)],
    );
  }
}

/** An edit (draft or scheduled only, checked by the caller under the lock): the words, picture, audiences; version + 1. */
export async function updateMessage(tx: Queryable, id: string, w: MessageWrite): Promise<void> {
  await tx.query(
    `UPDATE public.message
        SET kind = $2, title = $3, body = $4, picture_key = $5, push = $6, ends_at = $7, email = $8, name_fallback = $9,
            version = version + 1, updated_at = now()
      WHERE id = $1`,
    [id, w.kind, w.title, w.body, w.pictureKey, w.push, w.endsAt, w.email, w.nameFallback],
  );
  await writeAudiences(tx, id, w);
}

export type StatusChange =
  | { status: "scheduled"; sendAt: Date }
  | { status: "sending"; sendAt: Date }
  | { status: "cancelled" }
  | { status: "stopped" }
  | { status: "withdrawn" };

export async function changeStatus(tx: Queryable, id: string, change: StatusChange): Promise<void> {
  switch (change.status) {
    case "scheduled":
    case "sending":
      await tx.query(
        `UPDATE public.message SET status = $2, send_at = $3, version = version + 1, updated_at = now() WHERE id = $1`,
        [id, change.status, change.sendAt],
      );
      return;
    case "withdrawn":
      await tx.query(
        `UPDATE public.message SET status = 'withdrawn', withdrawn_at = now(), version = version + 1, updated_at = now() WHERE id = $1`,
        [id],
      );
      return;
    default:
      await tx.query(`UPDATE public.message SET status = $2, version = version + 1, updated_at = now() WHERE id = $1`, [id, change.status]);
  }
}

export async function appendEvent(
  db: Queryable,
  id: string,
  event: MessageEventKind,
  actor: string,
  detail: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await db.query(`INSERT INTO public.message_event (message_id, event, detail, actor) VALUES ($1, $2, $3::jsonb, $4)`, [
    id,
    event,
    JSON.stringify(detail),
    actor,
  ]);
}

/** The settings that bound a send (111's row): the largest message. */
export async function maxRecipients(db: Queryable): Promise<number> {
  const row = (await db.query<{ n: number }>(`SELECT max_recipients_per_message AS n FROM public.notification_settings WHERE id = 1`)).rows[0];
  return row?.n ?? 20000;
}

/** The Messages list (103): searched by title, filtered by kind, audience and status. */
export async function listMessages(req: MessageListRequest): Promise<{ rows: MessageRecord[]; total: number; page: number }> {
  const r = await runOffsetPage(req, async (read) => {
    const args: unknown[] = [
      req.q ? likePattern(req.q) : null,
      req.filters.kind ?? null,
      req.filters.audience ?? null,
      req.filters.status ?? null,
    ];
    const paging = limitOffsetClause(read, args);
    const res = await query<MessageRow & { full_count: string }>(
      `SELECT ${COLUMNS}, count(*) OVER() AS full_count
         FROM public.message m
        WHERE ($1::text IS NULL OR m.title ILIKE $1)
          AND ($2::text IS NULL OR m.kind = $2)
          AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM public.message_audience ma WHERE ma.message_id = m.id AND ma.audience = $3))
          AND ($4::text IS NULL OR m.status = $4)
        ${orderBy(MESSAGE_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
  const audiences = await audiencesOf(pooled, r.rows.map((x) => x.id));
  return { rows: r.rows.map((x) => toRecord(x, audiences.get(x.id) ?? [])), total: r.total, page: r.page };
}
