import type {
  ListPage,
  ListViews,
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  ShopDetailDTO,
  ShopListItemDTO,
  ShopUserDTO,
  UpdateShopRequest,
  UpdateShopUserRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

import type { Paged, ShopDetail, ShopListItem, ShopListParams, ShopUser } from "./model"
import type { ShopView } from "./list"

function encodeListQuery({ page, pageSize, status, q }: ShopListParams): string {
  const params = new URLSearchParams()
  params.set("page", String(page))
  params.set("pageSize", String(pageSize))
  if (status) params.set("status", status)
  if (q && q.trim()) params.set("q", q.trim())
  return params.toString()
}

export async function setPackScanning(id: string, required: boolean): Promise<{ shopId: string; required: boolean }> {
  return api.put(`/fleet/v1/shops/${id}/pack-scanning`, { required })
}

export async function listShops(params: ShopListParams): Promise<Paged<ShopListItem>> {
  return api.get<ListPage<ShopListItemDTO>>(`/admin/v1/shops?${encodeListQuery(params)}`)
}

/** The register as a console list (103): one page for the address's view. */
export function fetchShopPage(qs: URLSearchParams, signal: AbortSignal): Promise<ListPage<ShopListItem>> {
  return api.get<ListPage<ShopListItemDTO>>(`/admin/v1/shops?${qs}`, { signal })
}

/** The register's status counts for the search, in one request. */
export function fetchShopViews(qs: URLSearchParams, signal: AbortSignal): Promise<ListViews<ShopView>> {
  return api.get<ListViews<ShopView>>(`/admin/v1/shops?${qs}`, { signal })
}

export async function getShop(id: string): Promise<ShopDetail> {
  return api.get<ShopDetailDTO>(`/admin/v1/shops/${id}`)
}

/** One page of a shop's history, newest first (103, keyset). */
export async function createShop(body: CreateShopRequest): Promise<ShopDetail> {
  return api.post<ShopDetailDTO>("/admin/v1/shops", body)
}

export async function updateShop(id: string, body: UpdateShopRequest): Promise<ShopDetail> {
  return api.patch<ShopDetailDTO>(`/admin/v1/shops/${id}`, body)
}

export async function changeShopStatus(id: string, body: ChangeShopStatusRequest): Promise<ShopDetail> {
  return api.post<ShopDetailDTO>(`/admin/v1/shops/${id}/status`, body)
}

export async function deleteShop(id: string): Promise<void> {
  await api.delete<void>(`/admin/v1/shops/${id}`)
}

export async function addShopUser(id: string, body: CreateShopUserRequest): Promise<ShopUser> {
  return api.post<ShopUserDTO>(`/admin/v1/shops/${id}/users`, body)
}

export async function updateShopUser(id: string, userId: string, body: UpdateShopUserRequest): Promise<ShopUser> {
  return api.patch<ShopUserDTO>(`/admin/v1/shops/${id}/users/${userId}`, body)
}
