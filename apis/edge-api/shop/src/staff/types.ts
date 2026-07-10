export type ShopStaffStatus = "active" | "disabled";
export type ShopRole = "shop_manager" | "shop_staff";

/** Roles the platform recognises. A cognito:groups value outside this set is filtered out before
 *  reconcile, so an unrelated group can never become a platform role. */
export const KNOWN_ROLES: readonly ShopRole[] = ["shop_manager", "shop_staff"];

/** The shop an operator is assigned to. `null` on the record when unassigned. */
export interface ShopSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ShopStaffRecord {
  subject: string; // cognito_sub — the platform's authoritative identity key
  email: string | null; // nullable: the access token may carry no email claim (research R6)
  roles: ShopRole[];
  status: ShopStaffStatus; // platform-owned
  shop: ShopSummary | null; // platform-owned
  lastSeenAt: string; // ISO 8601
}
