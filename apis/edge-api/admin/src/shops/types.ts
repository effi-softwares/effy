// Domain types for back-office shop management (009-shop-management). Wire DTOs live in
// @effy/shared-types and are mapped explicitly in the handlers; these are the internal domain
// shapes and never leak wire concerns (constitution Principle VI). Mirrors data-model.md §5.

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
  createdAt: string;
  updatedAt: string;
}

export interface ShopDetail extends Shop {
  users: ShopUser[];
}

export interface ShopListItem {
  id: string;
  code: string;
  name: string;
  status: ShopLifecycleStatus;
  userCount: number;
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

// Domain exception → mapped to problem+json in the handler (no HTTP concern here).
export type ShopErrorKind =
  | "validation" // → 400
  | "conflict" // → 409 (duplicate code, email already a shop user, invalid transition, has dependents)
  | "not_found"; // → 404

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
