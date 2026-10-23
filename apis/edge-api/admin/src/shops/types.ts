import type { ShopAddressDTO } from "@effy/shared-types";

export type ShopLifecycleStatus = "active" | "suspended" | "disabled";
export type ShopStaffStatus = "active" | "disabled";
export type ShopRole = "shop_manager" | "shop_staff";

export const SHOP_ROLES: readonly ShopRole[] = ["shop_manager", "shop_staff"];
export const SHOP_LIFECYCLE_STATUSES: readonly ShopLifecycleStatus[] = [
  "active",
  "suspended",
  "disabled",
];

export interface ShopUser {
  id: string;
  subject: string;
  email: string | null;
  name: string | null;
  roles: ShopRole[];
  status: ShopStaffStatus;
  lastSeenAt: string | null;
}

export interface Shop {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  contactPhone: string | null;
  notes: string | null;
  /** Where a driver collects from. Address only, no coordinates. */
  address: ShopAddressDTO;
  createdAt: string;
  updatedAt: string;
}

export interface ShopDetail extends Shop {
  users: ShopUser[];
  /** How this shop's labels scanned over the last [sinceDays] days. */
  labelScanning?: { scanned: number; notScanned: number; sinceDays: number };
  /** Every bag must be scanned as packed before ready. Written only by fleet. */
  packScanRequired?: boolean;
}

export interface ShopListItem {
  hasAddress: boolean;
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  userCount: number;
  labelScanning: { scanned: number; notScanned: number; sinceDays: number };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  actorSub: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export type ShopErrorKind =
  | "validation" // → 400
  | "conflict" // → 409 (duplicate code, email already a shop user, invalid transition, has dependents)
  | "not_found";

export interface FieldIssue {
  field: string;
  message: string;
}

export class ShopError extends Error {
  constructor(
    readonly kind: ShopErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "ShopError";
  }
}

export function isShopError(err: unknown): err is ShopError {
  return err instanceof ShopError;
}
