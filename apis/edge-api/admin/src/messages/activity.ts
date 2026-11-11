// A message's activity (112 FR-025), and the messages one person or shop received (R16): two logs in the drawer (104).
import { activityFact, activityFactNumber, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";
import { MESSAGE_AUDIENCE_WORDS, type NotificationAudience } from "@effy/shared-types";

import { MessageError } from "./errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORDS: Record<string, string> = {
  created: "Written",
  duplicated: "Written from an earlier message",
  edited: "Edited",
  test_sent: "Test sent",
  scheduled: "Scheduled",
  sending: "Sending started",
  sent: "Sent",
  stopped: "Stopped",
  cancelled: "Cancelled",
  withdrawn: "Withdrawn",
  not_sent: "Not sent",
};

const KIND_SQL = `CASE
  WHEN e.event IN ('created', 'duplicated', 'edited') THEN 'written'
  WHEN e.event = 'test_sent' THEN 'test'
  WHEN e.event IN ('scheduled', 'sending', 'sent') THEN 'sending'
  ELSE 'stopped' END`;

const people = (n: number | null) => (n === null ? "" : `${n.toLocaleString("en-AU")} ${n === 1 ? "person" : "people"}`);

function entry(r: ActivityRow) {
  const title = WORDS[r.action] ?? "Changed";
  switch (r.action) {
    case "created":
    case "sent":
      return { title, tone: "primary" as const, detail: r.action === "sent" ? `Reached ${people(activityFactNumber(r, "reached"))}` : null };
    case "sending":
      return { title, tone: "primary" as const, detail: activityFactNumber(r, "count") !== null ? `To ${people(activityFactNumber(r, "count"))}` : null };
    case "scheduled":
      return { title, detail: `To ${people(activityFactNumber(r, "count"))}` };
    case "edited":
      return { title, detail: r.facts?.whileScheduled ? "While scheduled" : null };
    case "test_sent": {
      const to = activityFact(r, "to") as NotificationAudience | null;
      return { title, detail: to ? `To a ${MESSAGE_AUDIENCE_WORDS[to].one} account${r.facts?.written === false ? " - not delivered: no yes" : ""}` : null };
    }
    case "withdrawn":
      return { title, tone: "problem" as const, detail: `Taken from ${people(activityFactNumber(r, "ended"))}'s inboxes` };
    case "stopped":
    case "cancelled":
      return { title, tone: "problem" as const };
    case "not_sent":
      return {
        title,
        tone: "problem" as const,
        detail: `${people(activityFactNumber(r, "count"))} - more than the largest message (${(activityFactNumber(r, "limit") ?? 0).toLocaleString("en-AU")})`,
      };
    default:
      return { title };
  }
}

/** One message's log: every event, with who (the worker is "Effy"). */
export function messageActivitySource(id: string): ActivitySource {
  if (!UUID.test(id)) throw new MessageError(404, "message_not_found", "message not found");
  return {
    sql: `
      SELECT e.id::text AS id, e.created_at AS at, ${KIND_SQL} AS kind, e.event AS action,
             CASE WHEN e.actor = 'system' THEN 'Effy' ELSE ${staffNameSql("e.actor")} END AS actor,
             e.detail::text AS search_text,
             e.detail AS facts
        FROM public.message_event e
       WHERE e.message_id = $1::uuid`,
    args: [id],
    actionWords: WORDS,
    entry,
  };
}

const RECEIVED_WORDS: Record<string, string> = { opened: "Opened", unopened: "Not opened yet" };

function receivedEntry(r: ActivityRow) {
  const kind = activityFact(r, "kind");
  const label = kind === "important" ? "Important" : kind === "direct" ? "Direct message" : kind === "offer" ? "Offer" : kind === "news" ? "News" : "Announcement";
  return {
    title: activityFact(r, "title") ?? "Message",
    tone: r.action === "opened" ? ("done" as const) : undefined,
    detail: `${label} · ${RECEIVED_WORDS[r.action] ?? ""}${activityFact(r, "who") ? ` · ${activityFact(r, "who")}` : ""}`,
  };
}

/**
 * The back-office messages one customer, driver or shop received, newest first (R16). For a shop: what each of its
 * staff received, with whose it was.
 */
export function messagesReceivedSource(audience: unknown, id: unknown): ActivitySource {
  if ((audience !== "customer" && audience !== "driver" && audience !== "shop") || typeof id !== "string" || !UUID.test(id)) {
    throw new MessageError(400, "invalid_message", "audience (customer, driver or shop) and id are required");
  }
  const subs =
    audience === "customer"
      ? `SELECT c.cognito_sub AS sub, NULL::text AS who FROM public.customer c WHERE c.id = $1::uuid`
      : audience === "driver"
        ? `SELECT d.cognito_sub AS sub, NULL::text AS who FROM public.driver d WHERE d.id = $1::uuid`
        : `SELECT ss.cognito_sub AS sub, COALESCE(ss.name, ss.email) AS who FROM public.shop_staff ss WHERE ss.shop_id = $1::uuid`;
  return {
    sql: `
      SELECT n.id::text AS id, n.created_at AS at,
             CASE WHEN n.read_at IS NULL THEN 'unopened' ELSE 'opened' END AS kind,
             CASE WHEN n.read_at IS NULL THEN 'unopened' ELSE 'opened' END AS action,
             ${staffNameSql("m.created_by")} AS actor,
             m.title AS search_text,
             jsonb_build_object('title', m.title, 'kind', m.kind, 'who', p.who) AS facts
        FROM (${subs}) p
        JOIN public.notification n ON n.recipient_sub = p.sub AND n.audience = $2 AND n.message_id IS NOT NULL
        JOIN public.message m ON m.id = n.message_id`,
    args: [id, audience],
    actionWords: RECEIVED_WORDS,
    entry: receivedEntry,
  };
}
