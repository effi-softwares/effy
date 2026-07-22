// Domain types for back-office delivery-zones & pricing management (021-delivery-zones-pricing).
// Wire DTOs live in @effy/shared-types and are mapped explicitly in the handlers; these are the
// internal domain shapes and never leak wire concerns (constitution Principle VI). Mirrors the 009
// shops slice. See data-model.md §1–§4 and contracts/delivery-api.contract.md §C.

export type DeliveryStatus = "active" | "disabled";
export type DeliveryMethod = "same_day" | "scheduled" | "standard";

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = ["active", "disabled"];
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["same_day", "scheduled", "standard"];

export interface DeliveryZone {
  id: string;
  code: string;
  name: string;
  status: DeliveryStatus;
  postcodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ZonePostcode {
  id: string;
  postcode: string;
}

export interface Offering {
  id: string;
  originZoneId: string;
  originZoneName: string;
  destinationZoneId: string;
  destinationZoneName: string;
  method: DeliveryMethod;
  priceAmount: string;
  leadDaysMin: number;
  leadDaysMax: number;
  sameDayCutoff: string | null;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShopLocation {
  shopId: string;
  shopCode: string;
  shopName: string;
  postcode: string | null;
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
export type DeliveryErrorKind =
  | "validation" // → 400
  | "conflict" // → 409 (duplicate zone code, postcode already zoned, duplicate offering)
  | "not_found"; // → 404

export interface FieldIssue {
  field: string;
  message: string;
}

export class DeliveryError extends Error {
  constructor(
    readonly kind: DeliveryErrorKind,
    message: string,
    readonly fields?: FieldIssue[],
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

export function isDeliveryError(err: unknown): err is DeliveryError {
  return err instanceof DeliveryError;
}
