/**
 * Store (shop) audience contracts — 007-shop-web.
 *
 * The shop Cognito pool defines two RBAC groups (constitution v1.5.0, Principle IV). The claim is
 * the ORIGIN of role assignment; the platform's `public.store_staff` record is AUTHORITATIVE for
 * the access decision (role AND status AND store scope).
 *
 * Consumed by `apps/shop-web` today and by `apps/shop-mobile` when it is bootstrapped — the two
 * surfaces of one audience, held at parity (docs/audiences/store-capabilities.md).
 */

/** Store RBAC roles. Prefixed so `manager` stays unambiguously the back-office role in logs. */
export type StoreRole = "store_manager" | "store_staff";

export const STORE_ROLES: readonly StoreRole[] = ["store_manager", "store_staff"];

/** Platform-owned lifecycle. A disabled operator is denied despite an otherwise-valid token. */
export type StoreStaffStatus = "active" | "disabled";

/** Wire DTO for the assigned store, embedded in GET /store/v1/me. */
export interface StoreSummaryDTO {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

/** Wire DTO for GET /store/v1/me (contracts/store-me.contract.md).
 *  `email` may be null until provisioning supplies it; `store` is null for an unassigned
 *  operator — an expected state, not an error. */
export interface StoreStaffRecordDTO {
  subject: string;
  email: string | null;
  roles: string[];
  status: StoreStaffStatus;
  store: StoreSummaryDTO | null;
  lastSeenAt: string;
}

/** Wire DTO for GET /store/v1/manager-ping (contracts/store-manager-ping.contract.md). */
export interface StoreManagerPingDTO {
  audience: "store";
  scope: "store_manager";
  subject: string;
  message: string;
}

/** Domain shapes the console renders — roles narrowed to known StoreRole. */
export interface StoreSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface StoreStaffRecord {
  subject: string;
  email: string | null;
  roles: StoreRole[];
  status: StoreStaffStatus;
  store: StoreSummary | null;
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
export function toStoreRoles(input: readonly string[] | undefined): StoreRole[] {
  if (!input) return [];
  return input.filter((r): r is StoreRole => (STORE_ROLES as readonly string[]).includes(r));
}

/** True when the operator can reach manager-only areas. The interface uses this to hide controls;
 *  the BACKEND independently enforces the same decision from the platform record — this is
 *  least-privilege UX, never the guard (FR-007). */
export function isStoreManager(roles: readonly StoreRole[]): boolean {
  return roles.includes("store_manager");
}
