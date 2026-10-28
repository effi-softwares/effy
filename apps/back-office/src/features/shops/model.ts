import type { AuditEntryDTO, ListPage, ShopDetailDTO, ShopListItemDTO, ShopUserDTO } from "@effy/shared-types"

export type ShopListItem = ShopListItemDTO
export type ShopDetail = ShopDetailDTO
export type ShopUser = ShopUserDTO
export type AuditEntry = AuditEntryDTO
export type Paged<T> = ListPage<T>

export interface ShopListParams {
  page: number
  pageSize: number
  status?: import("@effy/shared-types").ShopLifecycleStatus
  q?: string
}
