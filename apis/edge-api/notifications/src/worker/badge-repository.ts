// 116 C6: the drain's side of badge corrections - claim the due ones (with badge.ts and erasure, the only code that
// touches `notification_badge_correction`; badge.guard.test.ts), read each person's unseen count and the items still to
// keep on screen, and their app devices.
import type { Queryable } from "@effy/edge-shared";
import { queueExpiredBadges } from "@effy/edge-shared/notifications";

export interface DueBadge {
  sub: string;
  audience: "customer" | "driver";
  count: number;
  keep: string[];
}

export interface BadgeToken {
  sub: string;
  audience: "customer" | "driver";
  token: string;
  platform: "android" | "ios";
}

/** A correction younger than this waits, so a burst of changes becomes one (FR-014). */
export const BADGE_COMBINE_SECONDS = 15;
export const BADGE_CLAIM_LIMIT = 500;
export const BADGE_KEEP = 50;

/** 110's unseen definition: listed (not archived, not expired) and never seen. */
const UNSEEN = `n.recipient_sub = p.sub AND n.audience = p.audience AND n.seen_at IS NULL AND n.archived_at IS NULL
  AND (n.expires_at IS NULL OR n.expires_at > $3::timestamptz)`;

/**
 * In the caller's transaction: queue the sweep's expiries, then take the due corrections out of the queue (SKIP LOCKED:
 * two drains never send one twice) with each person's count and keep list as of now.
 */
export async function claimDueBadges(tx: Queryable, now: Date, limit = BADGE_CLAIM_LIMIT): Promise<{ swept: number; due: DueBadge[] }> {
  const swept = await queueExpiredBadges(tx, now);
  const claimed = (await tx.query<{ sub: string; audience: DueBadge["audience"] }>(
    `DELETE FROM public.notification_badge_correction c
      USING (SELECT recipient_sub, audience FROM public.notification_badge_correction
              WHERE requested_at <= $1::timestamptz - make_interval(secs => $2::int)
              ORDER BY requested_at LIMIT $3 FOR UPDATE SKIP LOCKED) due
      WHERE c.recipient_sub = due.recipient_sub AND c.audience = due.audience
      RETURNING c.recipient_sub AS sub, c.audience`,
    [now.toISOString(), BADGE_COMBINE_SECONDS, limit],
  )).rows;
  if (claimed.length === 0) return { swept, due: [] };
  const rows = (await tx.query<{ sub: string; audience: DueBadge["audience"]; count: number; keep: string[] }>(
    `SELECT p.sub, p.audience,
            (SELECT count(*)::int FROM public.notification n WHERE ${UNSEEN}) AS count,
            ARRAY(SELECT n.id::text FROM public.notification n WHERE ${UNSEEN} ORDER BY n.created_at DESC, n.id DESC LIMIT $4) AS keep
       FROM unnest($1::text[], $2::text[]) AS p(sub, audience)`,
    [claimed.map((c) => c.sub), claimed.map((c) => c.audience), now.toISOString(), BADGE_KEEP],
  )).rows;
  return { swept, due: rows };
}

/** The app devices of these people (never the web: the console's badge is live). */
export async function badgeTokens(db: Queryable, people: readonly { sub: string; audience: string }[]): Promise<BadgeToken[]> {
  if (people.length === 0) return [];
  return (await db.query<BadgeToken>(
    `SELECT t.subject_sub AS sub, t.audience, t.fcm_token AS token, t.platform
       FROM public.device_token t
       JOIN unnest($1::text[], $2::text[]) AS p(sub, audience) ON p.sub = t.subject_sub AND p.audience = t.audience
      WHERE t.platform = ANY (ARRAY['android', 'ios'])`,
    [people.map((p) => p.sub), people.map((p) => p.audience)],
  )).rows;
}

/** FCM said these are gone (as the drain does for pushes). */
export async function pruneTokens(db: Queryable, tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.query(`DELETE FROM public.device_token WHERE fcm_token = ANY($1::text[])`, [[...new Set(tokens)]]);
}

/** What is still waiting after a run (the `BadgeCorrectionsQueued` metric). */
export async function queuedBadges(db: Queryable): Promise<number> {
  return (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.notification_badge_correction`)).rows[0]?.n ?? 0;
}
