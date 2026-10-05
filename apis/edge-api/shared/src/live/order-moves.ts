import { pooled, type Queryable } from "../lib/db";
import { logger } from "../lib/logger";
import { customerViewChanged } from "../lib/order-completion";
import { announce, type LiveChange } from "./announce";

/**
 * 071 — tell whoever is watching that packages (shop portions of an order) have moved.
 *
 * One function for every service that moves a package — the shop packing it, a driver collecting
 * or delivering it, back-office recording a carrier handover — so the rule for who hears is written
 * once (constitution Principle III):
 *
 *   · the shop holding each moved package        → `orders`
 *   · operations                                  → `orders`  (unless `ops: false`)
 *   · the customer                                → `orders`, ONLY if what their order page says
 *                                                   has changed (`customerViewChanged`)
 *
 * ⚠ CALL IT AFTER THE COMMIT, with each moved package and the status it moved FROM. It reads the
 * packages as they now are; the "before" picture is reconstructed by putting the moved ones back,
 * so no caller has to read anything before its own write.
 *
 * ⚠ IT NEVER THROWS (FR-006). It makes one read, and if that read fails the move it follows has
 * still happened; the failure is logged and the screens catch up on their next read.
 */

export interface PackageMove {
  fulfillmentId: string;
  /** The status the package was in before this change. `null`: it did not change status (a pick). */
  from: string | null;
}

export interface AnnounceMovesOptions {
  /**
   * False for changes operations has no screen for — per-item pick progress. Default true.
   */
  ops?: boolean;
  /** Further changes to send in the same publish (a driver's `work`, operations' `dispatch`). */
  also?: readonly LiveChange[];
  db?: Queryable;
}

const PACKAGES_OF_THE_SAME_ORDERS = `
SELECT sf.id::text AS id, sf.order_id::text AS order_id, sf.shop_id::text AS shop_id, sf.status,
       c.cognito_sub
  FROM public.shop_fulfillment sf
  JOIN public."order" o   ON o.id = sf.order_id
  JOIN public.customer c  ON c.id = o.customer_id
 WHERE sf.order_id IN (SELECT order_id FROM public.shop_fulfillment WHERE id = ANY($1::uuid[]))`;

interface PackageRow {
  id: string;
  order_id: string;
  shop_id: string;
  status: string;
  cognito_sub: string;
}

/** The changes a set of package moves amounts to. Exported for its tests; use `announceMoves`. */
export function changesForMoves(rows: readonly PackageRow[], moves: readonly PackageMove[], ops: boolean): LiveChange[] {
  const fromOf = new Map(moves.map((m) => [m.fulfillmentId, m.from]));
  const changes: LiveChange[] = [];

  const byOrder = new Map<string, PackageRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(row);
    byOrder.set(row.order_id, list);
  }

  for (const packages of byOrder.values()) {
    for (const p of packages) {
      if (fromOf.has(p.id)) changes.push({ scope: "shop", shopId: p.shop_id, kind: "orders" });
    }
    const after = packages.map((p) => p.status);
    const before = packages.map((p) => fromOf.get(p.id) ?? p.status);
    if (customerViewChanged(before, after)) {
      changes.push({ scope: "customer", sub: packages[0]!.cognito_sub, kind: "orders" });
    }
  }
  if (ops && rows.some((r) => fromOf.has(r.id))) changes.push({ scope: "ops", kind: "orders" });
  return changes;
}

export async function announceMoves(moves: readonly PackageMove[], options: AnnounceMovesOptions = {}): Promise<void> {
  const also = options.also ?? [];
  try {
    if (moves.length === 0) return await announce(also);
    const { rows } = await (options.db ?? pooled).query<PackageRow>(PACKAGES_OF_THE_SAME_ORDERS, [
      moves.map((m) => m.fulfillmentId),
    ]);
    await announce([...changesForMoves(rows, moves, options.ops ?? true), ...also]);
  } catch (err) {
    logger.warn({ err }, "live: package moves not announced");
    // What can still be said without the read is said: these do not depend on it.
    await announce(also);
  }
}

// ── Whole-order changes: a refund, a cancellation, a request ─────────────────────────────────────

export interface AnnounceOrderOptions {
  /** False when no shop's screen shows the change (a customer's refund REQUEST moves nothing). */
  shops?: boolean;
  /** True when the change frees or takes a same-day place. */
  slots?: boolean;
  /** True when a driver holding the order's packages on an open round must see it (a cancellation). */
  drivers?: boolean;
  db?: Queryable;
}

const ORDER_AUDIENCE = `
SELECT c.cognito_sub,
       COALESCE((SELECT array_agg(DISTINCT sf.shop_id::text)
                   FROM public.shop_fulfillment sf WHERE sf.order_id = o.id), '{}') AS shop_ids,
       COALESCE((SELECT array_agg(DISTINCT dr.driver_id::text)
                   FROM public.shop_fulfillment sf
                   JOIN public.round_package rp ON rp.shop_fulfillment_id = sf.id
                   JOIN public.round_stop rs    ON rs.id = rp.stop_id
                   JOIN public.driver_round dr  ON dr.id = rs.round_id
                  WHERE sf.order_id = o.id
                    AND dr.status IN ('planned', 'in_progress')), '{}') AS driver_ids
  FROM public."order" o
  JOIN public.customer c ON c.id = o.customer_id
 WHERE o.id = $1`;

/**
 * Tell everyone an ORDER concerns that it changed: a refund issued or settled, a cancellation, a
 * refund request raised or answered. The customer always hears — each of these is on their own
 * order page, and it is their money. They are told once, as one update naming no shop, however
 * many shops fulfil the order (FR-024).
 *
 * ⚠ After the commit, and it never throws — same contract as `announceMoves`.
 */
export async function announceOrder(orderId: string, options: AnnounceOrderOptions = {}): Promise<void> {
  try {
    const { rows } = await (options.db ?? pooled).query<{ cognito_sub: string; shop_ids: string[]; driver_ids: string[] }>(
      ORDER_AUDIENCE,
      [orderId],
    );
    const order = rows[0];
    if (!order) return;

    const changes: LiveChange[] = [
      { scope: "customer", sub: order.cognito_sub, kind: "orders" },
      { scope: "ops", kind: "orders" },
    ];
    if (options.shops ?? true) {
      for (const shopId of order.shop_ids) changes.push({ scope: "shop", shopId, kind: "orders" });
    }
    if (options.slots) changes.push({ scope: "ops", kind: "slots" });
    if (options.drivers && order.driver_ids.length > 0) {
      for (const driverId of order.driver_ids) changes.push({ scope: "driver", driverId, kind: "work" });
      changes.push({ scope: "ops", kind: "dispatch" });
    }
    await announce(changes);
  } catch (err) {
    logger.warn({ err }, "live: order change not announced");
  }
}

/** As `announceOrder`, for a refund known only by the provider's id (the provider's own report). */
export async function announceOrderOfProviderRefund(providerRefundId: string, db: Queryable = pooled): Promise<void> {
  try {
    const { rows } = await db.query<{ order_id: string }>(
      `SELECT order_id::text AS order_id FROM public.refund WHERE provider_refund_id = $1`,
      [providerRefundId],
    );
    if (rows[0]) await announceOrder(rows[0].order_id, { db });
  } catch (err) {
    logger.warn({ err }, "live: refund outcome not announced");
  }
}
