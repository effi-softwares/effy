/**
 * The points ledger: the only code that writes points. Every writer takes the caller's transaction and
 * locks the customer's `points_account` row first, which keeps the balance non-negative under
 * concurrency. Lock order is always order/payment row, then account row.
 *
 * Nothing updates or deletes an entry or allocation; remainders and the balance (`public.points_usable`)
 * are derived. No metrics or announcements here: the caller does both after its commit.
 */
import type { Queryable } from "../lib/db";
import {
  InsufficientPointsError, PointsInvalidError, PointsNoteRequiredError, PointsOrderNotFoundError, PointsReasonInvalidError,
} from "./errors";
import { expiresAtFor } from "./expiry";
import { loadSettings } from "./settings";
import { isValidReason, type DebitKind } from "./vocabulary";

/** Who made a change: a staff member, the customer, or a named platform flow. */
export type Author = { kind: "staff"; sub: string } | { kind: "customer"; sub: string } | { kind: "system"; flow: string };

/** No single change is larger than this: a typo, not an intent. */
export const MAX_POINTS_PER_CHANGE = 1_000_000;

function assertPoints(points: number): void {
  if (!Number.isSafeInteger(points) || points <= 0 || points > MAX_POINTS_PER_CHANGE) throw new PointsInvalidError();
}

const authorCols = (a: Author): [string, string | null, string | null] =>
  a.kind === "system" ? ["system", null, a.flow] : [a.kind, a.sub, null];

const normaliseNote = (note: string | null | undefined) => {
  const t = (note ?? "").trim();
  return t === "" ? null : t.slice(0, 1000);
};

/** Create the customer's lock row if needed, then lock it for the rest of the caller's transaction. */
export async function lockAccount(tx: Queryable, customerId: string): Promise<void> {
  await tx.query(`INSERT INTO public.points_account (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING`, [customerId]);
  await tx.query(`SELECT 1 FROM public.points_account WHERE customer_id = $1 FOR UPDATE`, [customerId]);
}

/** The usable balance: `public.points_usable`, the one computation. */
export async function usable(q: Queryable, customerId: string, at: Date, exceptOrderId: string | null = null): Promise<number> {
  return (
    (await q.query<{ n: number }>(`SELECT public.points_usable($1::uuid, $2::timestamptz, $3::uuid) AS n`, [customerId, at, exceptOrderId]))
      .rows[0]?.n ?? 0
  );
}

/**
 * Writes a debit and its allocations: from `fromLot` (expiry), else FIFO over unexpired lots, soonest
 * expiring first. The caller has checked the points are there, so running short throws.
 */
async function writeDebit(
  tx: Queryable,
  d: {
    customerId: string; kind: DebitKind; points: number; reason: string; note: string | null; orderId: string | null;
    author: Author; at: Date; fromLot?: string;
  },
): Promise<string> {
  const [authorKind, authorSub, authorFlow] = authorCols(d.author);
  const entryId = (
    await tx.query<{ id: string }>(
      `
INSERT INTO public.points_entry (customer_id, kind, points, reason, note, order_id, author_kind, author_sub, author_flow)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id::text AS id`,
      [d.customerId, d.kind, -d.points, d.reason, d.note, d.orderId, authorKind, authorSub, authorFlow],
    )
  ).rows[0]!.id;

  const lots = (
    await tx.query<{ id: string; left: number }>(
      `
SELECT e.id::text AS id,
       (e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0))::int AS left
  FROM public.points_entry e
 WHERE e.customer_id = $1
   AND e.points > 0
   AND ($3::uuid IS NOT NULL AND e.id = $3::uuid
        OR $3::uuid IS NULL AND e.expires_at > $2)
 ORDER BY e.expires_at, e.created_at, e.id`,
      [d.customerId, d.at, d.fromLot ?? null],
    )
  ).rows;

  let need = d.points;
  for (const lot of lots) {
    if (need === 0) break;
    if (lot.left <= 0) continue;
    const take = Math.min(lot.left, need);
    await tx.query(`INSERT INTO public.points_allocation (debit_entry_id, credit_entry_id, points) VALUES ($1, $2, $3)`, [entryId, lot.id, take]);
    need -= take;
  }
  if (need > 0) throw new Error(`points: ledger short by ${need} for a ${d.kind} debit — invariant violated`);
  return entryId;
}

/** Enqueues "you received points" by push and email. Routing ids only; the address is snapshotted now. */
async function enqueueCredited(tx: Queryable, customerId: string, entryId: string): Promise<void> {
  await tx.query(
    `
INSERT INTO public.notification_request (recipient_sub, audience, type, channel, recipient_email, payload, dedupe_key)
SELECT c.cognito_sub, 'customer', 'points_credited', ch.channel,
       CASE WHEN ch.channel = 'email' THEN c.email ELSE NULL END,
       jsonb_build_object('entityId', $2::text, 'deepLink', 'effy://points'),
       'points_credited:' || ch.channel || ':' || c.cognito_sub || ':' || $2::text
  FROM public.customer c
 CROSS JOIN (VALUES ('push'), ('email')) AS ch(channel)
 WHERE c.id = $1
   AND (ch.channel <> 'email' OR c.email IS NOT NULL)
ON CONFLICT (dedupe_key) DO NOTHING`,
    [customerId, entryId],
  );
}

export interface CreditInput {
  customerId: string;
  points: number;
  kind: "staff_credit" | "auto_credit";
  reason: string;
  note?: string | null;
  orderId?: string | null;
  author: Author;
  /** For automatic flows: the same key twice is one credit. */
  dedupeKey?: string | null;
  /** No message, for a flow whose own message already tells the customer the points (a courier override). */
  quiet?: boolean;
  now: Date;
}

/** Credits a new lot with a full expiry period, and messages the customer. `created: false` on a matched `dedupeKey` is a success. */
export async function credit(tx: Queryable, c: CreditInput): Promise<{ entryId: string; created: boolean; expiresAt: Date }> {
  assertPoints(c.points);
  if (!isValidReason(c.kind, c.reason)) throw new PointsReasonInvalidError();
  const note = normaliseNote(c.note);
  if (c.reason === "other" && note === null) throw new PointsNoteRequiredError();
  if (c.author.kind === "customer") throw new Error("points: a customer cannot credit themself");

  await lockAccount(tx, c.customerId);
  if (c.orderId) {
    // One query for "exists" and "is theirs": the refusal must not say which.
    const ok = (await tx.query(`SELECT 1 FROM public."order" WHERE id = $1 AND customer_id = $2`, [c.orderId, c.customerId])).rowCount ?? 0;
    if (ok === 0) throw new PointsOrderNotFoundError();
  }

  const settings = await loadSettings(tx);
  const expiresAt = expiresAtFor(c.now, settings.expiryMonths);
  const [authorKind, authorSub, authorFlow] = authorCols(c.author);
  const inserted = (
    await tx.query<{ id: string }>(
      `
INSERT INTO public.points_entry
    (customer_id, kind, points, reason, note, order_id, author_kind, author_sub, author_flow, dedupe_key, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (dedupe_key) DO NOTHING
RETURNING id::text AS id`,
      [c.customerId, c.kind, c.points, c.reason, note, c.orderId ?? null, authorKind, authorSub, authorFlow, c.dedupeKey ?? null, expiresAt],
    )
  ).rows[0];

  if (!inserted) {
    const existing = (
      await tx.query<{ id: string; expires_at: Date }>(`SELECT id::text AS id, expires_at FROM public.points_entry WHERE dedupe_key = $1`, [c.dedupeKey])
    ).rows[0];
    if (!existing) throw new Error("points: dedupe hit with no existing entry");
    return { entryId: existing.id, created: false, expiresAt: existing.expires_at };
  }

  if (!c.quiet) await enqueueCredited(tx, c.customerId, inserted.id);
  return { entryId: inserted.id, created: true, expiresAt };
}

export interface DebitInput {
  customerId: string;
  points: number;
  reason: string;
  note?: string | null;
  author: Author;
  now: Date;
}

/** A staff correction. Refused, changing nothing, when more than is usable now. */
export async function debit(tx: Queryable, d: DebitInput): Promise<{ entryId: string }> {
  assertPoints(d.points);
  if (!isValidReason("staff_debit", d.reason)) throw new PointsReasonInvalidError();
  const note = normaliseNote(d.note);
  if (d.reason === "other" && note === null) throw new PointsNoteRequiredError();

  await lockAccount(tx, d.customerId);
  // Usable, not the raw lot total: a live checkout's hold is spoken for.
  const u = await usable(tx, d.customerId, d.now);
  if (u < d.points) throw new InsufficientPointsError(Math.max(0, u));
  const entryId = await writeDebit(tx, {
    customerId: d.customerId, kind: "staff_debit", points: d.points, reason: d.reason, note, orderId: null, author: d.author, at: d.now,
  });
  return { entryId };
}

// Checkout

/**
 * Sets points aside for one order's checkout, replacing its own earlier hold (ignored when deciding
 * what is usable). `points = 0` releases the hold.
 */
export async function hold(
  tx: Queryable,
  h: { customerId: string; orderId: string; points: number; now: Date },
): Promise<{ heldUntil: Date | null }> {
  if (h.points === 0) {
    await release(tx, h.orderId);
    return { heldUntil: null };
  }
  assertPoints(h.points);
  await lockAccount(tx, h.customerId);
  const u = await usable(tx, h.customerId, h.now, h.orderId);
  if (u < h.points) throw new InsufficientPointsError(Math.max(0, u));

  const { holdMinutes } = await loadSettings(tx);
  const heldUntil = new Date(h.now.getTime() + holdMinutes * 60_000);
  await tx.query(
    `
INSERT INTO public.points_hold (order_id, customer_id, points, state, held_until)
VALUES ($1, $2, $3, 'held', $4)
ON CONFLICT (order_id) DO UPDATE
   SET points = EXCLUDED.points, state = 'held', held_until = EXCLUDED.held_until, updated_at = now()
 WHERE public.points_hold.state <> 'spent'`,
    [h.orderId, h.customerId, h.points, heldUntil],
  );
  return { heldUntil };
}

/** Gives an order's held points back. Idempotent. */
export async function release(tx: Queryable, orderId: string): Promise<void> {
  await tx.query(
    `UPDATE public.points_hold SET state = 'released', held_until = NULL, updated_at = now() WHERE order_id = $1 AND state = 'held'`,
    [orderId],
  );
}

export interface SpendOutcome {
  /** Points actually spent; 0 when none were held. */
  spent: number;
  /** Held points no longer there to spend. Effy absorbs them. */
  shortfallPoints: number;
  customerId: string | null;
}

/**
 * Turns an order's hold into a `spent` entry, once, inside the paid transaction. If the hold lapsed and
 * the points went elsewhere, spends what is usable and reports the rest as a shortfall.
 */
export async function spendHeld(tx: Queryable, orderId: string, now: Date): Promise<SpendOutcome> {
  const held = (
    await tx.query<{ customer_id: string; points: number; state: string; sub: string }>(
      `SELECT h.customer_id::text AS customer_id, h.points, h.state, c.cognito_sub AS sub
         FROM public.points_hold h JOIN public.customer c ON c.id = h.customer_id
        WHERE h.order_id = $1`,
      [orderId],
    )
  ).rows[0];
  if (!held || held.state !== "held") return { spent: 0, shortfallPoints: 0, customerId: held?.customer_id ?? null };

  await lockAccount(tx, held.customer_id);
  const u = Math.max(0, await usable(tx, held.customer_id, now, orderId));
  const spent = Math.min(held.points, u);
  if (spent > 0) {
    await writeDebit(tx, {
      customerId: held.customer_id, kind: "spent", points: spent, reason: "spent", note: null, orderId,
      author: { kind: "customer", sub: held.sub }, at: now,
    });
  }
  await tx.query(`UPDATE public.points_hold SET state = 'spent', held_until = NULL, updated_at = now() WHERE order_id = $1`, [orderId]);
  return { spent, shortfallPoints: held.points - spent, customerId: held.customer_id };
}

// Refunds

/**
 * Credits back a refund's points as a new lot with a fresh expiry. Idempotent per refund (unique
 * `refund_id`). Returns the points credited by this call.
 */
export async function returnForRefund(tx: Queryable, refundId: string, now: Date): Promise<{ points: number; customerId: string | null }> {
  const r = (
    await tx.query<{ points_returned: number; order_id: string; customer_id: string }>(
      `SELECT r.points_returned, r.order_id::text AS order_id, o.customer_id::text AS customer_id
         FROM public.refund r JOIN public."order" o ON o.id = r.order_id
        WHERE r.id = $1`,
      [refundId],
    )
  ).rows[0];
  if (!r || r.points_returned <= 0) return { points: 0, customerId: r?.customer_id ?? null };

  await lockAccount(tx, r.customer_id);
  const { expiryMonths } = await loadSettings(tx);
  const inserted = await tx.query(
    `
INSERT INTO public.points_entry (customer_id, kind, points, reason, order_id, refund_id, author_kind, author_flow, expires_at)
VALUES ($1, 'returned', $2, 'returned', $3, $4, 'system', 'refund', $5)
ON CONFLICT (refund_id) DO NOTHING`,
    [r.customer_id, r.points_returned, r.order_id, refundId, expiresAtFor(now, expiryMonths)],
  );
  return { points: (inserted.rowCount ?? 0) > 0 ? r.points_returned : 0, customerId: r.customer_id };
}

// Expiry and closure

/** Lots past expiry with points left: the sweep's work list. */
export async function dueToExpire(q: Queryable, now: Date, limit: number): Promise<{ lotId: string; customerId: string }[]> {
  return (
    await q.query<{ lot_id: string; customer_id: string }>(
      `
SELECT e.id::text AS lot_id, e.customer_id::text AS customer_id
  FROM public.points_entry e
 WHERE e.points > 0 AND e.expires_at <= $1
   AND e.points > COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0)
 ORDER BY e.expires_at, e.id
 LIMIT $2`,
      [now, limit],
    )
  ).rows.map((r) => ({ lotId: r.lot_id, customerId: r.customer_id }));
}

/** Records the `expired` line for one lot (it already stopped counting). Re-checks under the lock. */
export async function expireLot(tx: Queryable, lotId: string, now: Date): Promise<{ points: number; customerId: string }> {
  const lot = (await tx.query<{ customer_id: string }>(`SELECT customer_id::text AS customer_id FROM public.points_entry WHERE id = $1`, [lotId])).rows[0];
  if (!lot) return { points: 0, customerId: "" };
  await lockAccount(tx, lot.customer_id);
  const left = (
    await tx.query<{ left: number }>(
      `SELECT (e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0))::int AS left
         FROM public.points_entry e WHERE e.id = $1 AND e.expires_at <= $2`,
      [lotId, now],
    )
  ).rows[0]?.left ?? 0;
  if (left <= 0) return { points: 0, customerId: lot.customer_id };
  await writeDebit(tx, {
    customerId: lot.customer_id, kind: "expired", points: left, reason: "expired", note: null, orderId: null,
    author: { kind: "system", flow: "points_expiry" }, at: now, fromLot: lotId,
  });
  return { points: left, customerId: lot.customer_id };
}

/**
 * Forfeits every unexpired point when an account closure becomes final. Returns the points forfeited.
 * No caller yet: account erasure is not built (docs/next-implementation-candidates.md item 3).
 */
export async function forfeit(tx: Queryable, customerId: string, now: Date): Promise<number> {
  await lockAccount(tx, customerId);
  const remaining = (
    await tx.query<{ n: number }>(
      `SELECT COALESCE(SUM(e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0)), 0)::int AS n
         FROM public.points_entry e WHERE e.customer_id = $1 AND e.points > 0 AND e.expires_at > $2`,
      [customerId, now],
    )
  ).rows[0]?.n ?? 0;
  if (remaining <= 0) return 0;
  await writeDebit(tx, {
    customerId, kind: "forfeited", points: remaining, reason: "forfeited", note: null, orderId: null,
    author: { kind: "system", flow: "account_closure" }, at: now,
  });
  return remaining;
}

