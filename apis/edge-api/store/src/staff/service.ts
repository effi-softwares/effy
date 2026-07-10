import { authorizeStoreManager, upsertOnContact } from "./repository";
import type { StoreStaffRecord } from "./types";

// Orchestration only: no HTTP, no SQL (constitution Principle VI).

/** Meet the operator, record them, hand back the platform's record of them. */
export async function recordAndLoad(
  sub: string,
  email: string | null,
  tokenRoles: readonly string[],
): Promise<StoreStaffRecord> {
  return upsertOnContact(sub, email, tokenRoles);
}

/** Decide the manager gate from the platform record — role AND status AND store scope. */
export async function isActiveStoreManager(sub: string): Promise<boolean> {
  return authorizeStoreManager(sub);
}
