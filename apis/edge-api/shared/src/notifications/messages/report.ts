// What happened to a back-office message (112 R15): counted from its recipients' notifications and their push
// deliveries, per audience and in total, so every group's parts add up to its whole. Read by the message page (admin)
// and frozen by the daily purge (notifications) before those rows are deleted. ONE copy of the counting.
import type { MessageEmailReportDTO, MessagePushReportDTO, MessageReportDTO, NotificationAudience } from "@effy/shared-types";

import type { Queryable } from "../../lib/db";
import { emailUnsubscribedCountSql } from "../preferences";

interface Row {
  audience: NotificationAudience;
  matched: number;
  frozen: MessageReportDTO | null;
  frozen_at: Date | null;
  reached: number;
  sent: number;
  no_device: number;
  failed: number;
  muted: number;
  turned_off: number;
  over_limit: number;
  held: number;
  waiting: number;
  ended: number;
  seen: number;
  opened: number;
  archived: number;
  /** 115: whether the message went by email, and its email counts (customers only). */
  email_on: boolean;
  e_sent: number;
  e_failed: number;
  e_held: number;
  e_waiting: number;
  e_capped: number;
  e_no_address: number;
  e_off: number;
  e_suppressed: number;
  e_ended: number;
  e_unsubscribed: number;
}

export interface MessageReport {
  byAudience: Partial<Record<NotificationAudience, MessageReportDTO>>;
  total: MessageReportDTO;
  /** Set once the numbers are final (the recipients' rows have gone or are going). */
  frozenAt: Date | null;
}

const ZERO_PUSH: MessagePushReportDTO = {
  sent: 0, noDevice: 0, failed: 0, muted: 0, turnedOff: 0, overLimit: 0, heldForNight: 0, waiting: 0, notSentEnded: 0,
};

export function emptyReport(): MessageReportDTO {
  return { matched: 0, reached: 0, noConsent: 0, push: { ...ZERO_PUSH }, email: null, seen: 0, opened: 0, archived: 0 };
}

function addEmail(a: MessageEmailReportDTO | null, b: MessageEmailReportDTO | null | undefined): MessageEmailReportDTO | null {
  if (!b) return a;
  if (!a) return { ...b, notSent: { ...b.notSent } };
  return {
    sent: a.sent + b.sent,
    failed: a.failed + b.failed,
    heldForNight: a.heldForNight + b.heldForNight,
    waiting: a.waiting + b.waiting,
    overLimit: a.overLimit + b.overLimit,
    notSent: {
      noAddress: a.notSent.noAddress + b.notSent.noAddress,
      turnedOff: a.notSent.turnedOff + b.notSent.turnedOff,
      suppressed: a.notSent.suppressed + b.notSent.suppressed,
      ended: a.notSent.ended + b.notSent.ended,
    },
    unsubscribed: a.unsubscribed + b.unsubscribed,
  };
}

function add(a: MessageReportDTO, b: MessageReportDTO): MessageReportDTO {
  const push = { ...a.push };
  for (const k of Object.keys(push) as (keyof MessagePushReportDTO)[]) push[k] += b.push[k];
  return {
    matched: a.matched + b.matched,
    reached: a.reached + b.reached,
    noConsent: a.noConsent + b.noConsent,
    push,
    // A report frozen before 115 has no `email`.
    email: addEmail(a.email, b.email ?? null),
    seen: a.seen + b.seen,
    opened: a.opened + b.opened,
    archived: a.archived + b.archived,
  };
}

function fromRow(r: Row): MessageReportDTO {
  const reached = Number(r.reached);
  // A person matched and not written was one without a yes (offers and news): notify writes no row for them (111).
  const matched = Math.max(Number(r.matched), reached);
  return {
    matched,
    reached,
    noConsent: matched - reached,
    push: {
      sent: Number(r.sent),
      noDevice: Number(r.no_device),
      failed: Number(r.failed),
      muted: Number(r.muted),
      turnedOff: Number(r.turned_off),
      overLimit: Number(r.over_limit),
      heldForNight: Number(r.held),
      waiting: Number(r.waiting),
      notSentEnded: Number(r.ended),
    },
    // 115 (A1): these add up to `reached`; unsubscribes are beside them (an unsubscriber was also sent).
    email: r.email_on && r.audience === "customer"
      ? {
          sent: Number(r.e_sent),
          failed: Number(r.e_failed),
          heldForNight: Number(r.e_held),
          waiting: Number(r.e_waiting),
          overLimit: Number(r.e_capped),
          notSent: {
            noAddress: Number(r.e_no_address),
            turnedOff: Number(r.e_off),
            suppressed: Number(r.e_suppressed),
            ended: Number(r.e_ended),
          },
          unsubscribed: Number(r.e_unsubscribed),
        }
      : null,
    seen: Number(r.seen),
    opened: Number(r.opened),
    archived: Number(r.archived),
  };
}

/**
 * The report of one message. Audiences whose numbers were frozen come from the stored report; the others are counted
 * now. `pending` splits by whether the push is held for the night (`not_before` still ahead) or simply waiting.
 */
export async function messageReport(db: Queryable, messageId: string): Promise<MessageReport> {
  const res = await db.query<Row>(
    `WITH n AS (
         SELECT n.audience, n.seen_at, n.read_at, n.archived_at, d.status AS push, d.not_before,
                e.id AS email_id, e.status AS email, e.not_before AS email_not_before, e.last_error AS email_error
           FROM public.notification n
           LEFT JOIN public.notification_delivery d ON d.notification_id = n.id AND d.channel = 'push'
           LEFT JOIN public.notification_delivery e ON e.notification_id = n.id AND e.channel = 'email'
          WHERE n.message_id = $1
     ), counted AS (
         SELECT audience,
                count(*)::int AS reached,
                count(*) FILTER (WHERE push = 'sent')::int AS sent,
                count(*) FILTER (WHERE push = 'no_device')::int AS no_device,
                count(*) FILTER (WHERE push = 'failed')::int AS failed,
                count(*) FILTER (WHERE push = 'muted')::int AS muted,
                count(*) FILTER (WHERE push = 'skipped')::int AS turned_off,
                count(*) FILTER (WHERE push = 'capped')::int AS over_limit,
                count(*) FILTER (WHERE push = 'pending' AND not_before > now())::int AS held,
                count(*) FILTER (WHERE push = 'pending' AND (not_before IS NULL OR not_before <= now()))::int AS waiting,
                count(*) FILTER (WHERE push = 'expired')::int AS ended,
                count(*) FILTER (WHERE email = 'sent')::int AS e_sent,
                count(*) FILTER (WHERE email = 'failed')::int AS e_failed,
                count(*) FILTER (WHERE email = 'pending' AND email_not_before > now())::int AS e_held,
                count(*) FILTER (WHERE email = 'pending' AND (email_not_before IS NULL OR email_not_before <= now()))::int AS e_waiting,
                count(*) FILTER (WHERE email = 'capped')::int AS e_capped,
                -- notify writes no email row for someone with no address.
                count(*) FILTER (WHERE email_id IS NULL)::int AS e_no_address,
                count(*) FILTER (WHERE email = 'skipped' AND email_error IS DISTINCT FROM 'suppressed')::int AS e_off,
                count(*) FILTER (WHERE email = 'skipped' AND email_error = 'suppressed')::int AS e_suppressed,
                count(*) FILTER (WHERE email = 'expired')::int AS e_ended,
                count(seen_at)::int AS seen,
                count(read_at)::int AS opened,
                count(archived_at)::int AS archived
           FROM n GROUP BY audience
     )
     SELECT ma.audience, ma.matched_count AS matched, ma.report AS frozen, ma.report_frozen_at AS frozen_at,
            COALESCE(c.reached, 0) AS reached, COALESCE(c.sent, 0) AS sent, COALESCE(c.no_device, 0) AS no_device,
            COALESCE(c.failed, 0) AS failed, COALESCE(c.muted, 0) AS muted, COALESCE(c.turned_off, 0) AS turned_off,
            COALESCE(c.over_limit, 0) AS over_limit, COALESCE(c.held, 0) AS held, COALESCE(c.waiting, 0) AS waiting,
            COALESCE(c.ended, 0) AS ended, COALESCE(c.seen, 0) AS seen, COALESCE(c.opened, 0) AS opened,
            COALESCE(c.archived, 0) AS archived,
            m.email AS email_on,
            COALESCE(c.e_sent, 0) AS e_sent, COALESCE(c.e_failed, 0) AS e_failed, COALESCE(c.e_held, 0) AS e_held,
            COALESCE(c.e_waiting, 0) AS e_waiting, COALESCE(c.e_capped, 0) AS e_capped,
            COALESCE(c.e_no_address, 0) AS e_no_address, COALESCE(c.e_off, 0) AS e_off,
            COALESCE(c.e_suppressed, 0) AS e_suppressed, COALESCE(c.e_ended, 0) AS e_ended,
            CASE WHEN ma.audience = 'customer' THEN (
              ${emailUnsubscribedCountSql("$1")}) ELSE 0 END AS e_unsubscribed
       FROM public.message_audience ma
       JOIN public.message m ON m.id = ma.message_id
       LEFT JOIN counted c ON c.audience = ma.audience
      WHERE ma.message_id = $1
      ORDER BY array_position(ARRAY['customer', 'driver', 'shop'], ma.audience)`,
    [messageId],
  );
  const byAudience: MessageReport["byAudience"] = {};
  let total = emptyReport();
  let frozenAt: Date | null = null;
  for (const r of res.rows) {
    const report = r.frozen ? { ...r.frozen, email: r.frozen.email ?? null } : fromRow(r);
    byAudience[r.audience] = report;
    total = add(total, report);
    if (r.frozen_at && (!frozenAt || r.frozen_at > frozenAt)) frozenAt = new Date(r.frozen_at);
  }
  return { byAudience, total, frozenAt };
}

/** People reached and the share who opened, for the list (one query for a page of messages). */
export async function reachedAndOpened(db: Queryable, messageIds: readonly string[]): Promise<Map<string, { reached: number; opened: number }>> {
  const out = new Map<string, { reached: number; opened: number }>();
  if (messageIds.length === 0) return out;
  const res = await db.query<{ id: string; reached: number; opened: number; frozen_reached: number | null; frozen_opened: number | null }>(
    `SELECT m.id::text AS id,
            (SELECT count(*)::int FROM public.notification n WHERE n.message_id = m.id) AS reached,
            (SELECT count(*)::int FROM public.notification n WHERE n.message_id = m.id AND n.read_at IS NOT NULL) AS opened,
            (SELECT sum((ma.report->>'reached')::int)::int FROM public.message_audience ma WHERE ma.message_id = m.id AND ma.report IS NOT NULL) AS frozen_reached,
            (SELECT sum((ma.report->>'opened')::int)::int FROM public.message_audience ma WHERE ma.message_id = m.id AND ma.report IS NOT NULL) AS frozen_opened
       FROM public.message m WHERE m.id = ANY($1::uuid[])`,
    [messageIds],
  );
  for (const r of res.rows) {
    // A frozen message's rows may be gone; its stored numbers stand for them.
    out.set(r.id, { reached: r.frozen_reached ?? r.reached, opened: r.frozen_opened ?? r.opened });
  }
  return out;
}
