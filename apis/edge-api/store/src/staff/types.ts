export type StoreStaffStatus = "active" | "disabled";
export type StoreRole = "store_manager" | "store_staff";

/** Roles the platform recognises. A cognito:groups value outside this set is filtered out before
 *  reconcile, so an unrelated group can never become a platform role. */
export const KNOWN_ROLES: readonly StoreRole[] = ["store_manager", "store_staff"];

/** The store an operator is assigned to. `null` on the record when unassigned. */
export interface StoreSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface StoreStaffRecord {
  subject: string; // cognito_sub — the platform's authoritative identity key
  email: string | null; // nullable: the access token may carry no email claim (research R6)
  roles: StoreRole[];
  status: StoreStaffStatus; // platform-owned
  store: StoreSummary | null; // platform-owned
  lastSeenAt: string; // ISO 8601
}
