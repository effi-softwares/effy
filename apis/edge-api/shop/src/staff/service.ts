import { authorizeShopManager, upsertOnContact } from "./repository";
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
