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

import { api } from "@/lib/api";

import type {
  AuditEntry,
  DeliveryZone,
  Offering,
  OfferingListParams,
  Paged,
  ShopLocation,
  ShopOption,
  ZoneListParams,
  ZonePostcode,
} from "./model";

// The data layer for back-office delivery-zones & pricing. Every call maps DTO→domain (identity map
// here, since the contracts double as the domain shapes) so screens never touch the api client
// directly (Principle VI). All endpoints live under the admin cold-path service behind the shared
// gateway (contracts/delivery-api.contract.md §C).

function encodeZoneQuery({ page, pageSize, status, q }: ZoneListParams): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);
  if (q && q.trim()) params.set("q", q.trim());
  return params.toString();
}

function encodeOfferingQuery({
  page,
  pageSize,
  originZoneId,
  destinationZoneId,
}: OfferingListParams): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (originZoneId) params.set("originZoneId", originZoneId);
  if (destinationZoneId) params.set("destinationZoneId", destinationZoneId);
  return params.toString();
}

// ── Zones ──────────────────────────────────────────────────────────────────────────────────

export async function listZones(params: ZoneListParams): Promise<Paged<DeliveryZone>> {
  return api.get<PagedDTO<DeliveryZoneDTO>>(`/admin/v1/delivery-zones?${encodeZoneQuery(params)}`);
}

export async function createZone(body: CreateZoneRequest): Promise<DeliveryZone> {
  return api.post<DeliveryZoneDTO>("/admin/v1/delivery-zones", body);
}

export async function updateZone(id: string, body: UpdateZoneRequest): Promise<DeliveryZone> {
  return api.patch<DeliveryZoneDTO>(`/admin/v1/delivery-zones/${id}`, body);
}

export async function getZonePostcodes(
  id: string,
  page: number,
  pageSize: number,
): Promise<Paged<ZonePostcode>> {
  return api.get<PagedDTO<DeliveryZonePostcodeDTO>>(
    `/admin/v1/delivery-zones/${id}/postcodes?page=${page}&pageSize=${pageSize}`,
  );
}

export async function addPostcodes(
  id: string,
  body: AddPostcodesRequest,
): Promise<ZonePostcode[]> {
  return api.post<DeliveryZonePostcodeDTO[]>(`/admin/v1/delivery-zones/${id}/postcodes`, body);
}

export async function removePostcode(id: string, postcode: string): Promise<void> {
  await api.delete<void>(`/admin/v1/delivery-zones/${id}/postcodes/${postcode}`);
}

export async function getZoneHistory(
  id: string,
  page: number,
  pageSize: number,
): Promise<Paged<AuditEntry>> {
  return api.get<PagedDTO<AuditEntryDTO>>(
    `/admin/v1/delivery-zones/${id}/audit?page=${page}&pageSize=${pageSize}`,
  );
}

// ── Offerings (rates) ──────────────────────────────────────────────────────────────────────

export async function listOfferings(params: OfferingListParams): Promise<Paged<Offering>> {
  return api.get<PagedDTO<DeliveryOfferingDTO>>(
    `/admin/v1/delivery-offerings?${encodeOfferingQuery(params)}`,
  );
}

export async function createOffering(body: CreateOfferingRequest): Promise<Offering> {
  return api.post<DeliveryOfferingDTO>("/admin/v1/delivery-offerings", body);
}

export async function updateOffering(id: string, body: UpdateOfferingRequest): Promise<Offering> {
  return api.patch<DeliveryOfferingDTO>(`/admin/v1/delivery-offerings/${id}`, body);
}

// ── Shop location ──────────────────────────────────────────────────────────────────────────

export async function setShopLocation(
  shopId: string,
  body: SetShopLocationRequest,
): Promise<ShopLocation> {
  return api.patch<ShopLocationDTO>(`/admin/v1/shops/${shopId}/location`, body);
}

/** The shops to choose from when setting a location. Reuses the 009 shop register (there is no
 *  dedicated shop-location list endpoint in the contract). */
export async function listShopOptions(): Promise<ShopOption[]> {
  const page = await api.get<PagedDTO<ShopListItemDTO>>("/admin/v1/shops?page=1&pageSize=100");
  return page.items;
}
