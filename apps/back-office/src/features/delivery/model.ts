import type {
  AddPostcodesRequest,
  AuditEntryDTO,
  CreateOfferingRequest,
  CreateZoneRequest,
  DeliveryOfferingDTO,
  DeliveryZoneDTO,
  DeliveryZonePostcodeDTO,
  PagedDTO,
  SetShopLocationRequest,
  ShopListItemDTO,
  ShopLocationDTO,
  UpdateOfferingRequest,
  UpdateZoneRequest,
} from "@effy/shared-types";

/**
 * Domain shapes for back-office delivery-zones & pricing management (021).
 *
 * The wire DTOs (specs/021 contracts, already in @effy/shared-types) are the domain shapes here —
 * they carry no wire-only encoding to strip. Every read/write still routes through the repo layer
 * (Principle VI), so if a DTO and its domain model ever diverge, only the repo changes. Mirrors 009.
 */
export type DeliveryZone = DeliveryZoneDTO;
export type ZonePostcode = DeliveryZonePostcodeDTO;
export type Offering = DeliveryOfferingDTO;
export type ShopLocation = ShopLocationDTO;
export type ShopOption = ShopListItemDTO;
export type AuditEntry = AuditEntryDTO;
export type Paged<T> = PagedDTO<T>;

export type {
  AddPostcodesRequest,
  CreateOfferingRequest,
  CreateZoneRequest,
  SetShopLocationRequest,
  UpdateOfferingRequest,
  UpdateZoneRequest,
};

/** Query params for the zone register (server-side pagination + filter + search). */
export interface ZoneListParams {
  page: number;
  pageSize: number;
  status?: import("@effy/shared-types").DeliveryStatus;
  q?: string;
}

/** Query params for the offering rate grid (server-side pagination + zone filters). */
export interface OfferingListParams {
  page: number;
  pageSize: number;
  originZoneId?: string;
  destinationZoneId?: string;
}
