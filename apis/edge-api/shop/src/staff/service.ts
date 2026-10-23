import { authorizeShopRefund, upsertOnContact } from "./repository";
import type { ShopStaffRecord } from "./types";

/** Records the operator and returns the platform's record. */
export async function recordAndLoad(
  sub: string,
  email: string | null,
  tokenRoles: readonly string[],
): Promise<ShopStaffRecord> {
  return upsertOnContact(sub, email, tokenRoles);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The shop id, or null for "no". A lookup failure throws: "could not check" is not "may not". */
export async function shopMayRefundOrder(sub: string, orderId: string): Promise<string | null> {
  if (!UUID.test(orderId)) return null;
  return authorizeShopRefund(sub, orderId);
}
