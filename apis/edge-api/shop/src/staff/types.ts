export type ShopStaffStatus = "active" | "disabled";
export type ShopRole = "shop_manager" | "shop_staff";

/** Only `active` shops serve their operators. */
export type ShopLifecycleStatus = "active" | "suspended" | "disabled";

/** A groups value outside this set is filtered out before reconcile. */
export const KNOWN_ROLES: readonly ShopRole[] = ["shop_manager", "shop_staff"];

/** `null` on the record when unassigned. */
export interface ShopSummary {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
}

export interface ShopStaffRecord {
  subject: string;
  email: string | null;
  roles: ShopRole[];
  status: ShopStaffStatus;
  shop: ShopSummary | null;
  lastSeenAt: string;
}
