// Recording that a person opened a notification (109 FR-017). Used by each audience's read route.
//
// Matching on the subject AND the audience is the ownership check: another person's notification, or one addressed to
// the same person under another audience, is simply not found - never "forbidden", which would confirm it exists.
import type { NotificationAudience } from "@effy/shared-types";

import { pooled, type Queryable } from "../lib/db";

export interface ReadNotification {
  notificationId: string;
  /** The first read time; a repeat keeps it. */
  readAt: string;
  /** As stored. */
  destination: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNotificationId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Read and seen, now (or as first recorded). `null` when it is not this person's notification for this audience. */
export async function markRead(
  sub: string,
  audience: NotificationAudience,
  notificationId: string,
  db: Queryable = pooled,
): Promise<ReadNotification | null> {
  if (!sub || !isNotificationId(notificationId)) return null;
  const res = await db.query<{ id: string; read_at: Date; destination: Record<string, string> }>(
    `UPDATE public.notification
        SET read_at = COALESCE(read_at, now()),
            seen_at = COALESCE(seen_at, read_at, now())
      WHERE id = $1 AND recipient_sub = $2 AND audience = $3
      RETURNING id::text AS id, read_at, destination`,
    [notificationId, sub, audience],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { notificationId: row.id, readAt: new Date(row.read_at).toISOString(), destination: row.destination };
}
