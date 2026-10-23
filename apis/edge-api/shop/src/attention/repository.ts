// One transaction per shop, so a notified row and its intent are written together or not at all.
import type { PoolClient } from "pg";

import { query, withTransaction, type AttentionKind } from "@effy/edge-shared";

export interface StoredOccurrence {
  id: string;
  kind: AttentionKind;
  subjectKey: string;
  notifiedAt: Date | null;
}

export interface ActiveShop {
  id: string;
}

/** Active only: a stood-down shop has nobody who should be interrupted. */
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
 * The returned id is the occurrence identity that `dedupe_key` is built from, never the product or
 * order id: out, restocked and out again is two occurrences and notifies twice.
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
  // No row: a concurrent run inserted it first and owns announcing it.
  return res.rows[0]?.id ?? null;
}

/** Still true: nothing to announce, but record that we saw it. */
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

/** Deleted, not marked resolved: a recurrence gets a new row, a new id and so a new notification. */
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

export interface Recipient {
  sub: string;
  isManager: boolean;
}

/** Resolved at enqueue time, so a stood-down operator is never told. The manager flag comes from the platform record. */
export async function recipientsForShop(tx: PoolClient, shopId: string): Promise<Recipient[]> {
  const res = await tx.query<{ cognito_sub: string; is_manager: boolean }>(
    `SELECT ss.cognito_sub,
            coalesce(bool_or(ssr.role_key = 'shop_manager'), false) AS is_manager
       FROM public.shop_staff ss
       LEFT JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
      WHERE ss.shop_id = $1
        AND ss.status = 'active'
        AND ss.cognito_sub IS NOT NULL
      GROUP BY ss.cognito_sub`,
    [shopId],
  );
  return res.rows.map((r) => ({ sub: r.cognito_sub, isManager: r.is_manager }));
}

/** `ON CONFLICT DO NOTHING` on `dedupe_key` makes a re-run a no-op. */
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
