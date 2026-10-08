/**
 * 071 / 074 — tell open apps that a customer's points changed.
 *
 * ⚠ THE FOURTH PLACE A CUSTOMER'S UPDATE IS BUILT, and the only one for points
 * (customer-announce.guard.test.ts). The other three decide from an ORDER so they can never reveal a
 * shop; this one decides from the customer's own ledger, in which no shop appears, and carries only the
 * word `points` (research R7).
 *
 * ⚠ AFTER THE COMMIT, and it never throws — the same contract as `announce`.
 */
import { pooled, type Queryable } from "../lib/db";
import { logger } from "../lib/logger";
import { announce, type LiveChange } from "../live/announce";

/** Announce to each customer (by token subject) and to operations' back-office view. */
export async function announcePoints(customerSubs: readonly (string | null | undefined)[]): Promise<void> {
  const subs = [...new Set(customerSubs.filter((s): s is string => typeof s === "string" && s !== ""))];
  if (subs.length === 0) return;
  const changes: LiveChange[] = subs.map((sub) => ({ scope: "customer", sub, kind: "points" }));
  changes.push({ scope: "ops", kind: "points" });
  await announce(changes);
}

/** As `announcePoints`, for customers known by their platform id. */
export async function announcePointsFor(customerIds: readonly (string | null | undefined)[], db: Queryable = pooled): Promise<void> {
  const ids = [...new Set(customerIds.filter((s): s is string => typeof s === "string" && s !== ""))];
  if (ids.length === 0) return;
  try {
    const { rows } = await db.query<{ sub: string }>(`SELECT cognito_sub AS sub FROM public.customer WHERE id = ANY($1::uuid[])`, [ids]);
    await announcePoints(rows.map((r) => r.sub));
  } catch (err) {
    logger.warn({ err }, "live: points change not announced");
  }
}

/** As `announcePoints`, for the customer who placed an order (a refund returned points to them). */
export async function announcePointsForOrder(orderId: string, db: Queryable = pooled): Promise<void> {
  try {
    const { rows } = await db.query<{ sub: string }>(
      `SELECT c.cognito_sub AS sub FROM public."order" o JOIN public.customer c ON c.id = o.customer_id WHERE o.id = $1`,
      [orderId],
    );
    await announcePoints(rows.map((r) => r.sub));
  } catch (err) {
    logger.warn({ err }, "live: points change not announced");
  }
}
