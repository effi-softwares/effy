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

/** Domain shapes for shop management: the `@effy/shared-types` DTOs double as them, read through the repo layer. */
export type ShopListItem = ShopListItemDTO;
export type ShopDetail = ShopDetailDTO;
export type ShopUser = ShopUserDTO;
export type AuditEntry = AuditEntryDTO;
export type Paged<T> = PagedDTO<T>;

export type {
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  UpdateShopRequest,
  UpdateShopUserRequest,
};

/** Query params for the shop register (server-side pagination + filter + search). */
export interface ShopListParams {
  page: number;
  pageSize: number;
  status?: import("@effy/shared-types").ShopLifecycleStatus;
  q?: string;
}
