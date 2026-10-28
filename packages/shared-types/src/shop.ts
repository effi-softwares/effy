/**
 * Shop audience contracts. The shop pool defines two groups; the claim is the origin of a role, and
 * `public.shop_staff` decides access (role, status and shop scope).
 */

/** Shop roles, prefixed so `manager` stays unambiguously back-office's in logs. */
import type { AustralianState } from "./delivery";

export type ShopRole = "shop_manager" | "shop_staff";

export const SHOP_ROLES: readonly ShopRole[] = ["shop_manager", "shop_staff"];

/** Platform-owned lifecycle: a disabled operator is refused despite a valid token. */
export type ShopStaffStatus = "active" | "disabled";

/** Shop lifecycle. Only `active` shops serve their operators; `suspended` (temporary) and
 *  `disabled` (retained for audit) both refuse. */
export type ShopLifecycleStatus = "active" | "suspended" | "disabled";

export const SHOP_LIFECYCLE_STATUSES: readonly ShopLifecycleStatus[] = [
  "active",
  "suspended",
  "disabled",
];

/** The assigned shop, embedded in GET /shop/v1/me. */
export interface ShopSummaryDTO {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
}

/** GET /shop/v1/me. `email` may be null until provisioning supplies it; `shop` is null for an
 *  unassigned operator (an expected state). */
export interface ShopStaffRecordDTO {
  subject: string;
  email: string | null;
  roles: string[];
  status: ShopStaffStatus;
  shop: ShopSummaryDTO | null;
  lastSeenAt: string;
}

/** What the console renders: roles narrowed to known ShopRole. */
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
}

/** Narrows role strings to known roles; one the backend adds later maps to nothing rather than throwing. */
export function toShopRoles(input: readonly string[] | undefined): ShopRole[] {
  if (!input) return [];
  return input.filter((r): r is ShopRole => (SHOP_ROLES as readonly string[]).includes(r));
}

/** True when the operator can reach manager-only areas. UX only: the backend enforces the same
 *  decision from the platform record. */
export function isShopManager(roles: readonly ShopRole[]): boolean {
  return roles.includes("shop_manager");
}

// Back-office shop management (/admin/v1/shops...): an operator managing many shops.

/** A paged-list envelope for server-side pagination.
 * @deprecated 103: lists answer `ListPage<T>` (`./list`), a superset of this; removed once no list uses it. */
export interface PagedDTO<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** A row in the shop register (GET /admin/v1/shops). */
export interface ShopListItemDTO {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  userCount: number;
  /** Whether an address is recorded, so the gap shows on the register; the address itself stays off lists. */
  hasAddress: boolean;
  /** How this shop's labels scanned over the last [sinceDays] days. Optional for an older deploy. */
  labelScanning?: { scanned: number; notScanned: number; sinceDays: number };
}

/** A shop user in the roster (embedded in ShopDetailDTO). */
export interface ShopUserDTO {
  id: string;
  subject: string;
  email: string | null;
  name: string | null;
  roles: ShopRole[];
  status: ShopStaffStatus;
  lastSeenAt: string | null;
}

/**
 * Where a shop is: an address only, never coordinates (nothing computes distance). Never reaches a
 * customer surface (guarded by a source test). Every field is nullable: the console shows the gap.
 */
export interface ShopAddressDTO {
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  /** Exactly four digits: a malformed value would match no delivery zone. */
  postcode: string | null;
  state: AustralianState | null;
}

// `AustralianState` comes from./delivery.

/** Full shop detail and roster (GET /admin/v1/shops/{id}). */
export interface ShopDetailDTO {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  contactPhone: string | null;
  notes: string | null;
  address: ShopAddressDTO;
  createdAt: string;
  updatedAt: string;
  users: ShopUserDTO[];
  /** How this shop's labels scanned over the last [sinceDays] days: scanned versus typed or ticked. Labels that often fail are printed badly. */
  labelScanning?: { scanned: number; notScanned: number; sinceDays: number };
  /** Every bag must be scanned as packed before the shop can mark it ready (`PUT /fleet/v1/shops/{id}/pack-scanning`).
   *  Optional for an older deploy. */
  packScanRequired?: boolean;
}

/** POST /admin/v1/shops: create a shop and provision its primary manager. */
export interface CreateShopRequest {
  code: string;
  name: string;
  contactPhone?: string | null;
  notes?: string | null;
  primaryContact: { name: string; email: string };
  addressLine1?: string | null;
  addressLine2?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  state?: AustralianState | null;
}

/** PATCH /admin/v1/shops/{id}: edit mutable details (the code is immutable). */
export interface UpdateShopRequest {
  name?: string;
  contactPhone?: string | null;
  notes?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  state?: AustralianState | null;
}

/** POST /admin/v1/shops/{id}/status: a lifecycle transition. */
export interface ChangeShopStatusRequest {
  status: ShopLifecycleStatus;
}

/** POST /admin/v1/shops/{id}/users: add a shop user. */
export interface CreateShopUserRequest {
  name: string;
  email: string;
  role: ShopRole;
}

/** PATCH /admin/v1/shops/{id}/users/{userId}: change role and/or status. */
export interface UpdateShopUserRequest {
  role?: ShopRole;
  status?: ShopStaffStatus;
}

/** An audit-log entry behind the shop and user history. */
export interface AuditEntryDTO {
  id: string;
  actorSub: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}
