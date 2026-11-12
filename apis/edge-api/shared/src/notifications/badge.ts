// 116 C6: "this person's app icon badge is out of date" - the ONE module that queues a badge correction
// (`notification_badge_correction`, one row per person and audience, so a burst of changes is one correction). The
// notifications drain sends it (worker/badge.ts) as a silent push; erasure deletes a closed account's rows
// (badge.guard.test.ts).
//
// Queued when the unseen count changes and no push says so: the inbox seen, read, read all or archived anywhere
// (inbox-handlers, read-handler); a new item whose push did not go out at once (notify()); an item expired or withdrawn
// (the drain's sweep below). Customers and drivers only: the shop console's badge follows the count live (110).
import type { NotificationAudience } from "@effy/shared-types";

import { logger } from "../lib/logger";
import { pooled, type Queryable } from "../lib/db";

export const BADGE_AUDIENCES: readonly NotificationAudience[] = ["customer", "driver"];

/** Queue one correction per person; an existing one keeps its (earlier) time, so a burst is sent once. */
export async function requestBadgeCorrections(db: Queryable, people: readonly { audience: NotificationAudience; sub: string }[]): Promise<number> {
  const rows = people.filter((p) => p.sub && BADGE_AUDIENCES.includes(p.audience));
  if (rows.length === 0) return 0;
  const res = await db.query(
    `INSERT INTO public.notification_badge_correction (recipient_sub, audience)
     SELECT DISTINCT sub, audience FROM unnest($1::text[], $2::text[]) AS p(sub, audience)
     ON CONFLICT (recipient_sub, audience) DO UPDATE
       SET requested_at = LEAST(public.notification_badge_correction.requested_at, EXCLUDED.requested_at)`,
    [rows.map((p) => p.sub), rows.map((p) => p.audience)],
  );
  return res.rowCount ?? 0;
}

/**
 * For a route after its change: never throws (a badge is cosmetic - the next push or inbox open puts it right), so a
 * failed queue never fails the shopper's request. Logged, like `announce`.
 */
export async function correctBadgesSoon(people: readonly { audience: NotificationAudience; sub: string }[], db: Queryable = pooled): Promise<void> {
  try {
    await requestBadgeCorrections(db, people);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), metric: "badge_queue_failed" }, "badge correction not queued");
  }
}

/**
 * The drain's expiry sweep (contracts/push.md, step 1): everyone with an unseen item that expired - or was withdrawn
 * (112 sets `expires_at = now()`) - since the watermark, queued; the watermark moves to now in the same statement, so a
 * skipped run is caught up by the next and nothing is queued twice. `$1` = now. Returns the people queued.
 */
export const QUEUE_EXPIRED_BADGES_SQL = `
  WITH mark AS (
      SELECT swept_to FROM public.notification_badge_sweep WHERE id = 1 FOR UPDATE
  ), moved AS (
      UPDATE public.notification_badge_sweep SET swept_to = GREATEST(swept_to, $1::timestamptz) WHERE id = 1
      RETURNING 1
  ), due AS (
      SELECT DISTINCT n.recipient_sub, n.audience
        FROM public.notification n, mark
       WHERE n.seen_at IS NULL AND n.archived_at IS NULL AND n.expires_at IS NOT NULL
         AND n.expires_at > mark.swept_to AND n.expires_at <= $1::timestamptz
         AND n.audience = ANY (ARRAY['customer', 'driver'])
  )
  INSERT INTO public.notification_badge_correction (recipient_sub, audience)
  SELECT recipient_sub, audience FROM due
  ON CONFLICT (recipient_sub, audience) DO UPDATE
    SET requested_at = LEAST(public.notification_badge_correction.requested_at, EXCLUDED.requested_at)`;

export async function queueExpiredBadges(db: Queryable, now: Date): Promise<number> {
  return (await db.query(QUEUE_EXPIRED_BADGES_SQL, [now.toISOString()])).rowCount ?? 0;
}
