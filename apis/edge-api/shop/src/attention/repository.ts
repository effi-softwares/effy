// Attention-occurrence state, and the recipients an occurrence is announced to (059, US3).
//
// Raw SQL, no ORM (Principle VI). Every write in one transaction per shop, so a partial failure
// leaves neither a notified row without an intent nor an intent without a notified row.
import type { PoolClient } from "pg";

import { query, withTransaction, type AttentionKind } from "@effy/edge-shared";

/** One live attention occurrence, as the evaluator needs to compare it. */
export interface StoredOccurrence {
  id: string;
  kind: AttentionKind;
  subjectKey: string;
  notifiedAt: Date | null;
}

/** A shop the evaluator should look at. */
export interface ActiveShop {
  id: string;
}

/**
 * Every active shop.
 *
 * ⚠ ACTIVE ONLY. A suspended or disabled shop has no operators who should be interrupted, and
 * notifying one would be telling somebody to go and pick for a shop the platform has stood down.
 */
export async function activeShops(): Promise<ActiveShop[]> {
  const res = await query<ActiveShop>(
    `SELECT id FROM public.shop WHERE status = 'active' ORDER BY id`,
  );
  return res.rows;
}

export async function storedOccurrences(
  tx: PoolClient,
  shopId: string,
): Promise<StoredOccurrence[]> {
  const res = await tx.query<{
    id: string;
    kind: AttentionKind;
    subject_key: string;
    notified_at: Date | null;
  }>(
    `SELECT id, kind, subject_key, notified_at
       FROM public.shop_attention_state
      WHERE shop_id = $1`,
    [shopId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    subjectKey: r.subject_key,
    notifiedAt: r.notified_at,
  }));
}

/**
 * Record an occurrence that has just appeared, and return its id.
 *
 * ⚠ THE RETURNED ID IS THE OCCURRENCE IDENTITY, and it is what `dedupe_key` is built from. Never
 * the product or order id: a product that goes out of stock, is restocked and goes out again is TWO
 * occurrences and must notify twice (FR-019). Keying the dedupe on the product would let the very
 * uniqueness that makes retries safe swallow the recurrence instead.
 */
export async function insertOccurrence(
  tx: PoolClient,
  shopId: string,
  kind: AttentionKind,
  subjectKey: string,
): Promise<string | null> {
  const res = await tx.query<{ id: string }>(
    `INSERT INTO public.shop_attention_state (shop_id, kind, subject_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (shop_id, kind, subject_key) DO NOTHING
     RETURNING id`,
    [shopId, kind, subjectKey],
  );
  // No row means a concurrent run inserted it first — which is a correct outcome, not a failure:
  // that run owns announcing it.
  return res.rows[0]?.id ?? null;
}

/** The condition is still true; nothing to announce, but record that we saw it. */
export async function touchOccurrences(
  tx: PoolClient,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx.query(
    `UPDATE public.shop_attention_state SET last_seen_at = now() WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}

/**
 * The condition has cleared.
 *
 * ⚠ DELETED, NOT MARKED RESOLVED, and that delete is what makes FR-019 a consequence of the design
 * rather than a rule somebody has to remember. A condition that comes back gets a NEW row with a
 * NEW id, so its dedupe key is one the outbox has never seen, and it notifies. Keeping the row with
 * a `resolved_at` and comparing timestamps would have needed a rule instead.
 */
export async function deleteOccurrences(tx: PoolClient, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.query(`DELETE FROM public.shop_attention_state WHERE id = ANY($1::uuid[])`, [ids]);
}

export async function markNotified(tx: PoolClient, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.query(
    `UPDATE public.shop_attention_state SET notified_at = now() WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}

/** A person who should be told, and whether they may act on a manager-only kind. */
export interface Recipient {
  sub: string;
  isManager: boolean;
}

/**
 * Who to tell about this shop.
 *
 * ⚠ RESOLVED AT ENQUEUE TIME, not when the occurrence was recorded (FR-016). Staff membership can
 * change between the two, and the moment of sending is the one that has to be right — a stood-down
 * operator must not be told to go and pick.
 *
 * ⚠ THE MANAGER FLAG COMES FROM THE PLATFORM RECORD, never from a `cognito:groups` claim. There is
 * no request here and no token to read; the record is the only authority, which is also the one
 * Principle IV says decides.
 */
export async function recipientsForShop(tx: PoolClient, shopId: string): Promise<Recipient[]> {
  const res = await tx.query<{ cognito_sub: string; is_manager: boolean }>(
    `SELECT ss.cognito_sub,
            bool_or(sr.name = 'shop_manager') AS is_manager
       FROM public.shop_staff ss
       LEFT JOIN public.shop_staff_role ssr ON ssr.shop_staff_id = ss.id
       LEFT JOIN public.shop_role sr        ON sr.id = ssr.shop_role_id
      WHERE ss.shop_id = $1
        AND ss.status = 'active'
        AND ss.cognito_sub IS NOT NULL
      GROUP BY ss.cognito_sub`,
    [shopId],
  );
  return res.rows.map((r) => ({ sub: r.cognito_sub, isManager: r.is_manager }));
}

/**
 * Enqueue one notification intent.
 *
 * ⚠ `ON CONFLICT DO NOTHING` on the UNIQUE `dedupe_key` is what makes a re-run a no-op. Combined
 * with the occurrence id in the key, that gives "once per occurrence, again on recurrence" for free.
 */
export async function enqueueIntent(
  tx: PoolClient,
  v: {
    recipientSub: string;
    type: string;
    entityId: string;
    dedupeKey: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key, channel)
     VALUES ($1, 'shop', $2, $3::jsonb, $4, 'push')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [v.recipientSub, v.type, JSON.stringify({ entityId: v.entityId }), v.dedupeKey],
  );
}

export { withTransaction };
