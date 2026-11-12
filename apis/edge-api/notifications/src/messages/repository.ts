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
  /** 115: also by email (customer audiences). */
  email: boolean;
  nameFallback: string;
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
    id: string; kind: MessageKind; title: string; body: string; picture_key: string | null; push: boolean; email: boolean;
    name_fallback: string; status: MessageStatus;
    send_at: Date | null; ends_at: Date | null; cursor_audience: NotificationAudience | null; cursor_sub: string | null;
  }>(
    `SELECT id::text AS id, kind, title, body, picture_key, push, email, name_fallback, status, send_at, ends_at, cursor_audience, cursor_sub
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
    id: row.id, kind: row.kind, title: row.title, body: row.body, pictureKey: row.picture_key, push: row.push, email: row.email,
    nameFallback: row.name_fallback, status: row.status,
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

/**
 * 115: the email addresses of a page of customer recipients, by sub. Erased or closed accounts have none (113), and are
 * then "no address" in the report.
 */
export async function customerEmails(db: Queryable, subs: readonly string[]): Promise<Map<string, string>> {
  if (subs.length === 0) return new Map();
  const rows = (await db.query<{ sub: string; email: string }>(
    `SELECT cognito_sub AS sub, email::text AS email FROM public.customer
      WHERE cognito_sub = ANY ($1::text[]) AND email IS NOT NULL AND closure_state IS DISTINCT FROM 'erased'`,
    [subs],
  )).rows;
  return new Map(rows.map((r) => [r.sub, r.email]));
}


// ── 115: automatic messages ───────────────────────────────────────────────────────────────────────────────────────
// The runner's SQL (automations.ts). With admin's messages repository, the second creator of a message ("automatic
// runs", messages.guard.test.ts); the only writer of runs and recipients, and of an automation's `next_run_at` once it
// is running.

export interface DueAutomation {
  id: string;
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
  mode: "trigger" | "repeat";
  triggerKind: "not_ordered_days" | "cart_left_hours" | null;
  triggerValue: number | null;
  repeatEvery: "day" | "week" | "month" | null;
  repeatDays: number[] | null;
  repeatDate: number | null;
  repeatTime: string | null;
  startsOn: string | null;
  endsOn: string | null;
  activatedAt: Date;
  createdBy: string;
}

/** Running automations whose time has come, oldest first. */
export async function dueAutomationIds(db: Queryable, now: Date, limit = 50): Promise<string[]> {
  return (await db.query<{ id: string }>(
    `SELECT id::text AS id FROM public.message_automation WHERE status = 'active' AND next_run_at <= $1 ORDER BY next_run_at, id LIMIT $2`,
    [now, limit],
  )).rows.map((r) => r.id);
}

/** The automation, locked for this run, if it is still running and due and no other pass holds it. */
export async function lockDueAutomation(tx: Queryable, id: string, now: Date): Promise<DueAutomation | null> {
  const r = (await tx.query<{
    id: string; name: string; kind: MessageKind; audience: NotificationAudience; filter: AudienceFilter; destination: MessageDestination;
    title: string; body: string; picture_key: string | null; push: boolean; email: boolean; name_fallback: string;
    mode: DueAutomation["mode"]; trigger_kind: DueAutomation["triggerKind"]; trigger_value: number | null;
    repeat_every: DueAutomation["repeatEvery"]; repeat_days: number[] | null; repeat_date: number | null; repeat_time: string | null;
    starts_on: string | null; ends_on: string | null; activated_at: Date; created_by: string;
  }>(
    `SELECT id::text AS id, name, kind, audience, filter, destination, title, body, picture_key, push, email, name_fallback, mode,
            trigger_kind, trigger_value, repeat_every, repeat_days, repeat_date, to_char(repeat_time, 'HH24:MI') AS repeat_time,
            to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, activated_at, created_by
       FROM public.message_automation
      WHERE id = $1 AND status = 'active' AND next_run_at <= $2
      FOR UPDATE SKIP LOCKED`,
    [id, now],
  )).rows[0];
  if (!r) return null;
  return {
    id: r.id, name: r.name, kind: r.kind, audience: r.audience, filter: r.filter, destination: r.destination, title: r.title,
    body: r.body, pictureKey: r.picture_key, push: r.push, email: r.email, nameFallback: r.name_fallback, mode: r.mode,
    triggerKind: r.trigger_kind, triggerValue: r.trigger_value, repeatEvery: r.repeat_every, repeatDays: r.repeat_days,
    repeatDate: r.repeat_date, repeatTime: r.repeat_time, startsOn: r.starts_on, endsOn: r.ends_on, activatedAt: r.activated_at,
    createdBy: r.created_by,
  };
}

/** The latest run, and whether its message is still being written (a repeat then waits, US4 scenario 5). */
export async function latestRun(tx: Queryable, automationId: string): Promise<{ outcome: string; sending: boolean } | null> {
  const r = (await tx.query<{ outcome: string; sending: boolean }>(
    `SELECT r.outcome, COALESCE(m.status = 'sending', false) AS sending
       FROM public.message_automation_run r LEFT JOIN public.message m ON m.id = r.message_id
      WHERE r.automation_id = $1 ORDER BY r.ran_at DESC, r.id DESC LIMIT 1`,
    [automationId],
  )).rows[0];
  return r ?? null;
}

/** Any earlier run whose message is still sending. */
export async function runStillSending(tx: Queryable, automationId: string): Promise<boolean> {
  return ((await tx.query(
    `SELECT 1 FROM public.message_automation_run r JOIN public.message m ON m.id = r.message_id
      WHERE r.automation_id = $1 AND m.status = 'sending' LIMIT 1`,
    [automationId],
  )).rowCount ?? 0) > 0;
}

export async function insertRun(tx: Queryable, automationId: string, now: Date, outcome: "nobody" | "waited"): Promise<string> {
  return (await tx.query<{ id: string }>(
    `INSERT INTO public.message_automation_run (automation_id, ran_at, outcome) VALUES ($1, $2, $3) RETURNING id::text AS id`,
    [automationId, now, outcome],
  )).rows[0]!.id;
}

export async function recordRunResult(tx: Queryable, runId: string, matched: number, messageId: string | null): Promise<void> {
  await tx.query(
    `UPDATE public.message_automation_run SET matched = $2, message_id = $3, outcome = CASE WHEN $3::uuid IS NULL THEN 'nobody' ELSE 'sent_to_message' END
      WHERE id = $1`,
    [runId, matched, messageId],
  );
}

/** The customers' last paid order: the occurrence a win-back and a cart reminder are keyed on (R6). */
const LAST_ORDER = `SELECT DISTINCT ON (o.customer_id) o.customer_id, o.id, COALESCE(o.placed_at, o.created_at) AS at
    FROM public."order" o WHERE o.status = 'paid'
   ORDER BY o.customer_id, COALESCE(o.placed_at, o.created_at) DESC, o.id DESC`;
const ACTIVE_CUSTOMER = `c.cognito_sub IS NOT NULL AND c.status = 'active' AND c.closure_state = 'open'`;

/**
 * The trigger's people this run, recorded once per occurrence (UNIQUE automation, customer, key; ON CONFLICT DO NOTHING):
 * - not_ordered_days: last paid order + N days has passed; key = that order. A new order is a new stretch.
 * - cart_left_hours: the cart's oldest line + N hours has passed; key = last order (or none) and the cart. Removing a
 *   line or refilling makes no new key; only an order does (U2).
 * Only moments at or after `activated_at`: no backlog (R6, L7). Returns how many were recorded.
 */
export async function recordTriggerRecipients(tx: Queryable, a: DueAutomation, runId: string, now: Date): Promise<number> {
  const args = [a.id, runId, a.triggerValue, now, a.activatedAt];
  const res =
    a.triggerKind === "not_ordered_days"
      ? await tx.query(
          `WITH last AS (${LAST_ORDER})
           INSERT INTO public.message_automation_recipient (automation_id, customer_id, occurrence_key, run_id)
           SELECT $1, c.id, l.id::text, $2
             FROM last l JOIN public.customer c ON c.id = l.customer_id
            WHERE ${ACTIVE_CUSTOMER}
              AND l.at + make_interval(days => $3::int) <= $4::timestamptz
              AND l.at + make_interval(days => $3::int) >= $5::timestamptz
           ON CONFLICT ON CONSTRAINT message_automation_recipient_once DO NOTHING`,
          args,
        )
      : await tx.query(
          `WITH last AS (${LAST_ORDER}),
                carts AS (SELECT ca.id AS cart_id, ca.customer_id, min(ci.added_at) AS oldest
                            FROM public.cart ca JOIN public.cart_item ci ON ci.cart_id = ca.id GROUP BY ca.id, ca.customer_id)
           INSERT INTO public.message_automation_recipient (automation_id, customer_id, occurrence_key, run_id)
           SELECT $1, c.id, COALESCE(l.id::text, 'none') || ':' || k.cart_id::text, $2
             FROM carts k JOIN public.customer c ON c.id = k.customer_id LEFT JOIN last l ON l.customer_id = c.id
            WHERE ${ACTIVE_CUSTOMER}
              AND k.oldest + make_interval(hours => $3::int) <= $4::timestamptz
              AND k.oldest + make_interval(hours => $3::int) >= $5::timestamptz
           ON CONFLICT ON CONSTRAINT message_automation_recipient_once DO NOTHING`,
          args,
        );
  return res.rowCount ?? 0;
}

/** A run's message: an ordinary scheduled message, due now, from the automation's words, with this audience. */
export async function insertAutomationMessage(
  tx: Queryable,
  a: DueAutomation,
  filter: AudienceFilter,
  now: Date,
  count: number,
): Promise<string> {
  const id = (await tx.query<{ id: string }>(
    `INSERT INTO public.message (kind, title, body, picture_key, push, email, name_fallback, status, send_at, automation_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8, $9, $10) RETURNING id::text AS id`,
    [a.kind, a.title, a.body, a.pictureKey, a.push, a.email, a.nameFallback, now, a.id, a.createdBy],
  )).rows[0]!.id;
  await tx.query(
    `INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
    [id, a.audience, JSON.stringify(filter), JSON.stringify(a.destination)],
  );
  await tx.query(`INSERT INTO public.message_event (message_id, event, detail, actor) VALUES ($1, 'created', $2::jsonb, 'system')`, [
    id,
    JSON.stringify({ automation: a.name }),
  ]);
  await event(tx, id, "scheduled", { count });
  return id;
}

/** The next run; `null` = the schedule is over: finished, with its log saying so. */
export async function setNextRun(tx: Queryable, automationId: string, next: Date | null): Promise<void> {
  if (next) {
    await tx.query(`UPDATE public.message_automation SET next_run_at = $2, updated_at = now() WHERE id = $1`, [automationId, next]);
    return;
  }
  await tx.query(
    `UPDATE public.message_automation SET status = 'finished', next_run_at = NULL, version = version + 1, updated_at = now() WHERE id = $1`,
    [automationId],
  );
  await tx.query(`INSERT INTO public.message_automation_event (automation_id, kind, actor_sub) VALUES ($1, 'finished', 'system')`, [automationId]);
}
