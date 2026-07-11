import type {
  AuditEntryDTO,
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  PagedDTO,
  ShopDetailDTO,
  ShopListItemDTO,
  ShopUserDTO,
  UpdateShopRequest,
  UpdateShopUserRequest,
} from "@effy/shared-types";

import { api } from "@/lib/api";

import type {
  AuditEntry,
  Paged,
  ShopDetail,
  ShopListItem,
  ShopListParams,
  ShopUser,
} from "./model";

// The data layer for back-office shop management. Every call maps DTO→domain (identity map here,
// since the contracts double as the domain shapes) so screens never touch the api client directly
// (Principle VI). All endpoints live under the admin cold-path service behind the shared gateway.

function encodeListQuery({ page, pageSize, status, q }: ShopListParams): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);
  if (q && q.trim()) params.set("q", q.trim());
  return params.toString();
}

export async function listShops(params: ShopListParams): Promise<Paged<ShopListItem>> {
  return api.get<PagedDTO<ShopListItemDTO>>(`/admin/v1/shops?${encodeListQuery(params)}`);
}

export async function getShop(id: string): Promise<ShopDetail> {
  return api.get<ShopDetailDTO>(`/admin/v1/shops/${id}`);
}

export async function getShopHistory(
  id: string,
  page: number,
  pageSize: number,
): Promise<Paged<AuditEntry>> {
  return api.get<PagedDTO<AuditEntryDTO>>(
    `/admin/v1/shops/${id}/audit?page=${page}&pageSize=${pageSize}`,
  );
}

export async function createShop(body: CreateShopRequest): Promise<ShopDetail> {
  return api.post<ShopDetailDTO>("/admin/v1/shops", body);
}

export async function updateShop(id: string, body: UpdateShopRequest): Promise<ShopDetail> {
  return api.patch<ShopDetailDTO>(`/admin/v1/shops/${id}`, body);
}

export async function changeShopStatus(
  id: string,
  body: ChangeShopStatusRequest,
): Promise<ShopDetail> {
  return api.post<ShopDetailDTO>(`/admin/v1/shops/${id}/status`, body);
}

export async function deleteShop(id: string): Promise<void> {
  await api.delete<void>(`/admin/v1/shops/${id}`);
}

export async function addShopUser(
  id: string,
  body: CreateShopUserRequest,
): Promise<ShopUser> {
  return api.post<ShopUserDTO>(`/admin/v1/shops/${id}/users`, body);
}

export async function updateShopUser(
  id: string,
  userId: string,
  body: UpdateShopUserRequest,
): Promise<ShopUser> {
  return api.patch<ShopUserDTO>(`/admin/v1/shops/${id}/users/${userId}`, body);
}
