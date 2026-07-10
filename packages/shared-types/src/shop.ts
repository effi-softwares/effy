/**
 * Shop audience contracts — 007-shop-web, renamed by 008-shop-naming-unification.
 *
 * The shop Cognito pool defines two RBAC groups (constitution v1.6.0, Principle IV). The claim is
 * the ORIGIN of role assignment; the platform's `public.shop_staff` record is AUTHORITATIVE for
 * the access decision (role AND status AND shop scope).
 *
 * Consumed by `apps/shop-web` today and by `apps/shop-mobile` when it is bootstrapped — the two
 * surfaces of one audience, held at parity (docs/audiences/shop-capabilities.md).
 */

/** Shop RBAC roles. Prefixed so `manager` stays unambiguously the back-office role in logs. */
export type ShopRole = "shop_manager" | "shop_staff";

export const SHOP_ROLES: readonly ShopRole[] = ["shop_manager", "shop_staff"];

/** Platform-owned lifecycle. A disabled operator is denied despite an otherwise-valid token. */
export type ShopStaffStatus = "active" | "disabled";

/** Wire DTO for the assigned shop, embedded in GET /shop/v1/me. */
export interface ShopSummaryDTO {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/** Wire DTO for GET /shop/v1/me (contracts/shop-me.contract.md).
 *  `email` may be null until provisioning supplies it; `shop` is null for an unassigned
 *  operator — an expected state, not an error. */
export interface ShopStaffRecordDTO {
  subject: string;
  email: string | null;
  roles: string[];
  status: ShopStaffStatus;
  shop: ShopSummaryDTO | null;
  lastSeenAt: string;
}

/** Wire DTO for GET /shop/v1/manager-ping (contracts/shop-manager-ping.contract.md). */
export interface ShopManagerPingDTO {
  audience: "shop";
  scope: "shop_manager";
  subject: string;
  message: string;
}

/** Domain shapes the console renders — roles narrowed to known ShopRole. */
export interface ShopSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ShopStaffRecord {
  subject: string;
  email: string | null;
  roles: ShopRole[];
  status: ShopStaffStatus;
  shop: ShopSummary | null;
}

export interface ManagerPingResult {
  subject: string;
}

/**
 * Narrow arbitrary role strings to known roles.
 *
 * This is the client half of the versioning contract (docs/api/versioning-policy.md rule 4,
 * "tolerant readers"): a role the backend adds later maps to nothing here rather than throwing,
 * so an old client keeps working against a newer server.
 */
export function toShopRoles(input: readonly string[] | undefined): ShopRole[] {
  if (!input) return [];
  return input.filter((r): r is ShopRole => (SHOP_ROLES as readonly string[]).includes(r));
}

/** True when the operator can reach manager-only areas. The interface uses this to hide controls;
 *  the BACKEND independently enforces the same decision from the platform record — this is
 *  least-privilege UX, never the guard (FR-007). */
export function isShopManager(roles: readonly ShopRole[]): boolean {
  return roles.includes("shop_manager");
}
