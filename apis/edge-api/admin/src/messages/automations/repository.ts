// An automatic message's SQL (115): the ONE place one is created or edited by staff. The sending worker's repository
// (notifications/src/messages/repository.ts) is the only other writer: it records runs and moves `next_run_at` on
// (messages.guard.test.ts). Its activity log (`message_automation_event`) is only ever added to.
import { limitOffsetClause, likePattern, orderBy, query, runOffsetPage, staffNameSql, type Queryable } from "@effy/edge-shared";
import type {
  AudienceFilter,
  AutomationMode,
  AutomationRunDTO,
  AutomationStatus,
  MessageDestination,
  MessageKind,
  NotificationAudience,
  RepeatEvery,
  TriggerKind,
} from "@effy/shared-types";

import { AUTOMATION_LIST, type AutomationListRequest } from "./list";

export interface AutomationWrite {
  name: string;
  kind: MessageKind;
  audience: NotificationAudience;
  filter: AudienceFilter;
  destination: MessageDestination;
  title: string;
  body: string;
  pictureKey: string | null;
  push: boolean;
  email: boolean;
  nameFallback: string;
  mode: AutomationMode;
  triggerKind: TriggerKind | null;
  triggerValue: number | null;
  repeatEvery: RepeatEvery | null;
  repeatDays: number[] | null;
  repeatDate: number | null;
  /** "HH:MM". */
  repeatTime: string | null;
  /** "YYYY-MM-DD". */
  startsOn: string | null;
  endsOn: string | null;
}

export interface AutomationRecord extends AutomationWrite {
  id: string;
  status: AutomationStatus;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  activatedAt: Date;
  version: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
}

interface Row {
  id: string;
  name: string;
  kind: MessageKind;
  audience: NotificationAudience;
  filter: AudienceFilter;
  destination: MessageDestination;
  title: string;
  body: string;
  picture_key: string | null;
  push: boolean;
  email: boolean;
  name_fallback: string;
  mode: AutomationMode;
  trigger_kind: TriggerKind | null;
  trigger_value: number | null;
  repeat_every: RepeatEvery | null;
  repeat_days: number[] | null;
  repeat_date: number | null;
  repeat_time: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: AutomationStatus;
  next_run_at: Date | null;
  last_run_at: Date | null;
  activated_at: Date;
  version: number;
  created_by: string;
  created_by_name: string | null;
  created_at: Date;
}

// Dates and times as text: a `date` read as a JS Date would land on the server's midnight, not Effy's.
const COLUMNS = `a.id::text AS id, a.name, a.kind, a.audience, a.filter, a.destination, a.title, a.body, a.picture_key, a.push,
  a.email, a.name_fallback, a.mode, a.trigger_kind, a.trigger_value, a.repeat_every, a.repeat_days, a.repeat_date,
  to_char(a.repeat_time, 'HH24:MI') AS repeat_time, to_char(a.starts_on, 'YYYY-MM-DD') AS starts_on,
  to_char(a.ends_on, 'YYYY-MM-DD') AS ends_on, a.status, a.next_run_at,
  (SELECT max(r.ran_at) FROM public.message_automation_run r WHERE r.automation_id = a.id) AS last_run_at,
  a.activated_at, a.version, a.created_by, ${staffNameSql("a.created_by")} AS created_by_name, a.created_at`;

function toRecord(r: Row): AutomationRecord {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    audience: r.audience,
    filter: r.filter,
    destination: r.destination,
    title: r.title,
    body: r.body,
    pictureKey: r.picture_key,
    push: r.push,
    email: r.email,
    nameFallback: r.name_fallback,
    mode: r.mode,
    triggerKind: r.trigger_kind,
    triggerValue: r.trigger_value,
    repeatEvery: r.repeat_every,
    repeatDays: r.repeat_days,
    repeatDate: r.repeat_date,
    repeatTime: r.repeat_time,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    activatedAt: r.activated_at,
    version: r.version,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  };
}

/** One automatic message; `lock` takes the row lock for a change in `db`'s transaction. */
export async function readAutomation(db: Queryable, id: string, lock = false): Promise<AutomationRecord | null> {
  const row = (await db.query<Row>(`SELECT ${COLUMNS} FROM public.message_automation a WHERE a.id = $1${lock ? " FOR UPDATE OF a" : ""}`, [id])).rows[0];
  return row ? toRecord(row) : null;
}

const WRITE_VALUES = (w: AutomationWrite) => [
  w.name, w.kind, w.audience, JSON.stringify(w.filter), JSON.stringify(w.destination), w.title, w.body, w.pictureKey, w.push,
  w.email, w.nameFallback, w.mode, w.triggerKind, w.triggerValue, w.repeatEvery, w.repeatDays, w.repeatDate, w.repeatTime,
  w.startsOn, w.endsOn,
];

export async function insertAutomation(tx: Queryable, w: AutomationWrite, nextRunAt: Date | null, actor: string): Promise<string> {
  return (await tx.query<{ id: string }>(
    `INSERT INTO public.message_automation
       (name, kind, audience, filter, destination, title, body, picture_key, push, email, name_fallback, mode, trigger_kind,
        trigger_value, repeat_every, repeat_days, repeat_date, repeat_time, starts_on, ends_on, next_run_at, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::int[], $17, $18::time, $19::date,
             $20::date, $21, $22)
     RETURNING id::text AS id`,
    [...WRITE_VALUES(w), nextRunAt, actor],
  )).rows[0]!.id;
}

/**
 * An edit: the words, audience, schedule; version + 1. `nextRunAt` is recomputed by the caller for an active one (null
 * otherwise); `reactivate` moves `activated_at` to now (a changed trigger never sends to a backlog, L7).
 */
export async function updateAutomation(tx: Queryable, id: string, w: AutomationWrite, nextRunAt: Date | null, reactivate: boolean): Promise<void> {
  await tx.query(
    `UPDATE public.message_automation
        SET name = $2, kind = $3, audience = $4, filter = $5::jsonb, destination = $6::jsonb, title = $7, body = $8,
            picture_key = $9, push = $10, email = $11, name_fallback = $12, mode = $13, trigger_kind = $14, trigger_value = $15,
            repeat_every = $16, repeat_days = $17::int[], repeat_date = $18, repeat_time = $19::time, starts_on = $20::date,
            ends_on = $21::date, next_run_at = $22,
            activated_at = CASE WHEN $23::boolean THEN now() ELSE activated_at END,
            version = version + 1, updated_at = now()
      WHERE id = $1`,
    [id, ...WRITE_VALUES(w), nextRunAt, reactivate],
  );
}

/** Pause, resume or end. Resume moves `activated_at` to now: nothing missed while paused is sent (FR-019). */
export async function changeState(tx: Queryable, id: string, status: AutomationStatus, nextRunAt: Date | null, reactivate: boolean): Promise<void> {
  await tx.query(
    `UPDATE public.message_automation
        SET status = $2, next_run_at = $3, activated_at = CASE WHEN $4::boolean THEN now() ELSE activated_at END,
            version = version + 1, updated_at = now()
      WHERE id = $1`,
    [id, status, nextRunAt, reactivate],
  );
}

export async function appendAutomationEvent(
  db: Queryable,
  id: string,
  kind: "created" | "edited" | "paused" | "resumed" | "ended",
  actor: string,
  facts: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await db.query(`INSERT INTO public.message_automation_event (automation_id, kind, actor_sub, facts) VALUES ($1, $2, $3, $4::jsonb)`, [
    id,
    kind,
    actor,
    JSON.stringify(facts),
  ]);
}

/** The latest runs, newest first. */
export async function recentRuns(db: Queryable, id: string, limit = 50): Promise<AutomationRunDTO[]> {
  const rows = (await db.query<{ id: string; ran_at: Date; matched: number; message_id: string | null; outcome: AutomationRunDTO["outcome"] }>(
    `SELECT id::text AS id, ran_at, matched, message_id::text AS message_id, outcome
       FROM public.message_automation_run WHERE automation_id = $1 ORDER BY ran_at DESC, id DESC LIMIT $2`,
    [id, limit],
  )).rows;
  return rows.map((r) => ({ id: r.id, ranAt: r.ran_at.toISOString(), matched: r.matched, messageId: r.message_id, outcome: r.outcome }));
}

/** The Automatic list (103): searched by name, filtered by status and mode. */
export async function listAutomations(req: AutomationListRequest): Promise<{ rows: AutomationRecord[]; total: number; page: number }> {
  const r = await runOffsetPage(req, async (read) => {
    const args: unknown[] = [req.q ? likePattern(req.q) : null, req.filters.status ?? null, req.filters.mode ?? null];
    const paging = limitOffsetClause(read, args);
    const res = await query<Row & { full_count: string }>(
      `SELECT ${COLUMNS}, count(*) OVER() AS full_count
         FROM public.message_automation a
        WHERE ($1::text IS NULL OR a.name ILIKE $1)
          AND ($2::text IS NULL OR a.status = $2)
          AND ($3::text IS NULL OR a.mode = $3)
        ${orderBy(AUTOMATION_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
  return { rows: r.rows.map(toRecord), total: r.total, page: r.page };
}
