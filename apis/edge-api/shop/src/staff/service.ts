import { authorizeShopManager, authorizeShopRefund, upsertOnContact } from "./repository";
import type { ShopStaffRecord } from "./types";

// Orchestration only: no HTTP, no SQL (constitution Principle VI).

/** Meet the operator, record them, hand back the platform's record of them. */
export async function recordAndLoad(
  sub: string,
  email: string | null,
  tokenRoles: readonly string[],
): Promise<ShopStaffRecord> {
  return upsertOnContact(sub, email, tokenRoles);
}

/** Decide the manager gate from the platform record — role AND status AND shop scope. */
export async function isActiveShopManager(sub: string): Promise<boolean> {
  return authorizeShopManager(sub);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * May this operator refund part of this order — and if so, as which shop?
 *
 * Returns the shop id, or null for "no". ⚠ A lookup failure THROWS rather than answering null:
 * "we could not check" and "you may not" are different facts, and only one of them should make a
 * manager stop trying. An id that is not an order id cannot be this shop's order.
 */
export async function shopMayRefundOrder(sub: string, orderId: string): Promise<string | null> {
  if (!UUID.test(orderId)) return null;
  return authorizeShopRefund(sub, orderId);
}
