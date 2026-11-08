// The delivery drain's SQL (109). The only writer of a delivery's outcome (notifications.guard.test.ts).
import { withTransaction, type Queryable, type RecipientToken } from "@effy/edge-shared";
import { catalogueEntry, isKnownNotificationType } from "@effy/edge-shared/notifications";

import type { Audience, BatchStore, ClaimedDelivery, DeliveryChannel, Outcome } from "./drain";

interface ClaimedRow {
  id: string;
  notification_id: string;
  channel: DeliveryChannel;
  recipient_email: string | null;
  attempts: number;
  recipient_sub: string;
  audience: Audience;
  type: string;
  title: string;
  body: string;
  entity_id: string | null;
  destination: Record<string, unknown>;
  expires_at: Date | null;
  badge: number;
}

export function batchStore(tx: Queryable): BatchStore {
  return {
    /** Immediate before bulk, then oldest first; locked until this batch's transaction ends. */
    async claim(limit, channels): Promise<ClaimedDelivery[]> {
      const res = await tx.query<ClaimedRow>(
        `SELECT d.id::text AS id, n.id::text AS notification_id, d.channel, d.recipient_email, d.attempts,
                n.recipient_sub, n.audience, n.type, n.title, n.body, n.entity_id, n.destination, n.expires_at,
                -- The app icon's number (110 R8): the recipient's unseen count, on the partial index of unseen rows.
                (SELECT count(*)::int FROM public.notification u
                  WHERE u.recipient_sub = n.recipient_sub AND u.audience = n.audience
                    AND u.seen_at IS NULL AND u.archived_at IS NULL
                    AND (u.expires_at IS NULL OR u.expires_at > now())) AS badge
           FROM public.notification_delivery d
           JOIN public.notification n ON n.id = d.notification_id
          WHERE d.status = 'pending'
            AND d.channel = ANY($2::text[])
          ORDER BY d.priority, d.created_at
          LIMIT $1
          FOR UPDATE OF d SKIP LOCKED`,
        [limit, channels],
      );
      return res.rows.map((r) => {
        // The type CHECK keeps rows known; the tag and group are the console's coalescing, not stored words.
        const entry = isKnownNotificationType(r.type) ? catalogueEntry(r.type) : null;
        return {
          id: r.id,
          notificationId: r.notification_id,
          channel: r.channel,
          recipientEmail: r.recipient_email,
          attempts: r.attempts,
          recipientSub: r.recipient_sub,
          audience: r.audience,
          type: r.type,
          title: r.title,
          body: r.body,
          entityId: r.entity_id ?? "",
          destination: r.destination,
          expiresAt: r.expires_at ? new Date(r.expires_at) : null,
          tag: entry?.tag ?? "effy",
          group: entry?.group ?? "attention",
          badge: r.badge,
        };
      });
    },

    async tokensFor(recipients) {
      const subs = [...new Set(recipients.map((r) => r.sub))];
      const audiences = [...new Set(recipients.map((r) => r.audience))];
      const out = new Map<string, RecipientToken[]>();
      if (subs.length === 0) return out;
      const res = await tx.query<{ subject_sub: string; audience: Audience; fcm_token: string; platform: RecipientToken["platform"]; muted_types: string[] }>(
        `SELECT subject_sub, audience, fcm_token, platform, muted_types
           FROM public.device_token
          WHERE subject_sub = ANY($1::text[]) AND audience = ANY($2::text[])`,
        [subs, audiences],
      );
      for (const r of res.rows) {
        const key = `${r.audience}:${r.subject_sub}`;
        out.set(key, [...(out.get(key) ?? []), { fcmToken: r.fcm_token, platform: r.platform, mutedTypes: r.muted_types }]);
      }
      return out;
    },

    async record(outcomes: readonly Outcome[]) {
      if (outcomes.length === 0) return;
      await tx.query(
        `UPDATE public.notification_delivery d
            SET status = CASE WHEN o.status = 'retry' THEN 'pending' ELSE o.status END,
                attempts = d.attempts + CASE WHEN o.attempted THEN 1 ELSE 0 END,
                last_error = o.error,
                processed_at = CASE WHEN o.status = 'retry' THEN NULL ELSE now() END
           FROM unnest($1::uuid[], $2::text[], $3::text[], $4::boolean[]) AS o(id, status, error, attempted)
          WHERE d.id = o.id`,
        [outcomes.map((o) => o.id), outcomes.map((o) => o.status), outcomes.map((o) => o.error), outcomes.map((o) => o.attempted)],
      );
    },

    /** FCM reported these unregistered or invalid. */
    async prune(tokens) {
      if (tokens.length === 0) return;
      await tx.query(`DELETE FROM public.device_token WHERE fcm_token = ANY($1::text[])`, [[...new Set(tokens)]]);
    },
  };
}

/** One batch, one transaction. */
export function inBatch<T>(fn: (store: BatchStore) => Promise<T>): Promise<T> {
  return withTransaction((tx) => fn(batchStore(tx)));
}

export interface PendingStats {
  pending: number;
  /** 0 when nothing is waiting. */
  oldestSeconds: number;
}

export async function pendingStats(db: Queryable): Promise<PendingStats> {
  const res = await db.query<{ pending: string; oldest: string | null }>(
    `SELECT count(*)::text AS pending, extract(epoch FROM now() - min(created_at))::text AS oldest
       FROM public.notification_delivery
      WHERE status = 'pending'`,
  );
  const r = res.rows[0];
  return { pending: Number(r?.pending ?? 0), oldestSeconds: Math.max(0, Math.round(Number(r?.oldest ?? 0))) };
}
