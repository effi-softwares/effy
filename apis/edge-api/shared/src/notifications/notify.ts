// The ONE writer of public.notification and public.notification_delivery (109; notifications.guard.test.ts).
//
// Called inside the transaction of the change it reports, so a change that did not happen never notifies anyone.
// Each recipient gets one notification holding the words as they are said today (the catalogue), and one delivery
// per channel asked for. A repeat - the same type, person and scope - creates nothing: no second notification, and no
// second push or email, because deliveries are written only for the notifications this call inserted.
import { serializeDestination } from "@effy/shared-types";

import { afterCommit, type Queryable } from "../lib/db";
import { announceInbox } from "./announce-inbox";
import { catalogueEntry, wordsFor, type NotificationSubject, type NotificationType } from "./catalogue";

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
}

/** How many notifications were created (0 for a repeat). */
export async function notify(tx: Queryable, input: NotifyInput): Promise<number> {
  // One per person even when a caller's recipient list repeats someone.
  const byPerson = new Map<string, string | null>();
  for (const r of input.recipients) {
    if (!r.sub) continue;
    const email = r.email?.trim() || null;
    if (!byPerson.has(r.sub) || (email && !byPerson.get(r.sub))) byPerson.set(r.sub, email);
  }
  if (byPerson.size === 0) return 0;
  if (!input.dedupeScope) throw new Error("notify: dedupeScope is required");

  const entry = catalogueEntry(input.type);
  if (input.pinnedUntil && entry.importance !== "important") {
    throw new Error(`notify: only an important notification can be pinned (${input.type})`);
  }
  const words = wordsFor(input.type, input.subject);
  const destination = serializeDestination(entry.destination(input.subject));
  const channels = [...new Set(input.channels)];

  const res = await tx.query<{ created: string; subs: string[] | null }>(
    `WITH input AS (
         SELECT * FROM unnest($1::text[], $2::text[]) AS r(sub, email)
     ), inserted AS (
         INSERT INTO public.notification
             (recipient_sub, audience, type, category, importance, title, body, entity_id, destination,
              expires_at, dedupe_key, pinned_until)
         SELECT i.sub, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10::jsonb, $11::timestamptz,
                $4 || ':' || i.sub || ':' || $12, $15::timestamptz
           FROM input i
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id, recipient_sub
     ), delivered AS (
         INSERT INTO public.notification_delivery (notification_id, channel, recipient_email, priority)
         SELECT n.id, ch.channel, CASE WHEN ch.channel = 'email' THEN i.email END, $14
           FROM inserted n
           JOIN input i ON i.sub = n.recipient_sub
          CROSS JOIN unnest($13::text[]) AS ch(channel)
          WHERE ch.channel <> 'email' OR i.email IS NOT NULL
         RETURNING 1
     )
     SELECT (SELECT count(*) FROM inserted)::text AS created, (SELECT count(*) FROM delivered) AS deliveries,
            (SELECT array_agg(recipient_sub) FROM inserted) AS subs`,
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
    ],
  );
  // Their open screens re-read once the change has committed (110 R6); a repeat created nothing and says nothing.
  const subs = res.rows[0]?.subs ?? [];
  if (subs.length > 0) {
    // The callbacks run on the same client, after COMMIT and before it is released, so the scope lookups see the commit.
    await afterCommit(tx, () => announceInbox(subs.map((sub) => ({ audience: entry.audience, sub })), tx));
  }
  return Number(res.rows[0]?.created ?? 0);
}
