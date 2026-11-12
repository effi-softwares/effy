// The ONE writer of public.notification and public.notification_delivery (109; notifications.guard.test.ts).
//
// Called inside the transaction of the change it reports, so a change that did not happen never notifies anyone.
// Each recipient gets one notification holding the words as they are said today (the catalogue), and one delivery
// per channel asked for. A repeat - the same type, person and scope - creates nothing: no second notification, and no
// second push or email, because deliveries are written only for the notifications this call inserted.
//
// The person's say is applied here, in the same statement (111; contracts/sending-rules.md): a marketing notification
// reaches only customers with a current yes (others get no row at all); a channel they turned off is written
// `skipped`; a promotional push over the limits is `capped`; one at night is held until 08:00 (`not_before`).
import {
  hasFirstNamePlaceholder, NAME_FALLBACK_DEFAULT, normaliseFirstName, OPERATING_TZ, parseDestination, policyFor, serializeDestination,
  type NotificationDestination,
} from "@effy/shared-types";

import { afterCommit, type Queryable } from "../lib/db";
import { announceInbox } from "./announce-inbox";
import { requestBadgeCorrections } from "./badge";
import {
  catalogueEntry,
  isMessageType,
  wordsFor,
  type NotificationCategory,
  type NotificationEntry,
  type NotificationImportance,
  type NotificationSubject,
  type NotificationType,
} from "./catalogue";
import {
  channelAllowedSql,
  consentGrantedSql,
  effyDayStartSql,
  policyValuesSql,
  PROMO_LOCK_SQL,
  promoSentSinceSql,
  quietUntilSql,
} from "./preferences";

export type NotificationChannel = "push" | "email";

export interface NotifyRecipient {
  sub: string;
  /** Snapshotted on the email delivery. A recipient with no email gets no email delivery. */
  email?: string | null;
}

export interface NotifyInput {
  type: NotificationType;
  recipients: readonly NotifyRecipient[];
  subject: NotificationSubject;
  /** The occurrence this notification is about, so the same event never notifies twice. */
  dedupeScope: string;
  channels: readonly NotificationChannel[];
  /** A delivery not made by then is abandoned (`expired`), never sent late. */
  expiresAt?: Date | null;
  /** 0 = immediate (every system notification), 1 = bulk. */
  priority?: 0 | 1;
  /** An important notification stays above the rest of the inbox until read or until then (110). */
  pinnedUntil?: Date | null;
  /**
   * A back-office message (112): required for the three message types, refused for every other. The row takes its words,
   * category, importance, destination and picture from here, and records which message it came from (null for a test).
   */
  message?: NotifyMessage;
}

export interface NotifyMessage {
  /** null for a test send: it reaches the person but is not part of the message's report. */
  messageId: string | null;
  source: "campaign" | "direct";
  category: NotificationCategory;
  importance: NotificationImportance;
  title: string;
  body: string;
  destination: NotificationDestination;
  imageUrl: string | null;
  /** 115: the word in place of `{first name}` (stored with the body; filled when read - never a name in the row). */
  nameFallback?: string;
}

/** Test seams only: production callers pass nothing. */
export interface NotifyOptions {
  /** The clock for quiet hours and the limits' windows. */
  now?: Date;
  /** A catalogue entry to use instead of the type's (a marketing kind before spec 4 adds one). */
  entry?: NotificationEntry;
}

/** A promotion must say who it is from (FR-022; Spam Act). */
const NAMES_EFFY = /effy/i;

/** How many notifications were created (0 for a repeat, or a marketing send nobody has said yes to). */
export async function notify(tx: Queryable, input: NotifyInput, options: NotifyOptions = {}): Promise<number> {
  // One per person even when a caller's recipient list repeats someone.
  const byPerson = new Map<string, string | null>();
  for (const r of input.recipients) {
    if (!r.sub) continue;
    const email = r.email?.trim() || null;
    if (!byPerson.has(r.sub) || (email && !byPerson.get(r.sub))) byPerson.set(r.sub, email);
  }
  if (byPerson.size === 0) return 0;
  if (!input.dedupeScope) throw new Error("notify: dedupeScope is required");

  const base = options.entry ?? catalogueEntry(input.type);
  const message = input.message ?? null;
  if (isMessageType(input.type) !== (message !== null)) {
    throw new Error(`notify: a message type needs its message, and only a message type takes one (${input.type})`);
  }
  // A message is filed under the category its kind gives (shared-types messages.ts), never the entry's placeholder.
  const entry: NotificationEntry = message ? { ...base, category: message.category, importance: message.importance } : base;
  if (input.pinnedUntil && entry.importance !== "important") {
    throw new Error(`notify: only an important notification can be pinned (${input.type})`);
  }
  if (message && parseDestination(entry.audience, serializeDestination(message.destination)) === null) {
    throw new Error(`notify: a ${entry.audience} cannot open this destination (${message.destination.kind})`);
  }
  if (message && hasFirstNamePlaceholder(message.title)) {
    // The title is on every lock screen: a name never goes there (115 FR-023).
    throw new Error(`notify: a message title cannot hold the first-name placeholder (${input.type})`);
  }
  const words = message
    ? { title: message.title, body: normaliseFirstName(message.body, message.nameFallback ?? NAME_FALLBACK_DEFAULT) }
    : options.entry
      ? (entry.words?.(input.subject) ?? { title: entry.title, body: entry.body })
      : wordsFor(input.type, input.subject);
  const destination = serializeDestination(message ? message.destination : entry.destination(input.subject));
  const channels = [...new Set(input.channels)];
  const policy = policyFor(entry.audience, entry.category);
  if (policy.marketing) {
    if (!NAMES_EFFY.test(`${words.title} ${words.body}`)) {
      throw new Error(`notify: a promotion must name Effy as its sender (${input.type})`);
    }
    // Serialise promotional sends so two can never both pass one customer's limit (R5).
    await tx.query(PROMO_LOCK_SQL);
  }
  const now = (options.now ?? new Date()).toISOString();

  // $16 = the clock, $17 = Effy's zone, $18–$20 = a message's source, id and picture (112). `pol` is the category's
  // policy row; `input` carries each recipient's customer id (customers only) so their choices and consent can be read.
  const res = await tx.query<{ created: string; subs: string[] | null; badge_subs: string[] | null }>(
    `WITH pol AS (
         SELECT * FROM ${policyValuesSql()} WHERE pol.audience = $3 AND pol.category = $5
     ), input AS (
         SELECT r.sub, r.email, c.id AS customer_id
           FROM unnest($1::text[], $2::text[]) AS r(sub, email)
           LEFT JOIN public.customer c ON $3 = 'customer' AND c.cognito_sub = r.sub
     ), eligible AS (
         -- A promotion is written only for those with a current yes (FR-011): no inbox item, no push, no email.
         SELECT i.* FROM input i CROSS JOIN pol WHERE NOT pol.marketing OR ${consentGrantedSql("i.customer_id")}
     ), inserted AS (
         INSERT INTO public.notification
             (recipient_sub, audience, type, category, importance, title, body, entity_id, destination,
              expires_at, dedupe_key, pinned_until, source, message_id, image_url)
         SELECT i.sub, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10::jsonb, $11::timestamptz,
                $4 || ':' || i.sub || ':' || $12, $15::timestamptz, $18, $19::uuid, $20
           FROM eligible i
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id, recipient_sub
     ), limits AS (
         SELECT COALESCE((SELECT promo_push_per_day FROM public.notification_settings WHERE id = 1), 1) AS per_day,
                COALESCE((SELECT promo_push_per_week FROM public.notification_settings WHERE id = 1), 3) AS per_week
     ), judged AS (
         SELECT n.id AS notification_id, ch.channel, CASE WHEN ch.channel = 'email' THEN i.email END AS recipient_email,
                CASE
                  WHEN NOT ${channelAllowedSql("i.customer_id", "ch.channel")} THEN 'skipped'
                  -- 115: the limits count marketing messages (push or email), and cap both channels (FR-011).
                  WHEN pol.marketing AND ch.channel = ANY (ARRAY['push', 'email'])
                       AND (${promoSentSinceSql("i.sub", effyDayStartSql("$16::timestamptz", "$17"))} >= l.per_day
                            OR ${promoSentSinceSql("i.sub", "($16::timestamptz - interval '7 days')")} >= l.per_week) THEN 'capped'
                  ELSE 'pending'
                END AS status,
                pol.marketing AND ch.channel = ANY (ARRAY['push', 'email']) AS promo_push
           FROM inserted n
           JOIN eligible i ON i.sub = n.recipient_sub
          CROSS JOIN pol
          CROSS JOIN limits l
          CROSS JOIN unnest($13::text[]) AS ch(channel)
          WHERE ch.channel <> 'email' OR i.email IS NOT NULL
     ), delivered AS (
         INSERT INTO public.notification_delivery (notification_id, channel, recipient_email, priority, status, not_before)
         SELECT j.notification_id, j.channel, j.recipient_email, $14, j.status,
                -- Quiet hours (FR-018): a promotional push or email (115) due at night waits for 08:00; its inbox item does not.
                CASE WHEN j.promo_push AND j.status = 'pending' THEN ${quietUntilSql("$16::timestamptz", "$17")} END
           FROM judged j
         RETURNING notification_id, channel, status, not_before
     )
     SELECT (SELECT count(*) FROM inserted)::text AS created, (SELECT count(*) FROM delivered) AS deliveries,
            (SELECT array_agg(recipient_sub) FROM inserted) AS subs,
            -- 116: whose count rose with no push going out now (push off, capped, held to 08:00, or none asked for).
            (SELECT array_agg(i.recipient_sub) FROM inserted i
              WHERE NOT EXISTS (SELECT 1 FROM delivered d
                                 WHERE d.notification_id = i.id AND d.channel = 'push' AND d.status = 'pending'
                                   AND d.not_before IS NULL)) AS badge_subs`,
    [
      [...byPerson.keys()],
      [...byPerson.values()],
      entry.audience,
      input.type,
      entry.category,
      entry.importance,
      words.title,
      words.body,
      input.subject.entityId ?? "",
      destination,
      input.expiresAt ? input.expiresAt.toISOString() : null,
      input.dedupeScope,
      channels,
      input.priority ?? 0,
      input.pinnedUntil ? input.pinnedUntil.toISOString() : null,
      now,
      OPERATING_TZ,
      message?.source ?? "system",
      message?.messageId ?? null,
      message?.imageUrl ?? null,
    ],
  );
  // 116: a new item with no push now still changes the icon's number - their phones get a silent correction (same
  // transaction, so a rolled-back change queues nothing). An immediate push carries the badge itself (110 R8).
  const badgeSubs = res.rows[0]?.badge_subs ?? [];
  if (badgeSubs.length > 0) await requestBadgeCorrections(tx, badgeSubs.map((sub) => ({ audience: entry.audience, sub })));
  // Their open screens re-read once the change has committed (110 R6); a repeat created nothing and says nothing.
  const subs = res.rows[0]?.subs ?? [];
  if (subs.length > 0) {
    // The callbacks run on the same client, after COMMIT and before it is released, so the scope lookups see the commit.
    await afterCommit(tx, () => announceInbox(subs.map((sub) => ({ audience: entry.audience, sub })), tx));
  }
  return Number(res.rows[0]?.created ?? 0);
}
